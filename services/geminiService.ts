
import { GoogleGenAI, Part, Content, File as GeminiFile, UploadFileConfig, UsageMetadata } from "@google/genai";
import { GeminiService, ChatHistoryItem, ModelOption, AppSettings, ThoughtSupportingPart } from '../types';
import { logService } from "./logService";
import { fileToBase64 } from "../utils/appUtils";

const POLLING_INTERVAL_MS = 2000;
const MAX_POLLING_DURATION_MS = 10 * 60 * 1000;

class GeminiServiceImpl implements GeminiService {
    private currentAppSettings: AppSettings | null = null;

    constructor() {
        logService.info("GeminiService created (Hybrid Proxy Mode).");
    }
    
    public updateSettings(settings: AppSettings): void {
        this.currentAppSettings = settings;
        logService.info("GeminiService settings updated.");
    }

    // _getClient 现在恢复到最简单的状态，不再处理代理
    private _getClient(apiKey: string): GoogleGenAI {
        return new GoogleGenAI({ apiKey });
    }

    private _getApiClientOrThrow(apiKey?: string | null): GoogleGenAI {
        if (!apiKey) {
            const silentError = new Error("API key is not configured in settings or provided.");
            silentError.name = "SilentError";
            throw silentError;
        }
        return this._getClient(apiKey);
    }

    /**
     * [核心修复] 一个安全的网络请求包装器.
     * 它会在执行API调用前，按需、临时地替换全局fetch函数.
     * @param apiCall 需要被包装的API调用函数
     */
    private async _withProxyFetch<T>(apiCall: () => Promise<T>): Promise<T> {
        if (!this.currentAppSettings) {
            throw new Error("Service settings have not been initialized.");
        }

        const proxyUrl = this.currentAppSettings.apiProxyUrl?.trim();
        
        // 如果用户没有在设置中提供代理地址，则直接执行原始API调用，不做任何拦截
        if (!proxyUrl) {
            return await apiCall();
        }

        const originalFetch = globalThis.fetch;
        const GOOGLE_HOSTNAMES = new Set([
            'generativelanguage.googleapis.com',
            'upload.generativelanguage.googleapis.com',
        ]);
        let isInterceptorActive = false;

        logService.info(`[PROXY WRAPPER] Activating for API call. Target: ${proxyUrl}`);

        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            // 构造可解析的 URL
            let requestUrl: URL | null = null;
            let baseHeaders: Headers | null = null;
            let methodFromRequest: string | undefined;
            let bodyFromRequest: BodyInit | undefined;
            let credentialsFromRequest: RequestCredentials | undefined;
            try {
                if (input instanceof Request) {
                    requestUrl = new URL(input.url);
                    baseHeaders = new Headers(input.headers);
                    methodFromRequest = input.method;
                    // 注意：读取 body 可能已被消费，这里尽量保留 init 的 body 优先
                    // @ts-ignore
                    bodyFromRequest = undefined;
                    credentialsFromRequest = input.credentials as RequestCredentials | undefined;
                } else if (input instanceof URL) {
                    requestUrl = new URL(input.toString());
                } else if (typeof input === 'string') {
                    requestUrl = new URL(input);
                }
            } catch {
                // 如果无法解析 URL，则回退到原始 fetch
                return originalFetch(input as any, init as any);
            }

            if (!requestUrl) {
                return originalFetch(input as any, init as any);
            }

            const proxy = proxyUrl ? new URL(proxyUrl) : null;

            // 处理到 Google 官方域名的请求：改写为代理域名
            if (GOOGLE_HOSTNAMES.has(requestUrl.hostname)) {
                isInterceptorActive = true;
                if (!proxy) {
                    // 没有配置代理则直接放行
                    return originalFetch(input as any, init as any);
                }
                const originalPath = requestUrl.pathname;
                    const newPath = (proxy.pathname + originalPath).replace(/\/+/g, '/');

                const proxiedUrl = new URL(requestUrl.toString());
                proxiedUrl.hostname = proxy.hostname;
                proxiedUrl.port = proxy.port;
                proxiedUrl.protocol = proxy.protocol;
                proxiedUrl.pathname = newPath;

                // 如果 URL 上带有 key=sk-...，也转为 Authorization 并移除 query key
                const keyParam = proxiedUrl.searchParams.get('key');
                if (keyParam && keyParam.startsWith('sk-')) {
                    proxiedUrl.searchParams.delete('key');
                }

                // 合并 headers（init 优先，其次原始 Request 的 headers）
                const headers = new Headers((init?.headers as any) || baseHeaders || {});
                try {
                    // 查找 x-goog-api-key（大小写不敏感），必要时转为 Authorization: Bearer
                    let apiKeyHeaderName: string | null = null;
                    for (const [k] of headers.entries()) {
                        if (k.toLowerCase() === 'x-goog-api-key') { apiKeyHeaderName = k; break; }
                    }
                    if (apiKeyHeaderName) {
                        const keyVal = headers.get(apiKeyHeaderName) || '';
                        if (keyVal.startsWith('sk-')) {
                            headers.set('authorization', `Bearer ${keyVal}`);
                            headers.delete(apiKeyHeaderName);
                            logService.info('[PROXY WRAPPER] Converted x-goog-api-key to Authorization: Bearer for proxy use');
                        }
                    }
                    // 若 query 中带 key=sk-...，也补充 Authorization 头
                    if (!headers.has('authorization') && keyParam && keyParam.startsWith('sk-')) {
                        headers.set('authorization', `Bearer ${keyParam}`);
                        logService.info('[PROXY WRAPPER] Moved query key to Authorization header for proxy use');
                    }
                } catch {}

                const nextInit: RequestInit = {
                    ...init,
                    method: init?.method || methodFromRequest,
                    headers,
                    body: init?.body ?? bodyFromRequest,
                    credentials: init?.credentials ?? credentialsFromRequest,
                };

                // 如果 body 仍为空且原始输入为 Request，尝试克隆读取文本以保留请求体（避免 JSON 丢失）
                try {
                    const method = (nextInit.method || 'GET').toUpperCase();
                    if (!nextInit.body && input instanceof Request && method !== 'GET' && method !== 'HEAD') {
                        const cloned = input.clone();
                        const textBody = await cloned.text();
                        if (textBody) nextInit.body = textBody as any;
                    }
                } catch {}

                logService.info(`[PROXY WRAPPER] Redirecting fetch to ${proxiedUrl.toString()}`);
                return originalFetch(proxiedUrl.toString(), nextInit);
            }
            // 处理已经指向代理域名的请求：不改写 URL，但也做 header 与 query 的兼容处理
            if (proxy && requestUrl.hostname === proxy.hostname) {
                isInterceptorActive = true;
                // 合并 headers
                const headers = new Headers((init?.headers as any) || baseHeaders || {});
                let apiKeyHeaderName: string | null = null;
                for (const [k] of headers.entries()) {
                    if (k.toLowerCase() === 'x-goog-api-key') { apiKeyHeaderName = k; break; }
                }
                const keyParam = requestUrl.searchParams.get('key');
                if (apiKeyHeaderName) {
                    const keyVal = headers.get(apiKeyHeaderName) || '';
                    if (keyVal.startsWith('sk-')) {
                        headers.set('authorization', `Bearer ${keyVal}`);
                        headers.delete(apiKeyHeaderName);
                        logService.info('[PROXY WRAPPER] Converted x-goog-api-key to Authorization: Bearer (direct proxy path)');
                    }
                }
                if (!headers.has('authorization') && keyParam && keyParam.startsWith('sk-')) {
                    headers.set('authorization', `Bearer ${keyParam}`);
                    requestUrl.searchParams.delete('key');
                    logService.info('[PROXY WRAPPER] Moved query key to Authorization header (direct proxy path)');
                }
                const nextInit: RequestInit = {
                    ...init,
                    method: init?.method || methodFromRequest,
                    headers,
                    body: init?.body ?? bodyFromRequest,
                    credentials: init?.credentials ?? credentialsFromRequest,
                };
                // 同样处理请求体保留
                try {
                    const method = (nextInit.method || 'GET').toUpperCase();
                    if (!nextInit.body && input instanceof Request && method !== 'GET' && method !== 'HEAD') {
                        const cloned = input.clone();
                        const textBody = await cloned.text();
                        if (textBody) nextInit.body = textBody as any;
                    }
                } catch {}
                return originalFetch(requestUrl.toString(), nextInit);
            }
            // 其他域名直接放行
            return originalFetch(input as any, init as any);
        };

        try {
            // 执行真正的API调用（此时全局fetch已被临时替换）
            return await apiCall();
        } finally {
            // 无论成功还是失败，都必须在最后恢复原始的fetch函数，这至关重要！
            globalThis.fetch = originalFetch;
            if (isInterceptorActive) {
                logService.info("[PROXY WRAPPER] Restored original fetch.");
            }
        }
    }

    private _buildGenerationConfig(
    modelId: string, systemInstruction: string, config: { temperature?: number; topP?: number }, showThoughts: boolean,
    thinkingBudget: number, isGoogleSearchEnabled?: boolean, isCodeExecutionEnabled?: boolean, isUrlContextEnabled?: boolean
    ): any {
    // Mark certain parameters as intentionally unused for now
    void modelId; void showThoughts; void thinkingBudget;
        const generationConfig: any = { ...config };
        if (systemInstruction) generationConfig.systemInstruction = systemInstruction;
        const tools = generationConfig.tools || [];
        if (isGoogleSearchEnabled) tools.push({ googleSearch: {} });
        if (isCodeExecutionEnabled) tools.push({ codeExecution: {} });
        // URL Context 功能在 Gemini API 中通常通过 tools 实现，但具体实现可能需要根据 API 文档调整
        if (isUrlContextEnabled) {
            // 这里可以根据实际 API 需求添加 URL Context 的配置
            logService.info("URL Context enabled - specific implementation may vary based on API capabilities");
        }
        if (tools.length > 0) generationConfig.tools = tools;
        return generationConfig;
    }

    // --- 所有公开方法现在都使用 _withProxyFetch 包装 ---
    
    async getAvailableModels(apiKeysString: string | null): Promise<ModelOption[]> {
        return this._withProxyFetch(async () => {
            const keys = (apiKeysString || '').split('\n').map(k => k.trim()).filter(Boolean);
            if (keys.length === 0) throw new Error("API key not configured.");
            const randomKey = keys[Math.floor(Math.random() * keys.length)];
            const ai = this._getClient(randomKey);
            
            const modelPager = await ai.models.list();
            const availableModels: ModelOption[] = [];
            for await (const model of modelPager) {
                if (model.name) {
                    availableModels.push({
                        id: model.name,
                        name: model.displayName || model.name.split('/').pop() || model.name,
                        isPinned: false,
                    });
                }
            }
            return availableModels.sort((a, b) => a.name.localeCompare(b.name));
        });
    }

    async uploadFile(apiKey: string, file: File, mimeType: string, displayName: string, signal: AbortSignal): Promise<GeminiFile> {
        return this._withProxyFetch(async () => {
            const ai = this._getApiClientOrThrow(apiKey);
            const uploadConfig: UploadFileConfig = { mimeType, displayName: encodeURIComponent(displayName) };
            let uploadedFile = await ai.files.upload({ file, config: uploadConfig });
            const startTime = Date.now();
            while (uploadedFile.state === 'PROCESSING' && (Date.now() - startTime) < MAX_POLLING_DURATION_MS) {
                if (signal.aborted) {
                    const abortError = new Error("Upload polling cancelled by user.");
                    abortError.name = "AbortError";
                    throw abortError;
                }
                await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
                if (typeof uploadedFile.name === 'string' && uploadedFile.name) {
                    uploadedFile = await ai.files.get({ name: uploadedFile.name });
                }
            }
            return uploadedFile;
        });
    }
    
    async getFileMetadata(apiKey: string, fileApiName: string): Promise<GeminiFile | null> {
        return this._withProxyFetch(async () => {
            const ai = this._getApiClientOrThrow(apiKey);
            try {
                return await ai.files.get({ name: fileApiName });
            } catch (error) {
                if (error instanceof Error && (error.message.includes('NOT_FOUND') || error.message.includes('404'))) {
                    return null;
                }
                throw error;
            }
        });
    }

    async generateImages(apiKey: string, modelId: string, prompt: string, aspectRatio: string, abortSignal: AbortSignal): Promise<string[]> {
        return this._withProxyFetch(async () => {
            const ai = this._getApiClientOrThrow(apiKey);
        if (abortSignal?.aborted) throw new Error('aborted');
            // @ts-ignore
            const response = await ai.models.generateImages({ model: modelId, prompt, config: { aspectRatio, numberOfImages: 1, outputMimeType: 'image/jpeg' } });
        if (abortSignal?.aborted) throw new Error('aborted');
            return response.generatedImages?.map((img: any) => img?.image?.imageBytes).filter(Boolean) ?? [];
        });
    }

    async generateSpeech(apiKey: string, modelId: string, text: string, voice: string, abortSignal: AbortSignal): Promise<string> {
        return this._withProxyFetch(async () => {
            const ai = this._getApiClientOrThrow(apiKey);
        if (abortSignal?.aborted) throw new Error('aborted');
            // @ts-ignore
            const response = await ai.models.generateContent({ 
                model: modelId, 
                contents: text, 
                config: { 
                    responseModalities: ['AUDIO'], 
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } 
                } 
            });
        if (abortSignal?.aborted) throw new Error('aborted');
            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (typeof audioData === 'string') return audioData;
            throw new Error('No audio data received');
        });
    }

    async transcribeAudio(apiKey: string, audioFile: File, modelId: string, isThinkingEnabled: boolean): Promise<string> {
        return this._withProxyFetch(async () => {
            const ai = this._getApiClientOrThrow(apiKey);
            const audioBase64 = await fileToBase64(audioFile);
            const audioPart: Part = { inlineData: { mimeType: audioFile.type, data: audioBase64 } };
            const textPart: Part = { text: isThinkingEnabled ? "Transcribe this audio carefully and return verbatim text only." : "Transcribe this audio." };
            const response = await ai.models.generateContent({ model: modelId, contents: { parts: [textPart, audioPart] } });
            if (response.text) return response.text;
            throw new Error("Transcription failed.");
        });
    }

    async generateTitle(apiKey: string, userContent: string, modelContent: string, language: string): Promise<string> {
        return this._withProxyFetch(async () => {
            const ai = this._getApiClientOrThrow(apiKey);
            
            const prompt = language === 'zh'
                ? `根据以下对话，创建一个非常简短、简洁的标题（最多4-6个词）。不要使用引号或任何其他格式。只返回标题的文本。\n\n用户: "${userContent}"\n助手: "${modelContent}"\n\n标题:`
                : `Based on this conversation, create a very short, concise title (4-6 words max). Do not use quotes or any other formatting. Just return the text of the title.\n\nUSER: "${userContent}"\nASSISTANT: "${modelContent}"\n\nTITLE:`;

            const response = await ai.models.generateContent({ 
                model: 'gemini-2.0-flash-thinking-exp',
                contents: prompt,
                config: {
                    temperature: 0.3,
                    topP: 0.9
                }
            });
            
            if (response.text) {
                // Clean up the title: remove quotes, trim whitespace
                let title = response.text.trim();
                if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
                    title = title.substring(1, title.length - 1);
                }
                return title;
            } else {
                throw new Error("Title generation failed. The model returned an empty response.");
            }
        });
    }

    async generateSuggestions(apiKey: string, userContent: string, modelContent: string, language: string): Promise<string[]> {
        return this._withProxyFetch(async () => {
            const ai = this._getApiClientOrThrow(apiKey);
            
            const prompt = language === 'zh'
                ? `你是对话续写助手。基于“用户上一条提问”和“助手刚给出的回答”，生成三条“下一步追问”风格的建议，严格要求：\n- 只给出简短的中文问题句（10~25字左右），不要陈述句、不要前后缀、不要引号、不要编号或额外解释。\n- 必须紧密基于助手回答的关键点向下钻取，体现递进关系（例如：细化定义、请求例子、验证边界、对比方案、落地执行）。\n- 三条需彼此多样。\n\n用户上一条: "${userContent}"\n助手回答: "${modelContent}"\n\n现在仅输出三行，每行一条“下一步追问”的短问题（不加编号）：`
                : `You are a follow-up suggester. Given the user's last question and the assistant's answer, produce three short follow-up questions that deepen the topic. Constraints:\n- Output only short English questions (roughly 5–12 words). No quotes, no numbering, no prefixes/suffixes.\n- Each must be tightly grounded in the assistant's answer, showing progression (clarify a term, request examples, test edge cases, compare options, outline steps).\n- Make them diverse.\n\nUSER: "${userContent}"\nASSISTANT: "${modelContent}"\n\nReturn exactly three lines, one follow-up question per line (no numbering):`;

            const response = await ai.models.generateContent({ 
                model: 'gemini-2.0-flash-thinking-exp',
                contents: prompt,
                config: {
                    temperature: 0.8,
                    topP: 0.95
                }
            });
            
            if (response.text) {
                // 解析与清洗：
                // - 去掉可能的编号/符号/引号
                // - 仅保留问句风格的短文本
                const cleaned = response.text
                    .trim()
                    .split('\n')
                    .map((s: string) => s
                        .replace(/^[-*•\d)（）.\s]+/, '')
                        .replace(/^\d+\.?\s*/, '')
                        .replace(/^['"“”‘’]+|['"“”‘’]+$/g, '')
                        .trim()
                    )
                    .filter(Boolean);

                // 仅取前三条，并限制长度，尽量确保为问题句（以? 结尾或以疑问词开头）
                const isLikelyQuestion = (s: string) => /[?？]$/.test(s) || /^(how|what|why|which|when|where|who|can|should|could|是否|怎么|如何|为何|哪些|什么)/i.test(s);
                const bounded = cleaned
                    .map(s => s.length > 60 ? s.slice(0, 58).replace(/[，。,.\s]*$/, '') + '？' : s)
                    .filter(isLikelyQuestion)
                    .slice(0, 3);
                return bounded.length > 0 ? bounded : cleaned.slice(0, 3);
            } else {
                throw new Error("Suggestions generation returned an empty response.");
            }
        });
    }

    async sendMessageStream(
        apiKey: string, modelId: string, history: ChatHistoryItem[], systemInstruction: string, config: { temperature?: number; topP?: number },
        showThoughts: boolean, thinkingBudget: number, isGoogleSearchEnabled: boolean, isCodeExecutionEnabled: boolean, isUrlContextEnabled: boolean, abortSignal: AbortSignal,
        onPart: (part: Part) => void, onThoughtChunk: (chunk: string) => void, onError: (error: Error) => void, onComplete: (usageMetadata?: UsageMetadata, groundingMetadata?: any) => void
    ): Promise<void> {
        await this._withProxyFetch(async () => {
            try {
                const ai = this._getApiClientOrThrow(apiKey);
                const contents = history.map(item => ({ role: item.role, parts: item.parts }));
                const generationConfig = this._buildGenerationConfig(modelId, systemInstruction, config, showThoughts, thinkingBudget, isGoogleSearchEnabled, isCodeExecutionEnabled, isUrlContextEnabled);
                const streamResult = await ai.models.generateContentStream({ model: modelId, contents, ...generationConfig });
                let finalResponse: any;
                for await (const chunkResponse of streamResult) {
                    if (abortSignal?.aborted) {
                        throw new Error('aborted');
                    }
                    // thought 分片（如果有）
                    const maybeThought = (chunkResponse as any)?.candidates?.[0]?.content?.parts?.find((p: any) => p?.thought) as any | undefined;
                    if (maybeThought && typeof maybeThought.text === 'string') {
                        onThoughtChunk(maybeThought.text);
                    }
                    const part = chunkResponse.candidates?.[0]?.content?.parts?.[0];
                    if (part) onPart(part);
                    finalResponse = chunkResponse;
                }
                onComplete(finalResponse?.usageMetadata, finalResponse?.candidates?.[0]?.groundingMetadata);
            } catch (error) {
                onError(error as Error);
            }
        });
    }
    
    async sendMessageNonStream(
        apiKey: string, modelId: string, history: ChatHistoryItem[], systemInstruction: string, config: { temperature?: number; topP?: number },
        showThoughts: boolean, thinkingBudget: number, isGoogleSearchEnabled: boolean, isCodeExecutionEnabled: boolean, isUrlContextEnabled: boolean, abortSignal: AbortSignal,
        onError: (error: Error) => void, onComplete: (parts: Part[], thoughtsText?: string, usageMetadata?: UsageMetadata, groundingMetadata?: any) => void
    ): Promise<void> {
        await this._withProxyFetch(async () => {
            try {
                if (abortSignal?.aborted) {
                    throw new Error('aborted');
                }
                const ai = this._getApiClientOrThrow(apiKey);
                const generationConfig = this._buildGenerationConfig(modelId, systemInstruction, config, showThoughts, thinkingBudget, isGoogleSearchEnabled, isCodeExecutionEnabled, isUrlContextEnabled);
                const response = await ai.models.generateContent({ model: modelId, contents: history as Content[], ...generationConfig });
                if (abortSignal?.aborted) {
                    throw new Error('aborted');
                }
                
                let thoughtsText = "";
                const responseParts: Part[] = [];
                if (response.candidates && response.candidates[0]?.content?.parts) {
                    for (const part of response.candidates[0].content.parts) {
                        const pAsThoughtSupporting = part as ThoughtSupportingPart;
                        if (pAsThoughtSupporting.thought) {
                            thoughtsText += part.text;
                        } else {
                            responseParts.push(part);
                        }
                    }
                }
                if (responseParts.length === 0 && response.text) {
                    responseParts.push({ text: response.text });
                }
                
                onComplete(responseParts, thoughtsText || undefined, response.usageMetadata, response.candidates?.[0]?.groundingMetadata);
            } catch (error) {
                onError(error as Error);
            }
        });
    }

    async processTextInChunks(
        apiKey: string, modelId: string, text: string, systemInstruction: string, config: { temperature?: number; topP?: number },
        abortSignal: AbortSignal, onChunkProcessed: (chunkIndex: number, totalChunks: number, summary: string) => void,
        onComplete: (finalSummary: string) => void, onError: (error: Error) => void,
        maxChunkSize: number = 8000 // 允许自定义分段大小
    ): Promise<void> {
        try {
            const chunks = this._splitTextIntoChunks(text, maxChunkSize);
            const chunkSummaries: string[] = [];

            logService.info(`Processing text in ${chunks.length} chunks (max size: ${maxChunkSize})`);

            for (let i = 0; i < chunks.length; i++) {
                if (abortSignal.aborted) {
                    onError(new Error('Processing aborted by user'));
                    return;
                }

                const chunk = chunks[i];
                // 根据内容类型使用不同的提示词
                let chunkPrompt = '';
                if (text.includes('用户:') || text.includes('User:') || text.includes('[') || text.includes('时间:')) {
                    // 聊天记录格式
                    chunkPrompt = `请分析以下聊天记录片段（第${i + 1}部分，共${chunks.length}部分）：\n\n${chunk}\n\n请提供对话要点总结，包括：\n1. 主要讨论话题\n2. 关键信息或决定\n3. 参与者观点\n4. 重要结论或待办事项`;
                } else {
                    // 普通文档格式
                    chunkPrompt = `请仔细阅读并理解以下文本片段（第${i + 1}部分，共${chunks.length}部分）：\n\n${chunk}\n\n请提供简洁准确的摘要：`;
                }

                await new Promise<void>((resolve, reject) => {
                    this.sendMessageNonStream(
                        apiKey, modelId, [{ role: 'user', parts: [{ text: chunkPrompt }] }], systemInstruction, config,
                        false, 1000, false, false, false, abortSignal,
                        (error: Error) => reject(error),
                        (parts: Part[]) => {
                            const summary = parts.map(p => p.text || '').join('');
                            chunkSummaries.push(summary);
                            onChunkProcessed(i + 1, chunks.length, summary);
                            resolve();
                        }
                    );
                });
            }

            if (!abortSignal.aborted && chunkSummaries.length > 1) {
                // 根据内容类型生成不同的综合报告
                let finalPrompt = '';
                if (text.includes('用户:') || text.includes('User:') || text.includes('[') || text.includes('时间:')) {
                    // 聊天记录综合分析
                    finalPrompt = `基于以下聊天记录分段摘要，生成综合分析报告：\n\n${chunkSummaries.map((summary, index) => `第${index + 1}部分摘要：${summary}`).join('\n\n')}\n\n请提供：\n1. 整体对话主题和发展脉络\n2. 关键决策和重要信息汇总\n3. 参与者的主要观点和立场\n4. 未解决的问题或后续行动项\n5. 整体对话价值和意义`;
                } else {
                    // 普通文档综合分析
                    finalPrompt = `基于以下分段摘要生成综合报告：\n\n${chunkSummaries.map((summary, index) => `第${index + 1}部分：${summary}`).join('\n\n')}\n\n请提供完整的综合分析，包括主要内容、关键观点、重要结论和整体价值。`;
                }
                
                await new Promise<void>((resolve, reject) => {
                    this.sendMessageNonStream(
                        apiKey, modelId, [{ role: 'user', parts: [{ text: finalPrompt }] }], systemInstruction, config,
                        false, 1000, false, false, false, abortSignal,
                        (error: Error) => reject(error),
                        (parts: Part[]) => {
                            const finalSummary = parts.map(p => p.text || '').join('');
                            onComplete(finalSummary);
                            resolve();
                        }
                    );
                });
            } else if (chunkSummaries.length === 1) {
                onComplete(chunkSummaries[0]);
            }
        } catch (error) {
            logService.error('Error in processTextInChunks:', error);
            onError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private _splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
        const chunks: string[] = [];
        const paragraphs = text.split(/\n\s*\n/);
        
        let currentChunk = '';
        
        for (const paragraph of paragraphs) {
            if (paragraph.length > maxChunkSize) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                
                const sentences = paragraph.split(/[.!?。！？]\s+/);
                for (const sentence of sentences) {
                    if (currentChunk.length + sentence.length > maxChunkSize) {
                        if (currentChunk) {
                            chunks.push(currentChunk.trim());
                            currentChunk = sentence;
                        } else {
                            chunks.push(sentence.substring(0, maxChunkSize));
                            currentChunk = sentence.substring(maxChunkSize);
                        }
                    } else {
                        currentChunk += (currentChunk ? ' ' : '') + sentence;
                    }
                }
            } else {
                if (currentChunk.length + paragraph.length > maxChunkSize) {
                    chunks.push(currentChunk.trim());
                    currentChunk = paragraph;
                } else {
                    currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
                }
            }
        }
        
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.filter(chunk => chunk.length > 0);
    }
}

export const geminiServiceInstance = new GeminiServiceImpl();

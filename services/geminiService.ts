
import { GoogleGenAI, Part, Content, GenerateContentResponse, File as GeminiFile, UploadFileConfig, UsageMetadata } from "@google/genai";
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
        const GOOGLE_HOSTNAME = 'generativelanguage.googleapis.com';
        let isInterceptorActive = false;

        logService.info(`[PROXY WRAPPER] Activating for API call. Target: ${proxyUrl}`);

        globalThis.fetch = async (input, init) => {
            const url = new URL(input.toString());

            // 只拦截发往 Google API 的请求
            if (url.hostname === GOOGLE_HOSTNAME) {
                isInterceptorActive = true;
                const proxy = new URL(proxyUrl);
                const originalPath = url.pathname;
                
                // 兼容类似 https://api-proxy.me/gemini/ 的路径
                const newPath = (proxy.pathname + originalPath).replace(/\/\//g, '/');

                url.hostname = proxy.hostname;
                url.port = proxy.port;
                url.protocol = proxy.protocol;
                url.pathname = newPath;
                
                logService.info(`[PROXY WRAPPER] Redirecting fetch to ${url.toString()}`);
                return originalFetch(url.toString(), init);
            }
            // 对于所有其他请求，使用原始的fetch函数
            return originalFetch(input, init);
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
            // @ts-ignore
            const response = await ai.models.generateImages({ model: modelId, prompt, config: { aspectRatio, numberOfImages: 1, outputMimeType: 'image/jpeg' } });
            return response.generatedImages?.map((img: any) => img?.image?.imageBytes).filter(Boolean) ?? [];
        });
    }

    async generateSpeech(apiKey: string, modelId: string, text: string, voice: string, abortSignal: AbortSignal): Promise<string> {
        return this._withProxyFetch(async () => {
            const ai = this._getApiClientOrThrow(apiKey);
            // @ts-ignore
            const response = await ai.models.generateContent({ 
                model: modelId, 
                contents: text, 
                config: { 
                    responseModalities: ['AUDIO'], 
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } 
                } 
            });
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
            const textPart: Part = { text: "Transcribe this audio." };
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
                ? `基于以下最近的对话交流，为用户生成三条可以发送给语言模型的建议回复。这些回复应该是简短、相关且多样化的，旨在继续对话。\n\n用户: "${userContent}"\n助手: "${modelContent}"\n\n请返回三个建议，每行一个，用数字编号：`
                : `Based on the last conversation turn below, generate three short, relevant, and diverse suggested replies or follow-up questions that a user might click to continue the conversation.\n\nUSER: "${userContent}"\nASSISTANT: "${modelContent}"\n\nPlease return three suggestions, one per line, numbered:`;

            const response = await ai.models.generateContent({ 
                model: 'gemini-2.0-flash-thinking-exp',
                contents: prompt,
                config: {
                    temperature: 0.8,
                    topP: 0.95
                }
            });
            
            if (response.text) {
                // Parse the numbered suggestions
                return response.text.trim().split('\n')
                    .map((s: string) => s.replace(/^\d+\.\s*/, '').trim())
                    .filter(Boolean)
                    .slice(0, 3);
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
                const ai = this._getApiClientOrThrow(apiKey);
                const generationConfig = this._buildGenerationConfig(modelId, systemInstruction, config, showThoughts, thinkingBudget, isGoogleSearchEnabled, isCodeExecutionEnabled, isUrlContextEnabled);
                const response = await ai.models.generateContent({ model: modelId, contents: history as Content[], ...generationConfig });
                
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

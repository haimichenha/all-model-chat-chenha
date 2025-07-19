
import { GoogleGenAI, Part, Content, GenerateContentResponse, File as GeminiFile, UploadFileConfig, UsageMetadata } from "@google/genai";
import { GeminiService, ChatHistoryItem, ModelOption, AppSettings, ThoughtSupportingPart } from '../types';
import { logService } from "./logService";
import { fileToBase64 } from "../utils/appUtils";

const POLLING_INTERVAL_MS = 2000;
const MAX_POLLING_DURATION_MS = 10 * 60 * 1000;

class GeminiServiceImpl implements GeminiService {
    private currentAppSettings: AppSettings | null = null;

    constructor() {
        logService.info("GeminiService created.");
    }
    
    public updateSettings(settings: AppSettings): void {
        this.currentAppSettings = settings;
        logService.info("GeminiService settings updated.");
    }

    private _getClient(apiKey: string): GoogleGenAI {
        const GOOGLE_DIRECT_URL = 'https://generativelanguage.googleapis.com';
        const userProvidedEndpoint = this.currentAppSettings?.apiProxyUrl?.trim() || GOOGLE_DIRECT_URL;
        logService.info(`Client configured to initially target: ${userProvidedEndpoint}`);
        // @ts-ignore
        return new GoogleGenAI({ apiKey, apiEndpoint: userProvidedEndpoint });
    }

    private _getApiClientOrThrow(apiKey?: string | null): GoogleGenAI {
        if (!apiKey) {
            const silentError = new Error("API key is not configured in settings or provided.");
            silentError.name = "SilentError";
            throw silentError;
        }
        return this._getClient(apiKey);
    }
    
    private _buildGenerationConfig(
        modelId: string, systemInstruction: string, config: { temperature?: number; topP?: number }, showThoughts: boolean,
        thinkingBudget: number, isGoogleSearchEnabled?: boolean, isCodeExecutionEnabled?: boolean
    ): any {
        const generationConfig: any = { ...config };
        if (systemInstruction) generationConfig.systemInstruction = systemInstruction;
        const tools = generationConfig.tools || [];
        if (isGoogleSearchEnabled) tools.push({ googleSearch: {} });
        if (isCodeExecutionEnabled) tools.push({ codeExecution: {} });
        if (tools.length > 0) generationConfig.tools = tools;
        return generationConfig;
    }

    async getAvailableModels(apiKeysString: string | null): Promise<ModelOption[]> {
        const keys = (apiKeysString || '').split('\n').map(k => k.trim()).filter(Boolean);
        if (keys.length === 0) throw new Error("API client not initialized. Configure API Key in settings.");
        
        const randomKey = keys[Math.floor(Math.random() * keys.length)];

        // [最终修复] 将网络拦截器逻辑添加到此函数中！
        const originalFetch = globalThis.fetch;
        const PUBLIC_PROXY_HOSTNAME = 'api-proxy.me';
        const GOOGLE_HOSTNAME = 'generativelanguage.googleapis.com';
        let isInterceptorActive = false;
        globalThis.fetch = async (input, init) => {
            const url = new URL(input.toString());
            if (url.hostname === GOOGLE_HOSTNAME) {
                isInterceptorActive = true;
                const originalUrl = url.toString();
                url.hostname = PUBLIC_PROXY_HOSTNAME;
                url.pathname = '/gemini' + url.pathname;
                logService.info(`[INTERCEPTOR ACTIVE] Redirecting model list fetch from ${originalUrl} to ${url.toString()}`);
                return originalFetch(url.toString(), init);
            }
            return originalFetch(input, init);
        };

        try {
            const ai = this._getClient(randomKey);
            const modelPager = await ai.models.list();
            const availableModels: ModelOption[] = [];
            for await (const model of modelPager) {
                if (typeof model.name === 'string' && model.name) {
                    const supported = (model as any).supportedActions;
                    if (!supported || supported.includes('generateContent')) {
                        availableModels.push({
                            id: model.name, name: model.displayName || model.name.split('/').pop() || model.name, isPinned: false,
                        });
                    }
                }
            }
            if (availableModels.length > 0) return availableModels.sort((a,b) => a.name.localeCompare(b.name));
            throw new Error("API returned an empty list of models.");
        } catch (error) {
            logService.error("Failed to fetch available models from Gemini API:", error);
            throw error;
        } finally {
            // [最终修复] 确保在函数结束时恢复原始的 fetch
            globalThis.fetch = originalFetch;
            if (isInterceptorActive) {
                logService.info("[INTERCEPTOR DEACTIVATED] Restored original fetch function for model list.");
            }
        }
    }

    // ... 所有其他函数 (uploadFile, getFileMetadata, etc.) 保持不变 ...
    async uploadFile(apiKey: string, file: File, mimeType: string, displayName: string, signal: AbortSignal): Promise<GeminiFile> {
        const ai = this._getApiClientOrThrow(apiKey);
        if (signal.aborted) {
            const abortError = new Error("Upload cancelled by user.");
            abortError.name = "AbortError";
            throw abortError;
        }
        try {
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
                if (signal.aborted) {
                     const abortError = new Error("Upload polling cancelled by user after timeout.");
                     abortError.name = "AbortError";
                     throw abortError;
                }
                try {
                    if (typeof uploadedFile.name === 'string' && uploadedFile.name) {
                        uploadedFile = await ai.files.get({ name: uploadedFile.name });
                    } else {
                        throw new Error("Polling failed: File metadata is missing 'name' property.");
                    }
                } catch (pollError) {
                    throw new Error(`Polling failed. Original error: ${pollError instanceof Error ? pollError.message : String(pollError)}`);
                }
            }
            return uploadedFile;
        } catch (error) {
            logService.error(`Failed to upload file "${displayName}":`, error);
            throw error;
        }
    }
    async getFileMetadata(apiKey: string, fileApiName: string): Promise<GeminiFile | null> {
        const ai = this._getApiClientOrThrow(apiKey);
        if (!fileApiName || !fileApiName.startsWith('files/')) {
            throw new Error('Invalid file ID format.');
        }
        try {
            const file = await ai.files.get({ name: fileApiName });
            return file;
        } catch (error) {
            if (error instanceof Error && (error.message.includes('NOT_FOUND') || error.message.includes('404'))) {
                return null;
            }
            throw error;
        }
    }
    async generateImages(apiKey: string, modelId: string, prompt: string, aspectRatio: string, abortSignal: AbortSignal): Promise<string[]> {
        const ai = this._getApiClientOrThrow(apiKey);
        if (!prompt.trim()) throw new Error("Image prompt cannot be empty.");
        if (abortSignal.aborted) {
            const abortError = new Error("Image generation cancelled.");
            abortError.name = "AbortError";
            throw abortError;
        }
        try {
            const response = await (ai.models as any).generateImages({
                model: modelId,
                prompt: prompt,
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: aspectRatio },
            });
            if (abortSignal.aborted) {
                const abortError = new Error("Image generation cancelled.");
                abortError.name = "AbortError";
                throw abortError;
            }
            const images = response.generatedImages?.map((img: any) => img?.image?.imageBytes).filter(Boolean) ?? [];
            if (images.length === 0) throw new Error("No images generated.");
            return images;
        } catch (error) {
            logService.error(`Failed to generate images:`, error);
            throw error;
        }
    }
    async generateSpeech(apiKey: string, modelId: string, text: string, voice: string, abortSignal: AbortSignal): Promise<string> {
        const ai = this._getApiClientOrThrow(apiKey);
        if (!text.trim()) throw new Error("TTS input cannot be empty.");
        try {
            const response = await (ai.models as any).generateContent({
                model: modelId,
                contents: text,
                config: {
                    responseModalities: ['AUDIO'],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
                },
            });
            if (abortSignal.aborted) {
                const abortError = new Error("Speech generation cancelled.");
                abortError.name = "AbortError";
                throw abortError;
            }
            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (typeof audioData === 'string' && audioData.length > 0) return audioData;
            throw new Error(response.text || 'No audio data found in TTS response.');
        } catch (error) {
            logService.error(`Failed to generate speech:`, error);
            throw error;
        }
    }
    async transcribeAudio(apiKey: string, audioFile: File, modelId: string, isThinkingEnabled: boolean): Promise<string> {
        const ai = this._getApiClientOrThrow(apiKey);
        const audioBase64 = await fileToBase64(audioFile);
        const audioPart: Part = { inlineData: { mimeType: audioFile.type, data: audioBase64 } };
        const textPart: Part = { text: "Transcribe this audio. Only return the transcribed text." };
        try {
            const response = await ai.models.generateContent({
                model: modelId,
                contents: { parts: [textPart, audioPart] },
            });
            if (response.text) return response.text;
            throw new Error(response.candidates?.[0]?.finishReason || "Transcription failed.");
        } catch (error) {
            logService.error("Error during audio transcription:", error);
            throw error;
        }
    }

    async sendMessageStream(
        apiKey: string, modelId: string, history: ChatHistoryItem[], systemInstruction: string, config: { temperature?: number; topP?: number },
        showThoughts: boolean, thinkingBudget: number, isGoogleSearchEnabled: boolean, isCodeExecutionEnabled: boolean, abortSignal: AbortSignal,
        onPart: (part: Part) => void, onThoughtChunk: (chunk: string) => void, onError: (error: Error) => void, onComplete: (usageMetadata?: UsageMetadata, groundingMetadata?: any) => void
    ): Promise<void> {
        const originalFetch = globalThis.fetch;
        const PUBLIC_PROXY_HOSTNAME = 'api-proxy.me';
        const GOOGLE_HOSTNAME = 'generativelanguage.googleapis.com';
        let isInterceptorActive = false;
        globalThis.fetch = async (input, init) => {
            const url = new URL(input.toString());
            if (url.hostname === GOOGLE_HOSTNAME) {
                isInterceptorActive = true;
                const originalUrl = url.toString();
                url.hostname = PUBLIC_PROXY_HOSTNAME;
                url.pathname = '/gemini' + url.pathname;
                logService.info(`[INTERCEPTOR ACTIVE] Redirecting chat stream from ${originalUrl} to ${url.toString()}`);
                return originalFetch(url.toString(), init);
            }
            return originalFetch(input, init);
        };
        let hasReceivedParts = false;
        try {
            const ai = this._getApiClientOrThrow(apiKey);
            const contents: Content[] = history.map(item => ({ role: item.role, parts: item.parts }));
            const generationConfig = this._buildGenerationConfig(modelId, systemInstruction, config, showThoughts, thinkingBudget, isGoogleSearchEnabled, isCodeExecutionEnabled);
            const streamResult = await ai.models.generateContentStream({ model: modelId, contents, ...generationConfig });
            let finalResponse: any;
            for await (const chunkResponse of streamResult) {
                const part = chunkResponse.candidates?.[0]?.content?.parts?.[0];
                if (part) {
                    hasReceivedParts = true;
                    onPart(part);
                }
                finalResponse = chunkResponse;
            }
            const usageMetadata = (finalResponse as any)?.usageMetadata;
            const groundingMetadata = (finalResponse as any)?.candidates?.[0]?.groundingMetadata;
            onComplete(usageMetadata, groundingMetadata);
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError' && !hasReceivedParts) {
                onError(error);
            } else {
                logService.error("A non-fatal error occurred after the stream had already started:", error);
                onComplete();
            }
        } finally {
            globalThis.fetch = originalFetch;
            if (isInterceptorActive) {
                logService.info("[INTERCEPTOR DEACTIVATED] Restored original fetch function for chat stream.");
            }
        }
    }

    async sendMessageNonStream(
        apiKey: string, modelId: string, historyWithLastPrompt: ChatHistoryItem[], systemInstruction: string, config: { temperature?: number; topP?: number },
        showThoughts: boolean, thinkingBudget: number, isGoogleSearchEnabled: boolean, isCodeExecutionEnabled: boolean, abortSignal: AbortSignal,
        onError: (error: Error) => void, onComplete: (parts: Part[], thoughtsText?: string, usageMetadata?: UsageMetadata, groundingMetadata?: any) => void
    ): Promise<void> {
        const ai = this._getApiClientOrThrow(apiKey);
        const generationConfig = this._buildGenerationConfig(modelId, systemInstruction, config, showThoughts, thinkingBudget, isGoogleSearchEnabled, isCodeExecutionEnabled);
        try {
            if (abortSignal.aborted) {
                onComplete([], undefined, undefined, undefined);
                return;
            }
            const response: GenerateContentResponse = await ai.models.generateContent({ model: modelId, contents: historyWithLastPrompt as Content[], ...generationConfig });
            if (abortSignal.aborted) {
                onComplete([], undefined, undefined, undefined);
                return;
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
            const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
            onComplete(responseParts, thoughtsText || undefined, response.usageMetadata, groundingMetadata);
        } catch (error) {
            logService.error("Error sending message to Gemini (non-stream):", error);
            onError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}

export const geminiServiceInstance = new GeminiServiceImpl();

import { useCallback, Dispatch, SetStateAction, useRef } from 'react';
import { AppSettings, ChatMessage, UploadedFile, ChatSettings as IndividualChatSettings, ChatHistoryItem, SavedChatSession } from '../types';
import { generateUniqueId, buildContentParts, pcmBase64ToWavUrl, createChatHistoryForApi, getKeyForRequest, generateSessionTitle } from '../utils/appUtils';
import { geminiServiceInstance } from '../services/geminiService';
import { Part, UsageMetadata } from '@google/genai';
import { logService } from '../services/logService';
import { DEFAULT_CHAT_SETTINGS } from '../constants/appConstants';
import { persistentStoreService } from '../services/persistentStoreService';
import { apiRotationService } from '../services/apiRotationService';

type CommandedInputSetter = Dispatch<SetStateAction<{ text: string; id: number; } | null>>;
type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;

interface MessageHandlerProps {
    appSettings: AppSettings;
    messages: ChatMessage[];
    isLoading: boolean;
    currentChatSettings: IndividualChatSettings;
    selectedFiles: UploadedFile[];
    setSelectedFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
    editingMessageId: string | null;
    setEditingMessageId: (id: string | null) => void;
    setAppFileError: (error: string | null) => void;
    aspectRatio: string;
    userScrolledUp: React.MutableRefObject<boolean>;
    ttsMessageId: string | null;
    setTtsMessageId: (id: string | null) => void;
    activeSessionId: string | null;
    setActiveSessionId: (id: string | null) => void;
    setCommandedInput: CommandedInputSetter;
    activeJobs: React.MutableRefObject<Map<string, AbortController>>;
    loadingSessionIds: Set<string>;
    setLoadingSessionIds: Dispatch<SetStateAction<Set<string>>>;
    updateAndPersistSessions: SessionsUpdater;
}

const isToolMessage = (msg: ChatMessage): boolean => {
    if (!msg) return false;
    if (msg.files && msg.files.length > 0) return true; // A message with a file is a tool-like message
    if (!msg.content) return false;
    const content = msg.content.trim();
    return (content.startsWith('```') && content.endsWith('```')) ||
           content.startsWith('<div class="tool-result') ||
           content.startsWith('![Generated Image]');
};


export const useMessageHandler = ({
    appSettings,
    messages,
    isLoading,
    currentChatSettings,
    selectedFiles,
    setSelectedFiles,
    editingMessageId,
    setEditingMessageId,
    setAppFileError,
    aspectRatio,
    userScrolledUp,
    ttsMessageId,
    setTtsMessageId,
    activeSessionId,
    setActiveSessionId,
    setCommandedInput,
    activeJobs,
    setLoadingSessionIds,
    updateAndPersistSessions
}: MessageHandlerProps) => {
    const generationStartTimeRef = useRef<Date | null>(null);
    const firstContentPartTimeRef = useRef<Date | null>(null);

    const handleApiError = useCallback((error: unknown, sessionId: string, modelMessageId: string, errorPrefix: string = "Error") => {
        const isAborted = error instanceof Error && (error.name === 'AbortError' || error.message === 'aborted');
        logService.error(`API Error (${errorPrefix}) for message ${modelMessageId} in session ${sessionId}`, { error, isAborted });
        
        if (isAborted) {
            updateAndPersistSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: s.messages.map(msg =>
                msg.isLoading // Find any loading messages from this run
                    ? { ...msg, role: 'model', content: (msg.content || "") + "\n\n[Cancelled by user]", isLoading: false, generationEndTime: new Date() } 
                    : msg
            )}: s));
            return;
        }

        let errorMessage = "An unknown error occurred.";
        if (error instanceof Error) {
            errorMessage = error.name === 'SilentError'
                ? "API key is not configured in settings."
                : `${errorPrefix}: ${error.message}`;
        } else {
            errorMessage = `${errorPrefix}: ${String(error)}`;
        }

        updateAndPersistSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: s.messages.map(msg => 
            msg.id === modelMessageId 
                ? { ...msg, role: 'error', content: errorMessage, isLoading: false, generationEndTime: new Date() } 
                : msg
        )}: s));
    }, [updateAndPersistSessions]);


    const handleSendMessage = useCallback(async (overrideOptions?: { text?: string; files?: UploadedFile[]; editingId?: string }) => {
        const textToUse = overrideOptions?.text ?? '';
        const filesToUse = overrideOptions?.files ?? selectedFiles;
        const effectiveEditingId = overrideOptions?.editingId ?? editingMessageId;
        
        let sessionId = activeSessionId;
        let sessionToUpdate: IndividualChatSettings | null = null;
        if (sessionId) {
            updateAndPersistSessions(prev => {
                const found = prev.find(s => s.id === sessionId);
                if(found) sessionToUpdate = found.settings;
                return prev;
            });
        }
        
        if (!sessionToUpdate) {
            sessionToUpdate = { ...DEFAULT_CHAT_SETTINGS, ...appSettings };
        }

        const activeModelId = sessionToUpdate.modelId;
        const isTtsModel = activeModelId.includes('-tts');
        const isImagenModel = activeModelId.includes('imagen');
        
        logService.info(`Sending message with model ${activeModelId}`, { textLength: textToUse.length, fileCount: filesToUse.length, editingId: effectiveEditingId, sessionId: sessionId });

        if (!textToUse.trim() && !isTtsModel && !isImagenModel && filesToUse.filter(f => f.uploadState === 'active').length === 0) return;
        if ((isTtsModel || isImagenModel) && !textToUse.trim()) return;
        if (filesToUse.some(f => f.isProcessing || (f.uploadState !== 'active' && !f.error) )) { 
            logService.warn("Send message blocked: files are still processing.");
            setAppFileError("Wait for files to finish processing."); 
            return; 
        }
        setAppFileError(null);

        if (!activeModelId) { 
            logService.error("Send message failed: No model selected.");
            const errorMsg: ChatMessage = { id: generateUniqueId(), role: 'error', content: 'No model selected.', timestamp: new Date() };
            const newSession: SavedChatSession = { id: generateUniqueId(), title: "Error", messages: [errorMsg], settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings }, timestamp: Date.now() };
            updateAndPersistSessions(p => [newSession, ...p]);
            setActiveSessionId(newSession.id);
            return; 
        }

    const hasFileId = filesToUse.some(f => f.fileUri);
    const rotationEnabled = !!(appSettings.apiRotation?.enabled && (appSettings.apiRotation?.selectedConfigIds || []).length > 0);

    const keyResult = rotationEnabled ? null : getKeyForRequest(appSettings, sessionToUpdate);
    if (!rotationEnabled && keyResult && 'error' in keyResult) {
            logService.error("Send message failed: API Key not configured.");
             const errorMsg: ChatMessage = { id: generateUniqueId(), role: 'error', content: keyResult.error, timestamp: new Date() };
             const newSession: SavedChatSession = { id: generateUniqueId(), title: "API Key Error", messages: [errorMsg], settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings }, timestamp: Date.now() };
             updateAndPersistSessions(p => [newSession, ...p]);
             setActiveSessionId(newSession.id);
            return;
        }
    const { key: keyToUse, isNewKey } = keyResult || ({} as any);
    // 轮询模式下，锁定密钥在成功后根据实际使用的配置再设置
    const shouldLockKey = rotationEnabled ? false : (isNewKey && hasFileId);
    let lockKeyOnSuccess: string | null = rotationEnabled ? null : (shouldLockKey ? keyToUse : null);

        const newAbortController = new AbortController();
        const generationId = generateUniqueId();
        generationStartTimeRef.current = new Date();
        firstContentPartTimeRef.current = null;

        userScrolledUp.current = false;
        if (overrideOptions?.files === undefined) setSelectedFiles([]);

        // If no active session, create one
        if (!sessionId) {
            const newSessionId = generateUniqueId();
            let newSessionSettings = { ...DEFAULT_CHAT_SETTINGS, ...appSettings };
            if (shouldLockKey && !rotationEnabled) newSessionSettings.lockedApiKey = keyToUse;

            const newTitle = "New Chat"; // Will be updated when message is added
            const newSession: SavedChatSession = {
                id: newSessionId,
                title: newTitle,
                messages: [], // Start with empty messages
                timestamp: Date.now(),
                settings: newSessionSettings,
            };
            updateAndPersistSessions(p => [newSession, ...p]);
            setActiveSessionId(newSessionId);
            sessionId = newSessionId;
        }

        const currentSessionId = sessionId;
        if (!currentSessionId) {
             logService.error("Message send failed: Could not establish a session ID.");
             return;
        }
        
        setLoadingSessionIds(prev => new Set(prev).add(currentSessionId));
        activeJobs.current.set(generationId, newAbortController);

        // --- TTS or Imagen Model Logic (No history needed) ---
        if (isTtsModel || isImagenModel) {
            const userMessage: ChatMessage = { id: generateUniqueId(), role: 'user', content: textToUse.trim(), timestamp: new Date() };
            const modelMessageId = generateUniqueId();
            const modelMessage: ChatMessage = { id: modelMessageId, role: 'model', content: '', timestamp: new Date(), isLoading: true, generationStartTime: new Date() };
            updateAndPersistSessions(prev => prev.map(s => {
                if (s.id !== currentSessionId) return s;
                const newMessages = [...s.messages, userMessage, modelMessage];
                return { ...s, messages: newMessages, title: generateSessionTitle(newMessages) };
            }));

            try {
                if (isTtsModel) {
                    const base64Pcm = await geminiServiceInstance.generateSpeech(keyToUse, activeModelId, textToUse.trim(), sessionToUpdate.ttsVoice, newAbortController.signal);
                    if (newAbortController.signal.aborted) throw new Error("aborted");
                    const wavUrl = pcmBase64ToWavUrl(base64Pcm);
                    updateAndPersistSessions(p => p.map(s => s.id === currentSessionId ? { ...s, messages: s.messages.map(m => m.id === modelMessageId ? { ...m, isLoading: false, content: textToUse.trim(), audioSrc: wavUrl, generationEndTime: new Date() } : m) } : s));
                } else { // Imagen
                    const imageBase64Array = await geminiServiceInstance.generateImages(keyToUse, activeModelId, textToUse.trim(), aspectRatio, newAbortController.signal);
                    if (newAbortController.signal.aborted) throw new Error("aborted");
                    const generatedFiles: UploadedFile[] = imageBase64Array.map((base64Data, index) => ({ id: generateUniqueId(), name: `generated-image-${index + 1}.jpeg`, type: 'image/jpeg', size: base64Data.length, dataUrl: `data:image/jpeg;base64,${base64Data}`, base64Data, uploadState: 'active' }));
                    updateAndPersistSessions(p => p.map(s => s.id === currentSessionId ? { ...s, messages: s.messages.map(m => m.id === modelMessageId ? { ...m, isLoading: false, content: `Generated image for: "${textToUse.trim()}"`, files: generatedFiles, generationEndTime: new Date() } : m) } : s));
                }
            } catch (error) {
                handleApiError(error, currentSessionId, modelMessageId, isTtsModel ? "TTS Error" : "Image Gen Error");
            } finally {
                setLoadingSessionIds(prev => { const next = new Set(prev); next.delete(currentSessionId); return next; });
                activeJobs.current.delete(generationId);
            }
            return;
        }

        // --- Regular Text Generation Logic ---
        
        let sessionForHistory: SavedChatSession | undefined;
        let baseMessages: ChatMessage[] = [];
        
        // This is the core fix: create the user message AND the loading model message placeholder
        // before making the API call.
        updateAndPersistSessions(prev => {
            sessionForHistory = prev.find(s => s.id === currentSessionId);
            if (!sessionForHistory) return prev;

            const editIndex = effectiveEditingId ? sessionForHistory.messages.findIndex(m => m.id === effectiveEditingId) : -1;
            baseMessages = editIndex !== -1 ? sessionForHistory.messages.slice(0, editIndex) : [...sessionForHistory.messages];
            
            const lastCumulative = baseMessages.length > 0 ? (baseMessages[baseMessages.length - 1].cumulativeTotalTokens || 0) : 0;
            const successfullyProcessedFiles = filesToUse.filter(f => f.uploadState === 'active' && !f.error && !f.isProcessing);
            
            const userMessage: ChatMessage = {
                id: generateUniqueId(),
                role: 'user',
                content: textToUse.trim(),
                files: successfullyProcessedFiles.length ? successfullyProcessedFiles.map(f => ({...f, rawFile: undefined})) : undefined,
                timestamp: new Date(),
                cumulativeTotalTokens: lastCumulative,
            };
            
            // Create the loading model message here
            const modelMessage: ChatMessage = { 
                id: generationId, // Use generationId as the messageId
                role: 'model', 
                content: '', 
                timestamp: new Date(), 
                isLoading: true, 
                generationStartTime: generationStartTimeRef.current! 
            };

            const newMessages = [...baseMessages, userMessage, modelMessage];
            const updatedSession = { ...sessionForHistory, messages: newMessages, title: generateSessionTitle(newMessages) };
            
            return prev.map(s => s.id === currentSessionId ? updatedSession : s);
        });

        if (effectiveEditingId && !overrideOptions) setEditingMessageId(null);
        
        const promptParts = await buildContentParts(textToUse.trim(), filesToUse.filter(f => f.uploadState === 'active' && !f.error && !f.isProcessing));
        if (promptParts.length === 0) {
             setLoadingSessionIds(prev => { const next = new Set(prev); next.delete(currentSessionId); return next; });
             activeJobs.current.delete(generationId);
             return; 
        }

        const historyForApi = await createChatHistoryForApi(baseMessages);
        const fullHistory: ChatHistoryItem[] = [...historyForApi, { role: 'user', parts: promptParts }];
        const newModelMessageIds = new Set<string>([generationId]); // Pre-add the main loading message ID
        
        const streamOnError = (error: Error) => {
            handleApiError(error, currentSessionId, generationId); // Use generationId as the identifier
            setLoadingSessionIds(prev => { const next = new Set(prev); next.delete(currentSessionId); return next; });
            activeJobs.current.delete(generationId);
        };

    const streamOnComplete = async (usageMetadata?: UsageMetadata, groundingMetadata?: any) => {
            // If no content parts were ever received, thinking ends now.
            if (appSettings.isStreamingEnabled && !firstContentPartTimeRef.current) {
                firstContentPartTimeRef.current = new Date();
            }

            updateAndPersistSessions(prev => prev.map(s => {
                if (s.id !== currentSessionId) return s;
                
                let cumulativeTotal = [...s.messages].reverse().find(m => m.cumulativeTotalTokens !== undefined && m.generationStartTime !== generationStartTimeRef.current)?.cumulativeTotalTokens || 0;

                const finalMessages = s.messages
                    .map(m => {
                        if (m.generationStartTime === generationStartTimeRef.current && m.isLoading) {
                            // If thinkingTimeMs hasn't been set yet (e.g., no content parts), calculate it now.
                            let thinkingTime = m.thinkingTimeMs;
                            if (thinkingTime === undefined && firstContentPartTimeRef.current && generationStartTimeRef.current) {
                                thinkingTime = firstContentPartTimeRef.current.getTime() - generationStartTimeRef.current.getTime();
                            }
                            
                            const isLastMessageOfRun = m.id === Array.from(newModelMessageIds).pop();
                             const turnTokens = isLastMessageOfRun ? (usageMetadata?.totalTokenCount || 0) : 0;
                             const promptTokens = isLastMessageOfRun ? (usageMetadata?.promptTokenCount) : undefined;
                             const completionTokens = (promptTokens !== undefined && turnTokens > 0) ? turnTokens - promptTokens : undefined;
                            cumulativeTotal += turnTokens;
                            return {
                                ...m,
                                isLoading: false,
                                content: m.content + (newAbortController.signal.aborted ? "\n\n[Stopped by user]" : ""),
                                thoughts: s.settings.showThoughts ? m.thoughts : undefined,
                                generationEndTime: new Date(),
                                thinkingTimeMs: thinkingTime,
                                groundingMetadata: isLastMessageOfRun ? groundingMetadata : undefined,
                                promptTokens,
                                completionTokens,
                                totalTokens: turnTokens,
                                cumulativeTotalTokens: cumulativeTotal,
                            };
                        }
                        return m;
                    })
                    .filter(m => m.role !== 'model' || m.content.trim() !== '' || (m.files && m.files.length > 0) || m.audioSrc); // Remove empty model messages
                
                let newSettings = s.settings;
                if(lockKeyOnSuccess) newSettings = { ...s.settings, lockedApiKey: lockKeyOnSuccess };

                return {...s, messages: finalMessages, settings: newSettings};
            }));
            setLoadingSessionIds(prev => { const next = new Set(prev); next.delete(currentSessionId); return next; });
            activeJobs.current.delete(generationId);

            // --- Smart Reply Suggestions (optional) ---
            try {
                if (appSettings.isSuggestionsEnabled) {
                    // 1) Mark the just-finished model message as generating suggestions
                    updateAndPersistSessions(prev => prev.map(s => {
                        if (s.id !== currentSessionId) return s;
                        return {
                            ...s,
                            messages: s.messages.map(m => m.id === generationId ? { ...m, isGeneratingSuggestions: true } : m)
                        };
                    }));

                    // 2) Extract the user+model contents of the completed turn
                    let userContent = '';
                    let modelContent = '';
                    updateAndPersistSessions(prev => {
                        const ss = prev.find(s => s.id === currentSessionId);
                        if (ss) {
                            const idx = ss.messages.findIndex(m => m.id === generationId);
                            if (idx > 0) {
                                const prevMsg = ss.messages[idx - 1];
                                if (prevMsg?.role === 'user') userContent = prevMsg.content || '';
                            }
                            const modelMsg = ss.messages.find(m => m.id === generationId);
                            if (modelMsg) modelContent = modelMsg.content || '';
                        }
                        return prev;
                    });

                    // 3) Get an API key for the quick call
                    await (async () => {
                        const keyResult = getKeyForRequest(appSettings, currentChatSettings);
                        if (!('error' in keyResult)) {
                            const langPref = (appSettings.language === 'system')
                                ? (navigator.language?.toLowerCase().includes('zh') ? 'zh' : 'en')
                                : appSettings.language;
                            const suggestions = await geminiServiceInstance.generateSuggestions(keyResult.key, userContent, modelContent, langPref as 'en' | 'zh');
                            if (suggestions && suggestions.length > 0) {
                                updateAndPersistSessions(prev => prev.map(s => s.id === currentSessionId ? {
                                    ...s,
                                    messages: s.messages.map(m => m.id === generationId ? { ...m, suggestions, isGeneratingSuggestions: false } : m)
                                } : s));
                            } else {
                                updateAndPersistSessions(prev => prev.map(s => s.id === currentSessionId ? {
                                    ...s,
                                    messages: s.messages.map(m => m.id === generationId ? { ...m, isGeneratingSuggestions: false } : m)
                                } : s));
                            }
                        } else {
                            updateAndPersistSessions(prev => prev.map(s => s.id === currentSessionId ? {
                                ...s,
                                messages: s.messages.map(m => m.id === generationId ? { ...m, isGeneratingSuggestions: false } : m)
                            } : s));
                        }
                    })();
                }
            } catch (e) {
                logService.warn('Suggestion generation failed (non-fatal).', e);
                updateAndPersistSessions(prev => prev.map(s => s.id === currentSessionId ? {
                    ...s,
                    messages: s.messages.map(m => m.id === generationId ? { ...m, isGeneratingSuggestions: false } : m)
                } : s));
            }

            // --- Auto Title (optional) ---
            try {
                if (appSettings.isAutoTitleEnabled) {
                    let userContent = '';
                    let modelContent = '';
                    let currentTitle = '';
                    updateAndPersistSessions(prev => {
                        const ss = prev.find(s => s.id === currentSessionId);
                        if (ss) {
                            currentTitle = ss.title || '';
                            const idx = ss.messages.findIndex(m => m.id === generationId);
                            if (idx > 0) {
                                const prevMsg = ss.messages[idx - 1];
                                if (prevMsg?.role === 'user') userContent = prevMsg.content || '';
                            }
                            const modelMsg = ss.messages.find(m => m.id === generationId);
                            if (modelMsg) modelContent = modelMsg.content || '';
                        }
                        return prev;
                    });
                    // Skip if content is insufficient
                    await (async () => {
                        if (userContent.trim() && modelContent.trim()) {
                            const keyResult = getKeyForRequest(appSettings, currentChatSettings);
                            if (!('error' in keyResult)) {
                                const langPref = (appSettings.language === 'system')
                                    ? (navigator.language?.toLowerCase().includes('zh') ? 'zh' : 'en')
                                    : appSettings.language;
                                const newTitle = await geminiServiceInstance.generateTitle(keyResult.key, userContent, modelContent, langPref as 'en' | 'zh');
                                if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle && newTitle.trim().length <= 40) {
                                    updateAndPersistSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, title: newTitle.trim() } : s));
                                }
                            }
                        }
                    })();
                }
            } catch (e) {
                logService.warn('Auto-title generation failed (non-fatal).', e);
            }
        };

        const streamOnPart = (part: Part) => {
    // 标记这是不是第一个返回的内容块
    let isFirstContentPart = false;
    if (appSettings.isStreamingEnabled && !firstContentPartTimeRef.current) {
        firstContentPartTimeRef.current = new Date();
        isFirstContentPart = true;
    }

    // [正确的方式] 所有逻辑都必须在这个回调函数内部
    updateAndPersistSessions(prevSessions => { 
        // 找到当前正在操作的会话
        const sessionIndex = prevSessions.findIndex(s => s.id === currentSessionId);
        if (sessionIndex === -1) {
            return prevSessions; // 如果找不到会话，直接返回原始状态
        }

        // 创建会话和消息的副本以进行安全修改
        const currentSession = { ...prevSessions[sessionIndex] };
        let newMessages = [...currentSession.messages];

        // 如果是第一个内容块，更新消息的“思考时间”
        if (isFirstContentPart && generationStartTimeRef.current) {
            const thinkingTime = firstContentPartTimeRef.current!.getTime() - generationStartTimeRef.current.getTime();
            // 找到最后一个正在加载中的消息来更新
            const messageToUpdateIndex = newMessages.map(m => m.isLoading && m.role === 'model').lastIndexOf(true);
            if (messageToUpdateIndex !== -1) {
                newMessages[messageToUpdateIndex] = { ...newMessages[messageToUpdateIndex], thinkingTimeMs: thinkingTime };
            }
        }
        
        const anyPart = part as any;

        const createNewMessage = (content: string, files?: UploadedFile[]): ChatMessage => {
            const id = generateUniqueId();
            newModelMessageIds.add(id);
            return {
                id: id, role: 'model', content: content, files: files, timestamp: new Date(),
                isLoading: true, generationStartTime: generationStartTimeRef.current!,
            };
        };

        // --- 核心修复逻辑：安全地处理文本更新 ---
        if (anyPart.text !== undefined) {
            // 找到最后一个正在加载中的、非工具类型的模型消息
            const lastMessageIndex = newMessages.map(m => m.isLoading && m.role === 'model' && !isToolMessage(m)).lastIndexOf(true);
            
            if (lastMessageIndex !== -1) {
                const messageToUpdate = newMessages[lastMessageIndex];
                // [关键修复] 使用真正的追加逻辑：将新的文本片段追加到旧的文本后面
                const updatedMessage = {
                    ...messageToUpdate,
                    content: messageToUpdate.content + anyPart.text,
                };
                newMessages[lastMessageIndex] = updatedMessage;
            } else {
                // 如果没有可追加的消息，则创建一个新的文本消息
                newMessages.push(createNewMessage(anyPart.text));
            }
        } 
        // --- 其他工具消息处理逻辑保持不变 ---
        else if (anyPart.executableCode) {
            const codePart = anyPart.executableCode as { language: string, code: string };
            const toolContent = `\`\`\`${codePart.language.toLowerCase() || 'python'}\n${codePart.code}\n\`\`\``;
            newMessages.push(createNewMessage(toolContent));
        } else if (anyPart.codeExecutionResult) {
            const resultPart = anyPart.codeExecutionResult as { outcome: string, output?: string };
            const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            let toolContent = `<div class="tool-result outcome-${resultPart.outcome.toLowerCase()}"><strong>Execution Result (${resultPart.outcome}):</strong>`;
            if (resultPart.output) {
                toolContent += `<pre><code>${escapeHtml(resultPart.output)}</code></pre>`;
            }
            toolContent += '</div>';
            newMessages.push(createNewMessage(toolContent));
        } else if (anyPart.inlineData) {
            const { mimeType, data } = anyPart.inlineData;
            if (mimeType.startsWith('image/')) {
                const newFile: UploadedFile = {
                    id: generateUniqueId(), name: 'Generated Image', type: mimeType, size: data.length,
                    dataUrl: `data:${mimeType};base64,${data}`, base64Data: data, uploadState: 'active'
                };
                newMessages.push(createNewMessage('', [newFile]));
            }
        }

        // 返回包含更新后会话的全新会话列表
        const newSessions = [...prevSessions];
        newSessions[sessionIndex] = { ...currentSession, messages: newMessages };
        return newSessions;
    });
};

        const onThoughtChunk = (thoughtChunk: string) => {
            updateAndPersistSessions(prev => prev.map(s => {
                if (s.id !== currentSessionId) return s;
                let messages = [...s.messages];
                let lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                if (lastMessage && lastMessage.role === 'model' && lastMessage.isLoading) {
                    lastMessage.thoughts = (lastMessage.thoughts || '') + thoughtChunk;
                }
                return { ...s, messages };
            }));
        };

        // --- 发送逻辑：支持多API轮询/失败切换 ---
        const sendOnceWithConfig = async (apiKeyToUse: string, endpoint: string | undefined) => {
            // 临时覆盖服务的代理URL
            const originalSettingsSnapshot = { ...appSettings };
            try {
                geminiServiceInstance.updateSettings({ ...appSettings, apiProxyUrl: endpoint || null });
                if (appSettings.isStreamingEnabled) {
                    await new Promise<void>((resolve, reject) => {
                        geminiServiceInstance.sendMessageStream(apiKeyToUse, activeModelId, fullHistory, sessionToUpdate!.systemInstruction, { temperature: sessionToUpdate!.temperature, topP: sessionToUpdate!.topP }, sessionToUpdate!.showThoughts, sessionToUpdate!.thinkingBudget, !!sessionToUpdate!.isGoogleSearchEnabled, !!sessionToUpdate!.isCodeExecutionEnabled, !!sessionToUpdate!.isUrlContextEnabled, newAbortController.signal,
                            streamOnPart,
                            onThoughtChunk,
                            (err: Error) => reject(err),
                            async (usage?: UsageMetadata, grounding?: any) => { await streamOnComplete(usage, grounding); resolve(); }
                        );
                    });
                } else {
                    await new Promise<void>((resolve, reject) => {
                        geminiServiceInstance.sendMessageNonStream(apiKeyToUse, activeModelId, fullHistory, sessionToUpdate!.systemInstruction, { temperature: sessionToUpdate!.temperature, topP: sessionToUpdate!.topP }, sessionToUpdate!.showThoughts, sessionToUpdate!.thinkingBudget, !!sessionToUpdate!.isGoogleSearchEnabled, !!sessionToUpdate!.isCodeExecutionEnabled, !!sessionToUpdate!.isUrlContextEnabled, newAbortController.signal,
                            (err: Error) => reject(err),
                            async (parts: Part[], thoughtsText?: string, usage?: UsageMetadata, grounding?: any) => {
                                for (const part of parts) streamOnPart(part);
                                if (thoughtsText) onThoughtChunk(thoughtsText);
                                await streamOnComplete(usage, grounding);
                                resolve();
                            }
                        );
                    });
                }
            } finally {
                // 恢复原设置
                geminiServiceInstance.updateSettings(originalSettingsSnapshot as any);
            }
        };

        if (rotationEnabled) {
            try {
                // 同步配置到轮询服务
                const allConfigs = persistentStoreService.getApiConfigs();
                const selectedIds = appSettings.apiRotation!.selectedConfigIds;
                const selected = allConfigs.filter(c => selectedIds.includes(c.id));

                // 添加或更新配置选择
                const existing = new Map(apiRotationService.getApiConfigurations().map(c => [c.id, c]));
                // 将未选择的设为不选
                for (const cfg of apiRotationService.getApiConfigurations()) {
                    apiRotationService.updateApiSelection(cfg.id, selectedIds.includes(cfg.id));
                }
                for (const c of selected) {
                    if (!existing.has(c.id)) {
                        apiRotationService.addApiConfiguration({ id: c.id, name: c.name, apiKey: c.apiKey, endpoint: (c as any).apiProxyUrl || (c as any).proxyUrl || undefined, modelId: activeModelId, isSelected: true });
                    } else {
                        apiRotationService.updateApiSelection(c.id, true);
                    }
                }
                apiRotationService.updateSettings({
                    mode: appSettings.apiRotation!.mode,
                    enableFailover: appSettings.apiRotation!.enableFailover,
                    maxRetries: appSettings.apiRotation!.maxRetries,
                    healthCheckInterval: appSettings.apiRotation!.healthCheckInterval,
                });

                // 执行带失败切换的调用
                await apiRotationService.executeWithFailover(async (cfg) => {
                    // 成功后锁定该密钥（如果会话中包含文件）
                    if (hasFileId) lockKeyOnSuccess = cfg.apiKey;
                    await sendOnceWithConfig(cfg.apiKey, cfg.endpoint);
                    return 'ok';
                });
            } catch (error: any) {
                // 最终失败才向用户显示错误
                streamOnError(error instanceof Error ? error : new Error(String(error)));
            }
        } else {
            // 单一路径（无轮询）
            await sendOnceWithConfig(keyToUse, appSettings.apiProxyUrl || undefined);
        }
    }, [activeSessionId, selectedFiles, editingMessageId, appSettings, setAppFileError, setSelectedFiles, setEditingMessageId, setActiveSessionId, userScrolledUp, updateAndPersistSessions, setLoadingSessionIds, activeJobs, aspectRatio, handleApiError]);

    const handleTextToSpeech = useCallback(async (messageId: string, text: string) => {
        if (ttsMessageId) return; 

        const keyResult = getKeyForRequest(appSettings, currentChatSettings);
        if ('error' in keyResult) {
            logService.error("TTS failed:", { error: keyResult.error });
            return;
        }
        const { key } = keyResult;
        
        setTtsMessageId(messageId);
        logService.info("Requesting TTS for message", { messageId });
        const modelId = 'models/gemini-2.5-flash-preview-tts';
        const voice = appSettings.ttsVoice;
        const abortController = new AbortController();

        try {
            const base64Pcm = await geminiServiceInstance.generateSpeech(key, modelId, text, voice, abortController.signal);
            const wavUrl = pcmBase64ToWavUrl(base64Pcm);
            
            updateAndPersistSessions(prev => prev.map(s => {
                if(s.messages.some(m => m.id === messageId)) {
                    return {...s, messages: s.messages.map(m => m.id === messageId ? {...m, audioSrc: wavUrl} : m)};
                }
                return s;
            }));

        } catch (error) {
            logService.error("TTS generation failed:", { messageId, error });
        } finally {
            setTtsMessageId(null);
        }
    }, [appSettings, currentChatSettings, ttsMessageId, setTtsMessageId, updateAndPersistSessions]);

    const handleStopGenerating = () => {
        if (!activeSessionId || !isLoading) return;
        logService.warn(`User stopped generation for session: ${activeSessionId}`);
        activeJobs.current.forEach(controller => controller.abort());
    };

    const handleEditMessage = (messageId: string) => {
        logService.info("User initiated message edit", { messageId });
        const messageToEdit = messages.find(msg => msg.id === messageId);
        if (messageToEdit?.role === 'user') {
            if (isLoading) handleStopGenerating();
            setCommandedInput({ text: messageToEdit.content, id: Date.now() });
            setSelectedFiles(messageToEdit.files || []);
            setEditingMessageId(messageId);
            setAppFileError(null);
            (document.querySelector('textarea[aria-label="Chat message input"]') as HTMLTextAreaElement)?.focus();
        }
    };

    const handleCancelEdit = () => { 
        logService.info("User cancelled message edit.");
        setCommandedInput({ text: '', id: Date.now() });
        setSelectedFiles([]); 
        setEditingMessageId(null); 
        setAppFileError(null); 
    };

    const handleDeleteMessage = (messageId: string) => {
        if (!activeSessionId) return;
        logService.info("User deleted message", { messageId, sessionId: activeSessionId });

        const messageToDelete = messages.find(msg => msg.id === messageId);
        if (messageToDelete?.isLoading) {
            handleStopGenerating();
        }

        updateAndPersistSessions(prev => prev.map(s => 
            s.id === activeSessionId ? { ...s, messages: s.messages.filter(msg => msg.id !== messageId) } : s
        ));

        if (editingMessageId === messageId) handleCancelEdit();
        userScrolledUp.current = false;
    };

    const handleRetryMessage = async (modelMessageIdToRetry: string) => {
        if (!activeSessionId) return;
        logService.info("User retrying message", { modelMessageId: modelMessageIdToRetry, sessionId: activeSessionId });
        
        const modelMessageIndex = messages.findIndex(m => m.id === modelMessageIdToRetry);
        if (modelMessageIndex < 1) return;

        const userMessageToResend = messages[modelMessageIndex - 1];
        if (userMessageToResend.role !== 'user') return;

        if (isLoading) handleStopGenerating();
        
        // When retrying, we're effectively editing the user message that came before the failed model response.
        // This will slice the history correctly and resubmit.
        await handleSendMessage({
            text: userMessageToResend.content,
            files: userMessageToResend.files,
            editingId: userMessageToResend.id,
        });
    };

    const handleProcessLongText = useCallback(async (text: string, fileName?: string) => {
        const TEXT_LENGTH_THRESHOLD = 10000; // 超过10000字符就启用分块处理
        
        if (text.length <= TEXT_LENGTH_THRESHOLD) {
            return; // 文本不够长，不需要分块处理
        }

        let sessionId = activeSessionId;
        if (!sessionId) {
            // 创建新会话
            const newSessionId = generateUniqueId();
            const newSession: SavedChatSession = {
                id: newSessionId,
                title: fileName ? `📄 ${fileName}` : '📄 长文本理解',
                messages: [],
                timestamp: Date.now(),
                settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings },
            };
            updateAndPersistSessions(prev => [newSession, ...prev]);
            setActiveSessionId(newSessionId);
            sessionId = newSessionId;
        }

        const keyResult = getKeyForRequest(appSettings, currentChatSettings);
        if ('error' in keyResult) {
            setAppFileError(keyResult.error);
            return;
        }

        const { key: keyToUse } = keyResult;
        const newAbortController = new AbortController();
        const processingId = generateUniqueId();
        
        setLoadingSessionIds(prev => new Set(prev).add(sessionId!));
        activeJobs.current.set(processingId, newAbortController);

        // 创建初始处理消息
        const initialMessage: ChatMessage = {
            id: generateUniqueId(),
            role: 'model',
            content: `🔄 正在智能分块处理长文本（${Math.ceil(text.length / 1000)}k字符）...`,
            timestamp: new Date(),
            isLoading: true,
            isChunkedProcessing: true,
            chunkIndex: 0,
            totalChunks: 0,
        };

        updateAndPersistSessions(prev => prev.map(s => 
            s.id === sessionId ? { ...s, messages: [...s.messages, initialMessage] } : s
        ));

        try {
            await geminiServiceInstance.processTextInChunks(
                keyToUse,
                currentChatSettings.modelId || 'gemini-1.5-flash-latest',
                text,
                currentChatSettings.systemInstruction || '',
                {
                    temperature: currentChatSettings.temperature,
                    topP: currentChatSettings.topP,
                },
                newAbortController.signal,
                // onChunkProcessed
                (chunkIndex: number, totalChunks: number, summary: string) => {
                    const chunkMessage: ChatMessage = {
                        id: generateUniqueId(),
                        role: 'model',
                        content: `📖 **第${chunkIndex}部分理解完成**（共${totalChunks}部分）\n\n${summary}`,
                        timestamp: new Date(),
                        isChunkedProcessing: true,
                        chunkIndex,
                        totalChunks,
                    };

                    updateAndPersistSessions(prev => prev.map(s => 
                        s.id === sessionId 
                            ? { 
                                ...s, 
                                messages: s.messages.map(msg => 
                                    msg.id === initialMessage.id 
                                        ? { ...msg, content: `🔄 正在智能分块处理长文本...（${chunkIndex}/${totalChunks}）` }
                                        : msg
                                ).concat(chunkMessage)
                            }
                            : s
                    ));
                },
                // onComplete
                (finalSummary: string) => {
                    const finalMessage: ChatMessage = {
                        id: generateUniqueId(),
                        role: 'model',
                        content: `✅ **完整理解报告**\n\n${finalSummary}\n\n---\n*已完成对长文本的智能分块理解，模型现在已充分掌握全部内容。*`,
                        timestamp: new Date(),
                        isSummary: true,
                    };

                    updateAndPersistSessions(prev => prev.map(s => 
                        s.id === sessionId 
                            ? { 
                                ...s, 
                                messages: s.messages.map(msg => 
                                    msg.id === initialMessage.id 
                                        ? { ...msg, content: '✅ 长文本分块处理完成', isLoading: false }
                                        : msg
                                ).concat(finalMessage)
                            }
                            : s
                    ));

                    setLoadingSessionIds(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(sessionId!);
                        return newSet;
                    });
                    activeJobs.current.delete(processingId);
                },
                // onError
                (error: Error) => {
                    handleApiError(error, sessionId!, initialMessage.id, 'ChunkedProcessing');
                    setLoadingSessionIds(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(sessionId!);
                        return newSet;
                    });
                    activeJobs.current.delete(processingId);
                }
            );
        } catch (error) {
            handleApiError(error, sessionId!, initialMessage.id, 'ChunkedProcessing');
            setLoadingSessionIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(sessionId!);
                return newSet;
            });
            activeJobs.current.delete(processingId);
        }
    }, [activeSessionId, appSettings, currentChatSettings, setAppFileError, setActiveSessionId, setLoadingSessionIds, activeJobs, updateAndPersistSessions, handleApiError]);

    return {
        handleSendMessage,
        handleStopGenerating,
        handleEditMessage,
        handleCancelEdit,
        handleDeleteMessage,
        handleRetryMessage,
        handleTextToSpeech,
        handleProcessLongText,
    };
};

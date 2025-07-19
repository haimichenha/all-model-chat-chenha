import { useCallback, Dispatch, SetStateAction, useRef } from 'react';
import { AppSettings, ChatMessage, UploadedFile, ChatSettings as IndividualChatSettings, ChatHistoryItem, SavedChatSession } from '../types';
import { generateUniqueId, buildContentParts, pcmBase64ToWavUrl, createChatHistoryForApi, getKeyForRequest, generateSessionTitle } from '../utils/appUtils';
import { geminiServiceInstance } from '../services/geminiService';
import { Chat, Part, UsageMetadata } from '@google/genai';
import { logService } from '../services/logService';
import { DEFAULT_CHAT_SETTINGS } from '../constants/appConstants';

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
    loadingSessionIds,
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
        const keyResult = getKeyForRequest(appSettings, sessionToUpdate);
        if ('error' in keyResult) {
            logService.error("Send message failed: API Key not configured.");
             const errorMsg: ChatMessage = { id: generateUniqueId(), role: 'error', content: keyResult.error, timestamp: new Date() };
             const newSession: SavedChatSession = { id: generateUniqueId(), title: "API Key Error", messages: [errorMsg], settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings }, timestamp: Date.now() };
             updateAndPersistSessions(p => [newSession, ...p]);
             setActiveSessionId(newSession.id);
            return;
        }
        const { key: keyToUse, isNewKey } = keyResult;
        const shouldLockKey = isNewKey && hasFileId;

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
            if (shouldLockKey) newSessionSettings.lockedApiKey = keyToUse;

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

        const streamOnComplete = (usageMetadata?: UsageMetadata, groundingMetadata?: any) => {
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
                if(shouldLockKey) newSettings = { ...s.settings, lockedApiKey: keyToUse };

                return {...s, messages: finalMessages, settings: newSettings};
            }));
            setLoadingSessionIds(prev => { const next = new Set(prev); next.delete(currentSessionId); return next; });
            activeJobs.current.delete(generationId);
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

        if (appSettings.isStreamingEnabled) {
            await geminiServiceInstance.sendMessageStream(keyToUse, activeModelId, fullHistory, sessionToUpdate.systemInstruction, { temperature: sessionToUpdate.temperature, topP: sessionToUpdate.topP }, sessionToUpdate.showThoughts, sessionToUpdate.thinkingBudget, !!sessionToUpdate.isGoogleSearchEnabled, !!sessionToUpdate.isCodeExecutionEnabled, newAbortController.signal, streamOnPart, onThoughtChunk, streamOnError, streamOnComplete);
        } else { 
            await geminiServiceInstance.sendMessageNonStream(keyToUse, activeModelId, fullHistory, sessionToUpdate.systemInstruction, { temperature: sessionToUpdate.temperature, topP: sessionToUpdate.topP }, sessionToUpdate.showThoughts, sessionToUpdate.thinkingBudget, !!sessionToUpdate.isGoogleSearchEnabled, !!sessionToUpdate.isCodeExecutionEnabled, newAbortController.signal,
                streamOnError,
                (parts, thoughtsText, usageMetadata, groundingMetadata) => {
                    for(const part of parts) {
                        streamOnPart(part);
                    }
                    if(thoughtsText) {
                        onThoughtChunk(thoughtsText);
                    }
                    streamOnComplete(usageMetadata, groundingMetadata);
                }
            );
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

    return {
        handleSendMessage,
        handleStopGenerating,
        handleEditMessage,
        handleCancelEdit,
        handleDeleteMessage,
        handleRetryMessage,
        handleTextToSpeech,
    };
};

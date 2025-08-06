import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { AppSettings, ChatMessage, ChatSettings as IndividualChatSettings, SavedChatSession, UploadedFile, ChatGroup } from '../types';
import { DEFAULT_CHAT_SETTINGS } from '../constants/appConstants';
import { useModels } from './useModels';
import { useChatHistory } from './useChatHistory';
import { useFileHandling } from './useFileHandling';
import { usePreloadedScenarios } from './usePreloadedScenarios';
import { useMessageHandler } from './useMessageHandler';
import { useChatGroups } from './useChatGroups';
import { applyImageCachePolicy, generateUniqueId, logService } from '../utils/appUtils';
import { CHAT_HISTORY_SESSIONS_KEY } from '../constants/appConstants';
import { firebaseStorageService } from '../services/firebaseStorageService';
import { persistentStoreService } from '../services/persistentStore';

export const useChat = (appSettings: AppSettings, isServiceInitialized: boolean = false) => {
    // 1. Core application state, now managed centrally in the main hook
    const [savedSessions, setSavedSessions] = useState<SavedChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [commandedInput, setCommandedInput] = useState<{ text: string; id: number; } | null>(null);

    // State for managing concurrent generation jobs
    const [loadingSessionIds, setLoadingSessionIds] = useState(new Set<string>());
    const activeJobs = useRef(new Map<string, AbortController>());
    
    // File state
    const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
    const [appFileError, setAppFileError] = useState<string | null>(null);
    const [isAppProcessingFile, setIsAppProcessingFile] = useState<boolean>(false);
    
    // UI state
    const [aspectRatio, setAspectRatio] = useState<string>('1:1');
    const [ttsMessageId, setTtsMessageId] = useState<string | null>(null);
    const [isSwitchingModel, setIsSwitchingModel] = useState<boolean>(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const userScrolledUp = useRef<boolean>(false);
    const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false);

    // [核心优化] 实现了智能存储和自动清理功能的全新 updateAndPersistSessions 函数
    const updateAndPersistSessions = useCallback((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
        setSavedSessions(prevSessions => {
            let newSessions = updater(prevSessions);

            const attemptToSave = (sessionsToSave: SavedChatSession[]): boolean => {
                try {
                    // 我们先应用图片缓存策略，这本身就能节省一些空间
                    const sessionsForStorage = applyImageCachePolicy(sessionsToSave);
                    localStorage.setItem(CHAT_HISTORY_SESSIONS_KEY, JSON.stringify(sessionsForStorage));
                    logService.info(`Successfully saved ${sessionsToSave.length} sessions to localStorage.`);
                    
                    // [新增] 异步备份到 Firebase (不阻塞主要流程)
                    backupToFirebaseAsync(sessionsToSave);
                    
                    return true;
                } catch (error: any) {
                    // 捕获"超出配额"的错误
                    if (error.name === 'QuotaExceededError' || (error.message && error.message.toLowerCase().includes('quota'))) {
                        logService.warn('LocalStorage quota exceeded. Attempting to prune sessions.');
                        
                        // [新增] 存储满时，尝试备份到 Firebase 并显示带导出功能的对话框
                        handleStorageFullWithBackup(sessionsToSave);
                        
                        return false;
                    }
                    // 对于其他未知错误，我们只记录日志，不进行清理
                    logService.error('Failed to save sessions to localStorage due to an unexpected error:', error);
                    return true; 
                }
            };

            // [新增] Firebase 异步备份函数
            const backupToFirebaseAsync = async (sessions: SavedChatSession[]): Promise<void> => {
                try {
                    const persistentStore = persistentStoreService.exportData();
                    await firebaseStorageService.backupToFirebase(sessions, persistentStore);
                    logService.info('Sessions backed up to Firebase successfully');
                } catch (error) {
                    logService.warn('Firebase backup failed (non-critical):', error);
                }
            };

            // [新增] 处理存储满的情况，包括备份和显示对话框
            const handleStorageFullWithBackup = async (sessions: SavedChatSession[]): Promise<void> => {
                try {
                    // 先尝试备份到 Firebase
                    const persistentStore = persistentStoreService.exportData();
                    const firebaseBackupSuccess = await firebaseStorageService.backupToFirebase(sessions, persistentStore);
                    
                    if (firebaseBackupSuccess) {
                        showStorageFullDialogWithFirebaseBackup();
                    } else {
                        showStorageFullDialogWithExportOnly();
                    }
                } catch (error) {
                    logService.error('Failed to backup to Firebase during storage full event:', error);
                    showStorageFullDialogWithExportOnly();
                }
            };

            // [新增] 显示存储满对话框（包含 Firebase 备份信息）
            const showStorageFullDialogWithFirebaseBackup = (): void => {
                const dialog = document.createElement('div');
                dialog.id = 'storage-full-dialog';
                dialog.innerHTML = `
                    <div style="
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
                        background: rgba(0,0,0,0.5); z-index: 10000; 
                        display: flex; align-items: center; justify-content: center;
                    ">
                        <div style="
                            background: white; padding: 24px; border-radius: 8px; 
                            max-width: 500px; margin: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        ">
                            <h2 style="color: #333; margin: 0 0 16px 0; font-size: 18px;">存储空间已满</h2>
                            <p style="color: #666; margin: 0 0 16px 0; line-height: 1.5;">
                                浏览器存储空间不足，但您的聊天记录已自动备份到云端。
                            </p>
                            <p style="color: #059669; margin: 0 0 20px 0; font-size: 14px;">
                                ✅ 数据已安全备份到 Firebase 云存储
                            </p>
                            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                                <button id="export-data-btn" style="
                                    background: #2563eb; color: white; border: none; 
                                    padding: 8px 16px; border-radius: 4px; cursor: pointer;
                                ">导出本地数据</button>
                                <button id="restore-from-firebase-btn" style="
                                    background: #059669; color: white; border: none; 
                                    padding: 8px 16px; border-radius: 4px; cursor: pointer;
                                ">恢复云端数据</button>
                                <button id="close-dialog-btn" style="
                                    background: #6b7280; color: white; border: none; 
                                    padding: 8px 16px; border-radius: 4px; cursor: pointer;
                                ">确定</button>
                            </div>
                        </div>
                    </div>
                `;
                addDialogEventListeners(dialog);
            };

            // [新增] 显示存储满对话框（仅本地导出）
            const showStorageFullDialogWithExportOnly = (): void => {
                const dialog = document.createElement('div');
                dialog.id = 'storage-full-dialog';
                dialog.innerHTML = `
                    <div style="
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
                        background: rgba(0,0,0,0.5); z-index: 10000; 
                        display: flex; align-items: center; justify-content: center;
                    ">
                        <div style="
                            background: white; padding: 24px; border-radius: 8px; 
                            max-width: 500px; margin: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        ">
                            <h2 style="color: #333; margin: 0 0 16px 0; font-size: 18px;">存储空间已满</h2>
                            <p style="color: #666; margin: 0 0 20px 0; line-height: 1.5;">
                                浏览器存储空间不足。建议导出聊天记录后清理部分数据。
                            </p>
                            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                                <button id="export-data-btn" style="
                                    background: #2563eb; color: white; border: none; 
                                    padding: 8px 16px; border-radius: 4px; cursor: pointer;
                                ">导出数据</button>
                                <button id="close-dialog-btn" style="
                                    background: #6b7280; color: white; border: none; 
                                    padding: 8px 16px; border-radius: 4px; cursor: pointer;
                                ">确定</button>
                            </div>
                        </div>
                    </div>
                `;
                addDialogEventListeners(dialog);
            };

            // [新增] 为对话框添加事件监听器
            const addDialogEventListeners = (dialog: HTMLElement): void => {
                dialog.querySelector('#export-data-btn')?.addEventListener('click', () => {
                    exportSessionsToJSON();
                    dialog.remove();
                });

                dialog.querySelector('#restore-from-firebase-btn')?.addEventListener('click', async () => {
                    try {
                        const restored = await firebaseStorageService.restoreFromFirebase();
                        if (restored && restored.sessions) {
                            setSavedSessions(restored.sessions);
                            alert('云端数据恢复成功！');
                        } else {
                            alert('未找到云端备份数据。');
                        }
                    } catch (error) {
                        alert('恢复云端数据失败，请检查网络连接。');
                    }
                    dialog.remove();
                });

                dialog.querySelector('#close-dialog-btn')?.addEventListener('click', () => {
                    dialog.remove();
                });

                document.body.appendChild(dialog);
            };

            // [新增] 导出会话数据为 JSON 文件
            const exportSessionsToJSON = (): void => {
                try {
                    const dataStr = JSON.stringify(newSessions, null, 2);
                    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
                    
                    const link = document.createElement('a');
                    link.setAttribute('href', dataUri);
                    link.setAttribute('download', `chat-sessions-${new Date().toISOString().split('T')[0]}.json`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    logService.info('Chat sessions exported successfully');
                } catch (error) {
                    logService.error('Failed to export sessions:', error);
                    alert('导出失败，请重试。');
                }
            };

            // 第一次尝试保存
            if (attemptToSave(newSessions)) {
                return newSessions; // 保存成功，直接更新状态并返回
            }

            // --- 如果保存失败，启动自动清理逻辑 ---
            alert('浏览器存储空间已满。为保存最新记录，将自动清理最旧的、未固定的聊天会话。');
            
            let prunedSessions = [...newSessions];
            let prunedCount = 0;

            // 循环清理，直到保存成功
            while (!attemptToSave(prunedSessions)) {
                // 按时间戳升序排序，最旧的在最前面
                const sorted = prunedSessions.sort((a, b) => a.timestamp - b.timestamp);
                
                // 找到第一个可以被删除的会话（即没有被固定的）
                const indexToRemove = sorted.findIndex(s => !s.isPinned);

                if (indexToRemove === -1) {
                    // 如果所有会话都已被固定，但空间仍然不足
                    logService.error('Pruning failed: No more non-pinned sessions to remove, but quota is still exceeded.');
                    alert('自动清理失败：所有会话均已固定，无法腾出足够空间。请手动导出并清理聊天记录以防数据丢失。');
                    // 即使无法保存，也要在内存中返回最新的状态，避免丢失当前操作
                    return newSessions;
                }
                
                const sessionToRemove = sorted[indexToRemove];
                prunedSessions = prunedSessions.filter(s => s.id !== sessionToRemove.id);
                prunedCount++;
                logService.info(`Pruning session: "${sessionToRemove.title}" (ID: ${sessionToRemove.id})`);
            }
            
            if (prunedCount > 0) {
                logService.info(`Successfully pruned ${prunedCount} session(s) and saved the history.`);
            }
            
            return prunedSessions; // 返回清理后的会话列表
        });
    }, []);

    // 2. Derive active session state from the core state
    const activeChat = useMemo(() => {
        return savedSessions.find(s => s.id === activeSessionId);
    }, [savedSessions, activeSessionId]);

    const messages = useMemo(() => activeChat?.messages || [], [activeChat]);
    const currentChatSettings = useMemo(() => activeChat?.settings || DEFAULT_CHAT_SETTINGS, [activeChat]);
    const isLoading = useMemo(() => loadingSessionIds.has(activeSessionId ?? ''), [loadingSessionIds, activeSessionId]);
    
    // 3. Child hooks for modular logic
    // [修改] 3. 将信号灯状态传递给 useModels
    const { apiModels, isModelsLoading, modelsLoadingError } = useModels(appSettings, isServiceInitialized);
    
    const setCurrentChatSettings = useCallback((updater: (prevSettings: IndividualChatSettings) => IndividualChatSettings) => {
        if (!activeSessionId) return;
        updateAndPersistSessions(prevSessions =>
            prevSessions.map(s =>
                s.id === activeSessionId
                    ? { ...s, settings: updater(s.settings) }
                    : s
            )
        );
    }, [activeSessionId, updateAndPersistSessions]);

    const fileHandler = useFileHandling({
        appSettings,
        selectedFiles,
        setSelectedFiles,
        setAppFileError,
        isAppProcessingFile,
        setIsAppProcessingFile,
        currentChatSettings,
        setCurrentChatSettings: setCurrentChatSettings,
    });
    
    const messageHandler = useMessageHandler({
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
        updateAndPersistSessions,
    });

    // historyHandler now depends on messageHandler
    const historyHandler = useChatHistory({
        appSettings,
        setSavedSessions,
        setActiveSessionId,
        setEditingMessageId,
        setCommandedInput,
        setSelectedFiles,
        activeJobs,
        updateAndPersistSessions,
        activeChat,
        onProcessLongText: messageHandler.handleProcessLongText, // Connect the modules
    });
    
    const groupsHandler = useChatGroups({ updateAndPersistSessions });
    
    const scenarioHandler = usePreloadedScenarios({ startNewChat: historyHandler.startNewChat, updateAndPersistSessions });

    const handleExportAllSessions = useCallback(() => {
        alert('即将执行真正的下载代码！'); 
        if (savedSessions.length === 0) {
            logService.info('No chat sessions to export.');
            alert('没有可导出的聊天记录。'); // 给用户一个直接的反馈
            return;
        }

        logService.info(`Exporting ${savedSessions.length} chat sessions to a text file.`);

        const fileContent = savedSessions
            .sort((a, b) => a.timestamp - b.timestamp) // 按时间从旧到新排序
            .map(session => {
                const sessionHeader = `==================================================\n# 聊天会话: ${session.title}\n# 会话 ID: ${session.id}\n# 创建时间: ${new Date(session.timestamp).toLocaleString()}\n# 系统指令: ${session.settings.systemInstruction || '(无)'}\n# 模型设置: ${session.settings.modelId} (温度: ${session.settings.temperature}, Top-P: ${session.settings.topP})\n==================================================\n\n`;

                const messagesContent = session.messages
                    .map(message => {
                        const messageHeader = `----------\n[${message.role === 'user' ? '用户' : '模型'} - ${new Date(message.timestamp).toLocaleString()}]\n----------\n`;
                        const filesContent = message.files && message.files.length > 0
                            ? `\n[附加文件: ${message.files.map(f => f.name).join(', ')}]\n`
                            : '';
                        return `${messageHeader}${message.content}${filesContent}\n`;
                    })
                    .join('\n');

                return sessionHeader + messagesContent;
            })
            .join('\n\n\n');

        try {
            const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
            a.download = `all-model-chat-history_${timestamp}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            logService.info('Successfully triggered download for all sessions.');
        } catch (error) {
            logService.error('Failed to create and download the export file.', error);
            alert('创建导出文件失败，请查看控制台日志获取详情。');
        }
    }, [savedSessions]);
    
    // Initial data loading from history
    useEffect(() => {
        historyHandler.loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Listen for network restoration to clear network-related errors
    useEffect(() => {
        const handleOnline = () => {
            setAppFileError(currentError => {
                if (currentError && (currentError.toLowerCase().includes('network') || currentError.toLowerCase().includes('fetch'))) {
                    logService.info('Network restored, clearing file processing error.');
                    return null;
                }
                return currentError;
            });
        };
        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [setAppFileError]);

    // Effect to automatically clear file processing errors if no files are processing.
    useEffect(() => {
        const isFileProcessing = selectedFiles.some(file => file.isProcessing);
        // This specifically targets the bug where an error about a processing file persists
        // after that file has been removed by the user from the list.
        if (appFileError === 'Wait for files to finish processing.' && !isFileProcessing) {
            setAppFileError(null);
        }
    }, [selectedFiles, appFileError, setAppFileError]);

    // Memory management for file previews in messages (using blob URLs)
    const messagesForCleanupRef = useRef<ChatMessage[]>([]);
    useEffect(() => {
        const prevFiles = messagesForCleanupRef.current.flatMap(m => m.files || []);
        const currentFiles = savedSessions.flatMap(s => s.messages).flatMap(m => m.files || []);
        const removedFiles = prevFiles.filter(prevFile => !currentFiles.some(currentFile => currentFile.id === prevFile.id));
        removedFiles.forEach(file => { if (file.dataUrl && file.dataUrl.startsWith('blob:')) URL.revokeObjectURL(file.dataUrl); });
        messagesForCleanupRef.current = savedSessions.flatMap(s => s.messages);
    }, [savedSessions]);
    useEffect(() => () => { messagesForCleanupRef.current.flatMap(m => m.files || []).forEach(file => { if (file.dataUrl?.startsWith('blob:')) URL.revokeObjectURL(file.dataUrl); }); }, []);

    // Scrolling logic
    const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messagesEndRef]);
    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (container) {
            const isScrolledUp = (container.scrollHeight - container.scrollTop - container.clientHeight) > 100;
            setShowScrollToBottom(isScrolledUp);
            userScrolledUp.current = isScrolledUp;
        }
    }, [scrollContainerRef]);
    useEffect(() => { if (!userScrolledUp.current) scrollToBottom(); }, [messages, scrollToBottom]);

    // Effect to validate current model against available models
    useEffect(() => {
        if (!isModelsLoading && apiModels.length > 0 && activeChat && !apiModels.some(m => m.id === activeChat.settings.modelId)) {
            const preferredModelId = apiModels.find(m => m.isPinned)?.id || apiModels[0]?.id;
            if(preferredModelId) {
                updateAndPersistSessions(prev => prev.map(s => s.id === activeSessionId ? {...s, settings: {...s.settings, modelId: preferredModelId }} : s));
            }
        }
    }, [isModelsLoading, apiModels, activeChat, activeSessionId, updateAndPersistSessions]);
    
    // UI Action Handlers
    const handleSelectModelInHeader = useCallback((modelId: string) => {
        if (!activeSessionId) {
            const newSessionId = generateUniqueId();
            const newSession: SavedChatSession = {
                id: newSessionId,
                title: 'New Chat',
                messages: [],
                timestamp: Date.now(),
                settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings, modelId: modelId },
            };
            updateAndPersistSessions(prev => [newSession, ...prev]);
            setActiveSessionId(newSessionId);
        } else {
            if (isLoading) messageHandler.handleStopGenerating();
            if (modelId !== currentChatSettings.modelId) {
                setIsSwitchingModel(true);
                updateAndPersistSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, settings: { ...s.settings, modelId } } : s));
            }
        }
        userScrolledUp.current = false;
    }, [isLoading, currentChatSettings.modelId, updateAndPersistSessions, activeSessionId, userScrolledUp, messageHandler, appSettings, setActiveSessionId]);

    useEffect(() => { if (isSwitchingModel) { const timer = setTimeout(() => setIsSwitchingModel(false), 0); return () => clearTimeout(timer); } }, [isSwitchingModel]);
    
    const handleClearCurrentChat = useCallback(() => {
        if (isLoading) messageHandler.handleStopGenerating();
        if (activeSessionId) historyHandler.handleDeleteChatHistorySession(activeSessionId);
        else historyHandler.startNewChat();
        
    }, [isLoading, activeSessionId, historyHandler, messageHandler]);

     const toggleGoogleSearch = useCallback(() => {
        if (!activeSessionId) return;
        if (isLoading) messageHandler.handleStopGenerating();
        setCurrentChatSettings(prev => ({
            ...prev,
            isGoogleSearchEnabled: !prev.isGoogleSearchEnabled,
        }));
    }, [activeSessionId, isLoading, setCurrentChatSettings, messageHandler]);
    
    const toggleCodeExecution = useCallback(() => {
        if (!activeSessionId) return;
        if (isLoading) messageHandler.handleStopGenerating();
        setCurrentChatSettings(prev => ({
            ...prev,
            isCodeExecutionEnabled: !prev.isCodeExecutionEnabled,
        }));
    }, [activeSessionId, isLoading, setCurrentChatSettings, messageHandler]);

    const toggleUrlContext = useCallback(() => {
        if (!activeSessionId) return;
        if (isLoading) messageHandler.handleStopGenerating();
        setCurrentChatSettings(prev => ({
            ...prev,
            isUrlContextEnabled: !prev.isUrlContextEnabled,
        }));
    }, [activeSessionId, isLoading, setCurrentChatSettings, messageHandler]);

    return {
        messages,
        isLoading,
        loadingSessionIds,
        currentChatSettings,
        editingMessageId,
        setEditingMessageId,
        commandedInput,
        setCommandedInput,
        selectedFiles,
        setSelectedFiles,
        appFileError,
        isAppProcessingFile,
        savedSessions,
        savedGroups: groupsHandler.savedGroups,
        activeSessionId,
        apiModels,
        isModelsLoading,
        modelsLoadingError,
        isSwitchingModel,
        messagesEndRef,
        scrollContainerRef,
        savedScenarios: scenarioHandler.savedScenarios,
        isAppDraggingOver: fileHandler.isAppDraggingOver,
        aspectRatio,
        setAspectRatio,
        ttsMessageId,
        loadChatSession: historyHandler.loadChatSession,
        startNewChat: historyHandler.startNewChat,
        handleClearCurrentChat,
        handleSelectModelInHeader,
        handleProcessAndAddFiles: fileHandler.handleProcessAndAddFiles,
        handleSendMessage: messageHandler.handleSendMessage,
        handleStopGenerating: messageHandler.handleStopGenerating,
        handleEditMessage: messageHandler.handleEditMessage,
        handleCancelEdit: messageHandler.handleCancelEdit,
        handleDeleteMessage: messageHandler.handleDeleteMessage,
        handleRetryMessage: messageHandler.handleRetryMessage,
        handleDeleteChatHistorySession: historyHandler.handleDeleteChatHistorySession,
        handleRenameSession: historyHandler.handleRenameSession,
        handleTogglePinSession: historyHandler.handleTogglePinSession,
        handleAddNewGroup: groupsHandler.handleAddNewGroup,
        handleDeleteGroup: groupsHandler.handleDeleteGroup,
        handleRenameGroup: groupsHandler.handleRenameGroup,
        handleMoveSessionToGroup: groupsHandler.handleMoveSessionToGroup,
        handleToggleGroupExpansion: groupsHandler.handleToggleGroupExpansion,
        handleTogglePinGroup: groupsHandler.handleTogglePinGroup,
        clearCacheAndReload: historyHandler.clearCacheAndReload,
        handleSaveAllScenarios: scenarioHandler.handleSaveAllScenarios,
        handleLoadPreloadedScenario: scenarioHandler.handleLoadPreloadedScenario,
        handleImportPreloadedScenario: scenarioHandler.handleImportPreloadedScenario,
        handleExportPreloadedScenario: scenarioHandler.handleExportPreloadedScenario,
        handleImportSessions: historyHandler.handleImportSessions,
        handleScroll,
        handleAppDragEnter: fileHandler.handleAppDragEnter,
        handleAppDragOver: fileHandler.handleAppDragOver,
        handleAppDragLeave: fileHandler.handleAppDragLeave,
        handleAppDrop: fileHandler.handleAppDrop,
        handleCancelFileUpload: fileHandler.handleCancelFileUpload,
        handleAddFileById: fileHandler.handleAddFileById,
        handleTextToSpeech: messageHandler.handleTextToSpeech,
        handleProcessLongText: messageHandler.handleProcessLongText,
        setCurrentChatSettings,
        showScrollToBottom,
        scrollToBottom,
        toggleGoogleSearch,
        toggleCodeExecution,
        toggleUrlContext,

        handleExportAllSessions,
    };
};

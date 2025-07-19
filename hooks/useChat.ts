import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { AppSettings, ChatMessage, ChatSettings as IndividualChatSettings, SavedChatSession, UploadedFile } from '../types';
import { DEFAULT_CHAT_SETTINGS } from '../constants/appConstants';
import { useModels } from './useModels';
import { useChatHistory } from './useChatHistory';
import { useFileHandling } from './useFileHandling';
import { usePreloadedScenarios } from './usePreloadedScenarios';
import { useMessageHandler } from './useMessageHandler';
import { applyImageCachePolicy, generateUniqueId, logService } from '../utils/appUtils';
import { CHAT_HISTORY_SESSIONS_KEY } from '../constants/appConstants';

export const useChat = (appSettings: AppSettings) => {
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

    // Wrapper function to persist sessions to localStorage whenever they are updated
    const updateAndPersistSessions = useCallback((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
        setSavedSessions(prevSessions => {
            const newSessions = updater(prevSessions);
            const sessionsForStorage = applyImageCachePolicy(newSessions);
            localStorage.setItem(CHAT_HISTORY_SESSIONS_KEY, JSON.stringify(sessionsForStorage));
            return newSessions;
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
    const { apiModels, isModelsLoading, modelsLoadingError } = useModels(appSettings);
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
    });
    
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
    const scenarioHandler = usePreloadedScenarios({ startNewChat: historyHandler.startNewChat, updateAndPersistSessions });
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
                const sessionHeader = `==================================================\n# 聊天会话: ${session.title}\n# 会话 ID: ${session.id}\n# 创建时间: ${new Date(session.timestamp).toLocaleString()}\n==================================================\n\n`;

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
        clearCacheAndReload: historyHandler.clearCacheAndReload,
        handleSaveAllScenarios: scenarioHandler.handleSaveAllScenarios,
        handleLoadPreloadedScenario: scenarioHandler.handleLoadPreloadedScenario,
        handleImportPreloadedScenario: scenarioHandler.handleImportPreloadedScenario,
        handleExportPreloadedScenario: scenarioHandler.handleExportPreloadedScenario,
        handleScroll,
        handleAppDragEnter: fileHandler.handleAppDragEnter,
        handleAppDragOver: fileHandler.handleAppDragOver,
        handleAppDragLeave: fileHandler.handleAppDragLeave,
        handleAppDrop: fileHandler.handleAppDrop,
        handleCancelFileUpload: fileHandler.handleCancelFileUpload,
        handleAddFileById: fileHandler.handleAddFileById,
        handleTextToSpeech: messageHandler.handleTextToSpeech,
        setCurrentChatSettings,
        showScrollToBottom,
        scrollToBottom,
        toggleGoogleSearch,
        toggleCodeExecution,

        handleExportAllSessions,
    };
};

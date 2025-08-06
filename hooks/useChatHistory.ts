import { Dispatch, SetStateAction, useCallback } from 'react';
import { AppSettings, ChatMessage, SavedChatSession, UploadedFile, ChatSettings } from '../types';
import { CHAT_HISTORY_SESSIONS_KEY, ACTIVE_CHAT_SESSION_ID_KEY, DEFAULT_CHAT_SETTINGS } from '../constants/appConstants';
import { generateUniqueId, logService } from '../utils/appUtils';
import { firebaseStorageService } from '../services/firebaseStorageService';

type CommandedInputSetter = Dispatch<SetStateAction<{ text: string; id: number; } | null>>;
type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;

interface ChatHistoryProps {
    appSettings: AppSettings;
    setSavedSessions: Dispatch<SetStateAction<SavedChatSession[]>>;
    setActiveSessionId: Dispatch<SetStateAction<string | null>>;
    setEditingMessageId: Dispatch<SetStateAction<string | null>>;
    setCommandedInput: CommandedInputSetter;
    setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
    activeJobs: React.MutableRefObject<Map<string, AbortController>>;
    updateAndPersistSessions: SessionsUpdater;
    activeChat: SavedChatSession | undefined;
    onProcessLongText?: (text: string, fileName: string) => void; // 新增回调函数
}

export const useChatHistory = ({
    appSettings,
    setSavedSessions,
    setActiveSessionId,
    setEditingMessageId,
    setCommandedInput,
    setSelectedFiles,
    activeJobs,
    updateAndPersistSessions,
    activeChat,
    onProcessLongText, // 新增回调函数
}: ChatHistoryProps) => {

    const startNewChat = useCallback(() => {
        logService.info('Starting new chat session.');
        
        let settingsForNewChat: ChatSettings = { ...DEFAULT_CHAT_SETTINGS, ...appSettings };
        if (activeChat) {
            settingsForNewChat = {
                ...settingsForNewChat,
                modelId: activeChat.settings.modelId,
                lockedApiKey: activeChat.settings.lockedApiKey,
                isGoogleSearchEnabled: activeChat.settings.isGoogleSearchEnabled,
            };
        }

        // Create a new session immediately
        const newSessionId = generateUniqueId();
        const newSession: SavedChatSession = {
            id: newSessionId,
            title: "New Chat",
            messages: [],
            timestamp: Date.now(),
            settings: settingsForNewChat,
        };

        // Add new session and remove any other empty sessions from before.
        updateAndPersistSessions(prev => [newSession, ...prev.filter(s => s.messages.length > 0)]);

        // Set it as the active session
        setActiveSessionId(newSessionId);
        localStorage.setItem(ACTIVE_CHAT_SESSION_ID_KEY, newSessionId);

        // Reset UI state
        setCommandedInput({ text: '', id: Date.now() });
        setSelectedFiles([]);
        setEditingMessageId(null);
        
        setTimeout(() => {
            document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Chat message input"]')?.focus();
        }, 0);
    }, [appSettings, activeChat, updateAndPersistSessions, setActiveSessionId, setCommandedInput, setSelectedFiles, setEditingMessageId]);

    const loadChatSession = useCallback((sessionId: string, allSessions: SavedChatSession[]) => {
        logService.info(`Loading chat session: ${sessionId}`);
        const sessionToLoad = allSessions.find(s => s.id === sessionId);
        if (sessionToLoad) {
            setActiveSessionId(sessionToLoad.id);
            localStorage.setItem(ACTIVE_CHAT_SESSION_ID_KEY, sessionId);
            setCommandedInput({ text: '', id: Date.now() });
            setSelectedFiles([]);
            setEditingMessageId(null);
        } else {
            logService.warn(`Session ${sessionId} not found. Starting new chat.`);
            startNewChat();
        }
    }, [setActiveSessionId, setCommandedInput, setSelectedFiles, setEditingMessageId, startNewChat]);

    const loadInitialData = useCallback(() => {
        try {
            logService.info('Attempting to load chat history from localStorage.');
            
            // [安全增强] 首先检查 localStorage 是否可用并测试写入能力
            try {
                const testKey = '__storage_test__';
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
            } catch (storageError: any) {
                logService.error('LocalStorage is not available or writable:', storageError);
                alert('警告：浏览器存储功能不可用，聊天记录将无法保存。这可能是因为隐私模式或存储配额耗尽。');
                // 即使存储不可用，也要启动应用，只是无法持久化
                startNewChat();
                return;
            }

            const storedSessions = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
            let sessions: SavedChatSession[] = [];
            
            if (storedSessions) {
                try {
                    const parsed = JSON.parse(storedSessions);
                    if (Array.isArray(parsed)) {
                        sessions = parsed;
                        
                        // [安全增强] 验证会话数据的完整性
                        sessions = sessions.filter(session => {
                            if (!session.id || !session.title || !session.timestamp) {
                                logService.warn(`Removing corrupted session: ${JSON.stringify(session)}`);
                                return false;
                            }
                            return true;
                        });
                        
                        logService.info(`Successfully loaded ${sessions.length} valid sessions from localStorage.`);
                    } else {
                        logService.warn('Stored chat history is corrupted (not an array). Discarding.');
                        localStorage.removeItem(CHAT_HISTORY_SESSIONS_KEY);
                    }
                } catch (parseError) {
                    logService.error('Failed to parse chat history from localStorage. Discarding.', { error: parseError });
                    
                    // [安全增强] 尝试备份损坏的数据以便调试
                    try {
                        const corruptedData = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
                        logService.error('Corrupted localStorage data:', corruptedData?.substring(0, 500) + '...');
                    } catch (e) {
                        // 忽略备份失败
                    }
                    
                    localStorage.removeItem(CHAT_HISTORY_SESSIONS_KEY);
                }
            }

            sessions.sort((a, b) => b.timestamp - a.timestamp);
            setSavedSessions(sessions);

            const storedActiveId = localStorage.getItem(ACTIVE_CHAT_SESSION_ID_KEY);
            if (storedActiveId && sessions.find(s => s.id === storedActiveId)) {
                loadChatSession(storedActiveId, sessions);
            } else if (sessions.length > 0) {
                logService.info('No active session ID, loading most recent session.');
                loadChatSession(sessions[0].id, sessions);
            } else {
                logService.info('No history found, starting fresh chat.');
                startNewChat();
            }
        } catch (error) {
            logService.error("Critical error loading chat history:", error);
            // [安全增强] 确保在任何错误情况下应用都能启动
            startNewChat();
        }
    }, [setSavedSessions, loadChatSession, startNewChat]);
    
    const handleDeleteChatHistorySession = useCallback((sessionId: string) => {
        logService.info(`Deleting session: ${sessionId}`);

        // Abort any running job for the session being deleted
        updateAndPersistSessions(prev => {
             const sessionToDelete = prev.find(s => s.id === sessionId);
             if (sessionToDelete) {
                 sessionToDelete.messages.forEach(msg => {
                     if(msg.isLoading && activeJobs.current.has(msg.id)) {
                         activeJobs.current.get(msg.id)?.abort();
                         activeJobs.current.delete(msg.id);
                     }
                 });
             }
             return prev.filter(s => s.id !== sessionId);
        });

        // If the deleted session was active, load the next available one or start new
        setActiveSessionId(prevActiveId => {
            if (prevActiveId === sessionId) {
                const sessionsAfterDelete = JSON.parse(localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY) || '[]') as SavedChatSession[];
                sessionsAfterDelete.sort((a,b) => b.timestamp - a.timestamp);
                const nextSessionToLoad = sessionsAfterDelete[0];
                if (nextSessionToLoad) {
                     loadChatSession(nextSessionToLoad.id, sessionsAfterDelete);
                     return nextSessionToLoad.id;
                } else {
                    startNewChat();
                    return null;
                }
            }
            return prevActiveId;
        });

    }, [updateAndPersistSessions, activeJobs, setActiveSessionId, loadChatSession, startNewChat]);
    
    const handleRenameSession = useCallback((sessionId: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        logService.info(`Renaming session ${sessionId} to "${newTitle}"`);
        updateAndPersistSessions(prev =>
            prev.map(s => (s.id === sessionId ? { ...s, title: newTitle.trim() } : s))
        );
    }, [updateAndPersistSessions]);

    const handleTogglePinSession = useCallback((sessionId: string) => {
        logService.info(`Toggling pin for session ${sessionId}`);
        updateAndPersistSessions(prev =>
            prev.map(s => s.id === sessionId ? { ...s, isPinned: !s.isPinned } : s)
        );
    }, [updateAndPersistSessions]);

    const clearAllHistory = useCallback(() => {
        logService.warn('User clearing all chat history.');
        
        activeJobs.current.forEach(controller => controller.abort());
        activeJobs.current.clear();
        
        localStorage.removeItem(CHAT_HISTORY_SESSIONS_KEY);
        setSavedSessions([]);
        startNewChat();
    }, [setSavedSessions, startNewChat, activeJobs]);
    
    const clearCacheAndReload = useCallback(() => {
        clearAllHistory();
        localStorage.clear();
        setTimeout(() => window.location.reload(), 50);
    }, [clearAllHistory]);

    const handleImportSessions = useCallback((sessionsToImport: SavedChatSession[], textContent?: string, fileName?: string) => {
        logService.info(`Importing ${sessionsToImport.length} sessions.`);
        
        // If we have text content, this is a plain text import that should be processed
        if (textContent && fileName && onProcessLongText) {
            onProcessLongText(textContent, fileName);
            return;
        }
        
        // Otherwise, handle structured session import
        const validatedSessions = sessionsToImport.map(s => ({
            ...s,
            id: generateUniqueId(), // Assign a new ID to avoid conflicts
            isImported: true,
            timestamp: Date.now(), // Set import timestamp
            title: `[导入] ${s.title}`, // Mark as imported
        }));

        updateAndPersistSessions(prev => [...validatedSessions, ...prev]);
        
        // Load the first imported session
        if (validatedSessions.length > 0) {
            const firstSession = validatedSessions[0];
            loadChatSession(firstSession.id, [...validatedSessions, ...JSON.parse(localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY) || '[]')]);
        }
    }, [updateAndPersistSessions, loadChatSession, onProcessLongText]);

    return {
        loadInitialData,
        loadChatSession,
        startNewChat,
        handleDeleteChatHistorySession,
        handleRenameSession,
        handleTogglePinSession,
        clearAllHistory,
        clearCacheAndReload,
        handleImportSessions,
    };
}
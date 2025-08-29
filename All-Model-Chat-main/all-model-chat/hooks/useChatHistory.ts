import { Dispatch, SetStateAction, useCallback } from 'react';
import { AppSettings, ChatMessage, SavedChatSession, UploadedFile, ChatSettings, ChatGroup } from '../types';
import { CHAT_HISTORY_SESSIONS_KEY, ACTIVE_CHAT_SESSION_ID_KEY, DEFAULT_CHAT_SETTINGS, CHAT_HISTORY_GROUPS_KEY } from '../constants/appConstants';
import { generateUniqueId, logService, getTranslator } from '../utils/appUtils';
import { splitTextIntoChunks, createProgressDialog, analyzeTextType, generateSimpleSummary } from './textProcessingUtils';
import { intelligentTextAnalysisService } from '../services/intelligentTextAnalysisService';

type CommandedInputSetter = Dispatch<SetStateAction<{ text: string; id: number; } | null>>;
type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;

interface ChatHistoryProps {
    appSettings: AppSettings;
    setSavedSessions: Dispatch<SetStateAction<SavedChatSession[]>>;
    setSavedGroups: Dispatch<SetStateAction<ChatGroup[]>>;
    setActiveSessionId: Dispatch<SetStateAction<string | null>>;
    setEditingMessageId: Dispatch<SetStateAction<string | null>>;
    setCommandedInput: CommandedInputSetter;
    setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
    activeJobs: React.MutableRefObject<Map<string, AbortController>>;
    updateAndPersistSessions: SessionsUpdater;
    activeChat: SavedChatSession | undefined;
    language: 'en' | 'zh';
}

export const useChatHistory = ({
    appSettings,
    setSavedSessions,
    setSavedGroups,
    setActiveSessionId,
    setEditingMessageId,
    setCommandedInput,
    setSelectedFiles,
    activeJobs,
    updateAndPersistSessions,
    activeChat,
    language,
}: ChatHistoryProps) => {
    const t = getTranslator(language);

    const updateAndPersistGroups = useCallback((updater: (prev: ChatGroup[]) => ChatGroup[]) => {
        setSavedGroups(prevGroups => {
            const newGroups = updater(prevGroups);
            localStorage.setItem(CHAT_HISTORY_GROUPS_KEY, JSON.stringify(newGroups));
            return newGroups;
        });
    }, [setSavedGroups]);


    const startNewChat = useCallback(() => {
        logService.info('Starting new chat session.');
        
        let settingsForNewChat: ChatSettings = { ...DEFAULT_CHAT_SETTINGS, ...appSettings };
        if (activeChat) {
            settingsForNewChat = {
                ...settingsForNewChat,
                isGoogleSearchEnabled: activeChat.settings.isGoogleSearchEnabled,
                isCodeExecutionEnabled: activeChat.settings.isCodeExecutionEnabled,
                isUrlContextEnabled: activeChat.settings.isUrlContextEnabled,
            };
        }

        const newSessionId = generateUniqueId();
        const newSession: SavedChatSession = {
            id: newSessionId,
            title: "New Chat",
            messages: [],
            timestamp: Date.now(),
            settings: settingsForNewChat,
            groupId: null,
        };

        updateAndPersistSessions(prev => [newSession, ...prev.filter(s => s.messages.length > 0)]);
        setActiveSessionId(newSessionId);
        localStorage.setItem(ACTIVE_CHAT_SESSION_ID_KEY, newSessionId);

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
            const storedSessions = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
            let sessions: SavedChatSession[] = [];
            if (storedSessions) {
                try {
                    const parsed = JSON.parse(storedSessions);
                    if (Array.isArray(parsed)) {
                        sessions = parsed;
                    } else {
                        logService.warn('Stored chat history is corrupted (not an array). Discarding.');
                        localStorage.removeItem(CHAT_HISTORY_SESSIONS_KEY);
                    }
                } catch (e) {
                    logService.error('Failed to parse chat history from localStorage. Discarding.', { error: e });
                    localStorage.removeItem(CHAT_HISTORY_SESSIONS_KEY);
                }
            }
            sessions.sort((a,b) => b.timestamp - a.timestamp);
            setSavedSessions(sessions);

            const storedGroups = localStorage.getItem(CHAT_HISTORY_GROUPS_KEY);
            if (storedGroups) {
                try {
                    const parsedGroups = JSON.parse(storedGroups);
                    if (Array.isArray(parsedGroups)) {
                        setSavedGroups(parsedGroups.map(g => ({...g, isExpanded: g.isExpanded ?? true})));
                    }
                } catch (e) {
                    logService.error('Failed to parse groups from localStorage.', { error: e });
                }
            }

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
            logService.error("Error loading chat history:", error);
            startNewChat();
        }
    }, [setSavedSessions, setSavedGroups, loadChatSession, startNewChat]);
    
    const handleDeleteChatHistorySession = useCallback((sessionId: string) => {
        logService.info(`Deleting session: ${sessionId}`);
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
        // The logic to switch to a new active session is now handled declaratively in useChat.ts's useEffect.
    }, [updateAndPersistSessions, activeJobs]);
    
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

    const handleAddNewGroup = useCallback(() => {
        logService.info('Adding new group.');
        const newGroup: ChatGroup = {
            id: `group-${generateUniqueId()}`,
            title: t('newGroup_title', 'Untitled'),
            timestamp: Date.now(),
            isExpanded: true,
        };
        updateAndPersistGroups(prev => [newGroup, ...prev]);
    }, [updateAndPersistGroups, t]);

    const handleDeleteGroup = useCallback((groupId: string) => {
        logService.info(`Deleting group: ${groupId}`);
        updateAndPersistGroups(prev => prev.filter(g => g.id !== groupId));
        updateAndPersistSessions(prev => prev.map(s => s.groupId === groupId ? { ...s, groupId: null } : s));
    }, [updateAndPersistGroups, updateAndPersistSessions]);

    const handleRenameGroup = useCallback((groupId: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        logService.info(`Renaming group ${groupId} to "${newTitle}"`);
        updateAndPersistGroups(prev => prev.map(g => g.id === groupId ? { ...g, title: newTitle.trim() } : g));
    }, [updateAndPersistGroups]);
    
    const handleMoveSessionToGroup = useCallback((sessionId: string, groupId: string | null) => {
        logService.info(`Moving session ${sessionId} to group ${groupId}`);
        updateAndPersistSessions(prev => prev.map(s => s.id === sessionId ? { ...s, groupId } : s));
    }, [updateAndPersistSessions]);

    const handleToggleGroupExpansion = useCallback((groupId: string) => {
        updateAndPersistGroups(prev => prev.map(g => g.id === groupId ? { ...g, isExpanded: !(g.isExpanded ?? true) } : g));
    }, [updateAndPersistGroups]);

    const clearAllHistory = useCallback(() => {
        logService.warn('User clearing all chat history.');
        activeJobs.current.forEach(controller => controller.abort());
        activeJobs.current.clear();
        localStorage.removeItem(CHAT_HISTORY_SESSIONS_KEY);
        localStorage.removeItem(CHAT_HISTORY_GROUPS_KEY);
        setSavedSessions([]);
        setSavedGroups([]);
        startNewChat();
    }, [setSavedSessions, setSavedGroups, startNewChat, activeJobs]);
    
    const clearCacheAndReload = useCallback(() => {
        clearAllHistory();
        localStorage.clear();
        setTimeout(() => window.location.reload(), 50);
    }, [clearAllHistory]);

    // ========== 辅助函数 ==========
    
    /**
     * 基础文本分析（备用方案）
     */
    const performBasicAnalysis = useCallback((text: string, filename: string) => {
        const textChunks = splitTextIntoChunks(text, 8000);
        const textTypeAnalysis = analyzeTextType(text.substring(0, 1000));
        
        return {
            filename,
            textLength: text.length,
            chunkCount: textChunks.length,
            textType: textTypeAnalysis.isChatFormat ? 'chat' : 'document',
            chunks: textChunks.map((chunk, index) => ({
                index: index + 1,
                content: chunk,
                summary: generateSimpleSummary(chunk, textTypeAnalysis.isChatFormat, index + 1, textChunks.length)
            }))
        };
    }, []);

    /**
     * 创建基础分析会话（备用方案）
     */
    const createBasicAnalysisSession = useCallback((analysis: any, filename: string) => {
        const messages: ChatMessage[] = [];
        const sessionTimestamp = Date.now();
        
        // 添加系统消息作为总结
        messages.push({
            id: generateUniqueId(),
            role: 'model',
            content: `# 📝 基础文本分析\n\n**文件名：** ${filename}\n**文本类型：** ${analysis.textType}\n**总字符数：** ${analysis.textLength}\n**分析片段数：** ${analysis.chunkCount}\n\n此文件已经过基础分析处理，分为 ${analysis.chunkCount} 个部分进行处理。`,
            timestamp: new Date(sessionTimestamp),
            files: []
        });
        
        // 添加详细分段分析
        let detailedAnalysis = `# 基础分段分析详情\n\n这是对上传文件的基础分段分析：\n\n`;
        
        analysis.chunks.forEach((chunk: any) => {
            detailedAnalysis += `## 第 ${chunk.index} 部分\n\n${chunk.summary}\n\n---\n\n`;
        });
        
        messages.push({
            id: generateUniqueId(),
            role: 'model',
            content: detailedAnalysis,
            timestamp: new Date(sessionTimestamp + 1000),
            files: []
        });
        
        // 创建会话并保存
        const fileNameWithoutExt = filename.replace(/\.[^/.]+$/, "");
        const newSession: SavedChatSession = {
            id: generateUniqueId(),
            title: `基础分析: ${fileNameWithoutExt}`,
            messages,
            timestamp: sessionTimestamp,
            settings: { ...DEFAULT_CHAT_SETTINGS },
            isPinned: false
        };
        
        const existingSessionsStr = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
        const existingSessions: SavedChatSession[] = existingSessionsStr ? JSON.parse(existingSessionsStr) : [];
        const mergedSessions = [...existingSessions, newSession];
        localStorage.setItem(CHAT_HISTORY_SESSIONS_KEY, JSON.stringify(mergedSessions));
        setSavedSessions(mergedSessions);
        
        alert(`文件"${filename}"基础分析完成！已创建包含分析结果的新会话。`);
    }, [setSavedSessions]);

    // ========== 聊天记录导入导出功能 ==========
    
    const handleExportChatHistory = useCallback(() => {
        try {
            const sessionsFromStorage = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
            const sessions: SavedChatSession[] = sessionsFromStorage ? JSON.parse(sessionsFromStorage) : [];
            
            if (sessions.length === 0) {
                alert('没有可导出的聊天记录');
                return;
            }

            // 创建导出数据，包含元数据
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                totalSessions: sessions.length,
                chatSessions: sessions
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `chat-history-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            alert(`成功导出 ${sessions.length} 个聊天会话`);
            logService.info(`Exported ${sessions.length} chat sessions`);
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            alert('导出聊天记录失败');
        }
    }, []);

    const handleImportChatHistory = useCallback(() => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const importedData = JSON.parse(text);
                
                // 验证数据格式
                let sessions: SavedChatSession[] = [];
                
                if (importedData.chatSessions && Array.isArray(importedData.chatSessions)) {
                    // 新格式：带有元数据的导出文件
                    sessions = importedData.chatSessions;
                } else if (Array.isArray(importedData)) {
                    // 旧格式：直接是会话数组
                    sessions = importedData;
                } else {
                    throw new Error('不支持的文件格式');
                }

                // 验证会话数据结构
                const validSessions = sessions.filter(session => 
                    session && 
                    typeof session.id === 'string' && 
                    typeof session.title === 'string' && 
                    typeof session.timestamp === 'number' &&
                    Array.isArray(session.messages)
                );

                if (validSessions.length === 0) {
                    alert('文件中没有有效的聊天记录');
                    return;
                }

                // 获取现有聊天记录
                const existingSessionsStr = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
                const existingSessions: SavedChatSession[] = existingSessionsStr ? JSON.parse(existingSessionsStr) : [];
                
                // 合并聊天记录，避免重复
                const existingIds = new Set(existingSessions.map(s => s.id));
                const newSessions = validSessions.filter(s => !existingIds.has(s.id));
                
                if (newSessions.length === 0) {
                    alert('没有新的聊天记录需要导入（可能已存在）');
                    return;
                }

                // 保存合并后的聊天记录
                const mergedSessions = [...existingSessions, ...newSessions];
                localStorage.setItem(CHAT_HISTORY_SESSIONS_KEY, JSON.stringify(mergedSessions));
                
                // 刷新UI状态
                setSavedSessions(mergedSessions);
                
                alert(`成功导入 ${newSessions.length} 个新的聊天会话`);
                logService.info(`Imported ${newSessions.length} new chat sessions`);
                
            } catch (error) {
                console.error('导入聊天记录失败:', error);
                alert('导入聊天记录失败，请检查文件格式');
            }
            
            // 清理文件输入元素
            document.body.removeChild(fileInput);
        };
        
        document.body.appendChild(fileInput);
        fileInput.click();
    }, [setSavedSessions]);

    // 导出聊天记录为文本格式
    const handleExportChatHistoryAsText = useCallback(() => {
        try {
            const sessionsStr = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
            const sessions: SavedChatSession[] = sessionsStr ? JSON.parse(sessionsStr) : [];
            
            if (sessions.length === 0) {
                alert('没有聊天记录可以导出');
                return;
            }

            // 转换为文本格式
            let textContent = `# 聊天记录导出\n导出时间：${new Date().toLocaleString()}\n总会话数：${sessions.length}\n\n`;
            
            sessions.forEach((session, index) => {
                textContent += `## 会话 ${index + 1}: ${session.title}\n`;
                textContent += `创建时间：${new Date(session.timestamp).toLocaleString()}\n`;
                textContent += `消息数量：${session.messages.length}\n\n`;
                
                // 生成会话摘要
                const userMessages = session.messages.filter(m => m.role === 'user');
                const modelMessages = session.messages.filter(m => m.role === 'model');
                
                if (session.messages.length > 3) {
                    textContent += `### 📝 会话摘要\n`;
                    textContent += `此对话包含 ${session.messages.length} 条消息（${userMessages.length} 条用户消息，${modelMessages.length} 条助手回复）。\n`;
                    textContent += `主题大致涉及：${session.title}\n\n`;
                }
                
                session.messages.forEach((message, msgIndex) => {
                    const role = message.role === 'user' ? '👤 用户' : '🤖 助手';
                    textContent += `### ${role} (${msgIndex + 1})\n`;
                    
                    // 处理过长的消息
                    let content = message.content;
                    const isTooLong = content.length > 2000;
                    
                    if (isTooLong && message.role === 'model') {
                        // 对于非常长的回复，创建一个摘要版本
                        const prefix = content.substring(0, 500);
                        const suffix = content.substring(content.length - 300);
                        const summary = `\n\n[...内容过长，完整内容请查看原始聊天记录...]\n\n`;
                        content = prefix + summary + suffix;
                    }
                    
                    textContent += `${content}\n\n`;
                    
                    if (message.role === 'user' && message.files && message.files.length > 0) {
                        textContent += `📎 附件：${message.files.map(f => f.name).join(', ')}\n\n`;
                    }
                });
                
                textContent += `---\n\n`;
            });

            // 下载文本文件
            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `chat-history-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            logService.info(`Exported ${sessions.length} chat sessions as text`);
        } catch (error) {
            console.error('导出聊天记录文本失败:', error);
            alert('导出聊天记录失败');
        }
    }, []);

    // 从文本格式导入聊天记录（添加智能分段分析功能）
    const handleImportChatHistoryFromText = useCallback(() => {
        // 创建文件输入元素
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt';
        fileInput.style.display = 'none';
        
        // 处理文件选择后的逻辑
        fileInput.onchange = async (event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files && target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                
                // 判断是否为我们的导出格式
                const isOurExportFormat = text.includes('# 聊天记录导出') && text.includes('## 会话');
                
                if (isOurExportFormat) {
                    // 使用传统方式处理我们自己导出的聊天记录格式
                    const sessions: SavedChatSession[] = [];
                    const parts = text.split('---');
                    
                    for (let i = 0; i < parts.length; i++) {
                        const sessionText = parts[i].trim();
                        if (!sessionText) continue;
                        
                        const lines = sessionText.split('\n').filter(line => line.trim());
                        let sessionTitle = '';
                        let sessionTimestamp = Date.now();
                        const messages: ChatMessage[] = [];
                        
                        // 解析会话信息
                        for (let j = 0; j < lines.length; j++) {
                            const line = lines[j].trim();
                            
                            if (line.startsWith('## 会话')) {
                                const titleMatch = line.match(/## 会话 \d+: (.+)/);
                                if (titleMatch) sessionTitle = titleMatch[1];
                            }
                            
                            else if (line.startsWith('创建时间：')) {
                                try {
                                    const timeStr = line.replace('创建时间：', '');
                                    sessionTimestamp = new Date(timeStr).getTime() || Date.now();
                                } catch (e) {
                                    sessionTimestamp = Date.now();
                                }
                            }
                            
                            else if (line.startsWith('### 👤 用户') || line.startsWith('### 🤖 助手')) {
                                const role = line.includes('👤 用户') ? 'user' : 'model';
                                let content = '';
                                
                                // 收集消息内容
                                for (let k = j + 1; k < lines.length; k++) {
                                    const contentLine = lines[k];
                                    
                                    if (contentLine.startsWith('### ') || 
                                        contentLine.startsWith('📎 附件：') ||
                                        contentLine.startsWith('---')) {
                                        break;
                                    }
                                    
                                    if (content) content += '\n';
                                    content += contentLine;
                                }
                                
                                if (content.trim()) {
                                    messages.push({
                                        id: generateUniqueId(),
                                        role: role as 'user' | 'model',
                                        content: content.trim(),
                                        timestamp: new Date(sessionTimestamp),
                                        files: []
                                    });
                                }
                            }
                        }
                        
                        // 创建会话对象并添加总结消息
                        if (sessionTitle && messages.length > 0) {
                            // 如果有多条消息，添加一条系统消息作为聊天总结
                            if (messages.length > 3) {
                                const modelMessages = messages.filter(m => m.role === 'model');
                                const userMessages = messages.filter(m => m.role === 'user');
                                
                                // 添加会话摘要作为第一条消息
                                messages.unshift({
                                    id: generateUniqueId(),
                                    role: 'model',
                                    content: `**📝 会话摘要**\n\n此对话包含 ${messages.length} 条消息（${userMessages.length} 条用户消息，${modelMessages.length} 条助手回复）。\n\n主题大致涉及：${sessionTitle}`,
                                    timestamp: new Date(sessionTimestamp),
                                    files: []
                                });
                            }
                            
                            sessions.push({
                                id: generateUniqueId(),
                                title: sessionTitle,
                                messages,
                                timestamp: sessionTimestamp,
                                settings: { ...DEFAULT_CHAT_SETTINGS },
                                isPinned: false
                            });
                        }
                    }
                    
                    if (!sessions || sessions.length === 0) {
                        alert('文本文件中没有找到有效的聊天记录格式');
                        return;
                    }
                    
                    // 获取现有聊天记录并合并
                    const existingSessionsStr = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
                    const existingSessions: SavedChatSession[] = existingSessionsStr ? JSON.parse(existingSessionsStr) : [];
                    
                    // 基于标题和时间戳检查重复
                    const existingSignatures = new Set(
                        existingSessions.map(s => `${s.title}-${s.timestamp}`)
                    );
                    
                    const newSessions = sessions.filter(s => 
                        !existingSignatures.has(`${s.title}-${s.timestamp}`)
                    );
                    
                    if (newSessions.length === 0) {
                        alert('没有新的聊天记录需要导入（可能已存在类似记录）');
                        return;
                    }
                    
                    // 保存合并后的聊天记录
                    const mergedSessions = [...existingSessions, ...newSessions];
                    localStorage.setItem(CHAT_HISTORY_SESSIONS_KEY, JSON.stringify(mergedSessions));
                    
                    // 刷新UI状态
                    setSavedSessions(mergedSessions);
                    
                    alert(`成功导入 ${newSessions.length} 个聊天会话`);
                    logService.info(`Imported ${newSessions.length} chat sessions from text`);
                } else {
                    // 对于其他格式的文本文件，使用智能分段分析
                    // 检查是否有可用的API配置
                    const { apiKeysString } = (() => {
                        if (appSettings.useCustomApiConfig) {
                            if (appSettings.activeApiConfigId) {
                                const config = appSettings.apiConfigs.find(c => c.id === appSettings.activeApiConfigId);
                                if (config && config.apiKey) {
                                    return { apiKeysString: config.apiKey };
                                }
                            }
                            const firstConfig = appSettings.apiConfigs.find(c => c.apiKey);
                            if (firstConfig) {
                                return { apiKeysString: firstConfig.apiKey };
                            }
                        }
                        return { apiKeysString: appSettings.apiKey };
                    })();

                    if (!apiKeysString) {
                        alert('需要配置有效的API密钥才能进行智能文本分析。请前往设置页面配置API。');
                        return;
                    }

                    // 创建一个取消控制器用于中断操作
                    const abortController = new AbortController();
                    
                    // 显示进度对话框
                    const progressDialog = createProgressDialog('智能文本分析', () => {
                        abortController.abort();
                    });
                    
                    try {
                        // 使用智能文本分析服务进行深度分析
                        const analysisResult = await intelligentTextAnalysisService.analyzeTextIntelligently(
                            text,
                            file.name,
                            apiKeysString,
                            (progress, message) => {
                                progressDialog.updateProgress(Math.round(progress), 100, message);
                            },
                            abortController.signal
                        );

                        // 如果操作被取消，则提前退出
                        if (abortController.signal.aborted) {
                            progressDialog.close();
                            return;
                        }

                        // 关闭进度对话框
                        progressDialog.close();
                        
                        // 创建一个新的会话，包含完整的分析结果
                        const messages: ChatMessage[] = [];
                        const sessionTimestamp = Date.now();
                        
                        // 添加系统消息作为总体分析
                        messages.push({
                            id: generateUniqueId(),
                            role: 'model',
                            content: `# 📄 智能文本分析报告\n\n**文件名：** ${file.name}\n**文本类型：** ${analysisResult.textType}\n**总字符数：** ${analysisResult.totalWords}\n**分析片段数：** ${analysisResult.chunks.length}\n\n## 整体概述\n\n${analysisResult.overallSummary}\n\n## 主要主题\n\n${analysisResult.analysis.mainTopics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')}\n\n## 核心洞察\n\n${analysisResult.analysis.keyInsights.map((insight, index) => `• ${insight}`).join('\n')}\n\n## 建议行动\n\n${analysisResult.analysis.recommendations.map((rec, index) => `• ${rec}`).join('\n')}`,
                            timestamp: new Date(sessionTimestamp),
                            files: []
                        });
                        
                        // 添加用户提问
                        messages.push({
                            id: generateUniqueId(),
                            role: 'user',
                            content: `请详细展示每个部分的分析结果。`,
                            timestamp: new Date(sessionTimestamp + 1000),
                            files: []
                        });
                        
                        // 添加详细的分段分析结果
                        let detailedAnalysis = `# 📋 详细分段分析\n\n以下是对文本各部分的深入分析结果：\n\n`;
                        
                        analysisResult.chunks.forEach((chunk, index) => {
                            detailedAnalysis += `## 第 ${chunk.index} 部分分析\n\n`;
                            detailedAnalysis += `**字符数：** ${chunk.wordCount}\n\n`;
                            detailedAnalysis += `### 📝 内容摘要\n${chunk.summary}\n\n`;
                            detailedAnalysis += `### 🔍 关键要点\n${chunk.keyPoints.map(point => `• ${point}`).join('\n')}\n\n`;
                            detailedAnalysis += `### 📊 详细分析\n${chunk.analysis}\n\n`;
                            
                            if (index < analysisResult.chunks.length - 1) {
                                detailedAnalysis += `---\n\n`;
                            }
                        });
                        
                        messages.push({
                            id: generateUniqueId(),
                            role: 'model',
                            content: detailedAnalysis,
                            timestamp: new Date(sessionTimestamp + 2000),
                            files: []
                        });
                        
                        // 添加一个总结消息
                        messages.push({
                            id: generateUniqueId(),
                            role: 'model',
                            content: `# 🎯 分析完成总结\n\n✅ **分析状态：** 已完成\n📊 **处理片段：** ${analysisResult.chunks.length} 个\n📈 **分析深度：** 深度智能分析\n\n**分析特点：**\n• 每个片段都经过了AI深度理解和分析\n• 提取了关键信息和洞察\n• 生成了实用的建议和推荐\n• 保持了内容的完整性和连贯性\n\n您可以基于这些分析结果进行进一步的讨论和探索。如有任何问题，随时可以询问！`,
                            timestamp: new Date(sessionTimestamp + 3000),
                            files: []
                        });
                        
                        // 创建会话并保存
                        const fileName = file.name.replace(/\.[^/.]+$/, "");
                        const newSession: SavedChatSession = {
                            id: generateUniqueId(),
                            title: `智能分析: ${fileName}`,
                            messages,
                            timestamp: sessionTimestamp,
                            settings: { ...DEFAULT_CHAT_SETTINGS },
                            isPinned: false
                        };
                        
                        const existingSessionsStr = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
                        const existingSessions: SavedChatSession[] = existingSessionsStr ? JSON.parse(existingSessionsStr) : [];
                        const mergedSessions = [...existingSessions, newSession];
                        localStorage.setItem(CHAT_HISTORY_SESSIONS_KEY, JSON.stringify(mergedSessions));
                        setSavedSessions(mergedSessions);
                        
                        alert(`文件"${file.name}"智能分析完成！已创建包含深度分析的新会话。`);
                    } catch (error) {
                        progressDialog.close();
                        console.error('智能分析文本时出错:', error);
                        if (error instanceof Error && error.message.includes('取消')) {
                            alert('分析已取消');
                        } else {
                            alert(`智能分析失败: ${error instanceof Error ? error.message : '未知错误'}\n\n将尝试使用基础分析模式...`);
                            
                            // 降级到基础分析模式
                            try {
                                const basicAnalysis = performBasicAnalysis(text, file.name);
                                createBasicAnalysisSession(basicAnalysis, file.name);
                            } catch (fallbackError) {
                                console.error('基础分析也失败:', fallbackError);
                                alert('文本分析完全失败，请检查文件内容或稍后重试。');
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('处理文本文件失败:', error);
                alert('处理文件时出错，请检查文件格式');
            } finally {
                if (document.body.contains(fileInput)) {
                    document.body.removeChild(fileInput);
                }
            }
        };
        
        // 显示文件选择对话框
        document.body.appendChild(fileInput);
        fileInput.click();
    }, []);

    return {
        loadInitialData,
        loadChatSession,
        startNewChat,
        handleDeleteChatHistorySession,
        handleRenameSession,
        handleTogglePinSession,
        handleAddNewGroup,
        handleDeleteGroup,
        handleRenameGroup,
        handleMoveSessionToGroup,
        handleToggleGroupExpansion,
        clearAllHistory,
        clearCacheAndReload,
        handleExportChatHistory,
        handleImportChatHistory,
        handleExportChatHistoryAsText,
        handleImportChatHistoryFromText
    };
}

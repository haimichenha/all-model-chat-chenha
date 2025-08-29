// 这是修复版本的文本导入函数

import { useCallback } from 'react';
import { ChatMessage, SavedChatSession } from '../types';
import { DEFAULT_CHAT_SETTINGS, CHAT_HISTORY_SESSIONS_KEY } from '../constants/appConstants';
import { logService } from '../services/logService';
import { generateUniqueId } from '../utils/appUtils';

// 从文本格式导入聊天记录的函数
export const createHandleImportChatHistoryFromText = (setSavedSessions: (sessions: SavedChatSession[]) => void) => 
    useCallback(() => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt';
        fileInput.style.display = 'none';
        
        fileInput.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                
                // 检查是否是我们的导出格式
                if (!text.includes('# 聊天记录导出') && !text.includes('## 会话')) {
                    alert('文件格式不正确，请选择通过本应用导出的聊天记录文本文件');
                    return;
                }
                
                // 简单的文本解析逻辑 - 基于会话分隔符
                const sessions: SavedChatSession[] = [];
                
                // 分割会话：基于 "---" 分隔符
                const parts = text.split('---');
                
                // 第一部分是标题，从第二部分开始处理会话
                for (let i = 1; i < parts.length; i++) {
                    const sessionText = parts[i].trim();
                    if (!sessionText) continue;
                    
                    const lines = sessionText.split('\n').filter(line => line.trim());
                    let sessionTitle = '';
                    let sessionTimestamp = Date.now();
                    const messages: ChatMessage[] = [];
                    
                    // 解析会话信息
                    for (let j = 0; j < lines.length; j++) {
                        const line = lines[j].trim();
                        
                        // 解析会话标题
                        if (line.startsWith('## 会话')) {
                            const titleMatch = line.match(/## 会话 \d+: (.+)/);
                            if (titleMatch) {
                                sessionTitle = titleMatch[1];
                            }
                        }
                        
                        // 解析创建时间
                        if (line.startsWith('创建时间：')) {
                            try {
                                const timeStr = line.replace('创建时间：', '');
                                sessionTimestamp = new Date(timeStr).getTime() || Date.now();
                            } catch {
                                sessionTimestamp = Date.now();
                            }
                        }
                        
                        // 解析消息
                        if (line.startsWith('### 👤 用户') || line.startsWith('### 🤖 助手')) {
                            const role = line.includes('👤 用户') ? 'user' : 'model';
                            let content = '';
                            
                            // 收集消息内容
                            for (let k = j + 1; k < lines.length; k++) {
                                const contentLine = lines[k];
                                
                                // 如果遇到下一个消息标题或附件标记，停止
                                if (contentLine.startsWith('### ') || contentLine.startsWith('📎 附件：')) {
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
                    
                    // 创建会话对象
                    if (sessionTitle && messages.length > 0) {
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

                if (sessions.length === 0) {
                    alert('文本文件中没有找到有效的聊天记录格式，请确保使用本应用导出的文本文件');
                    return;
                }

                // 获取现有聊天记录并合并
                const existingSessionsStr = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
                const existingSessions: SavedChatSession[] = existingSessionsStr ? JSON.parse(existingSessionsStr) : [];
                
                // 基于标题和时间戳检查重复（文本导入可能没有原始ID）
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
                
                alert(`成功从文本导入 ${newSessions.length} 个聊天会话`);
                logService.info(`Imported ${newSessions.length} chat sessions from text`);
                
            } catch (error) {
                console.error('从文本导入聊天记录失败:', error);
                alert('从文本导入聊天记录失败，请检查文件格式是否正确');
            }
            
            // 清理文件输入元素
            document.body.removeChild(fileInput);
        };
        
        document.body.appendChild(fileInput);
        fileInput.click();
    }, [setSavedSessions]);

import { useState, useCallback, useEffect } from 'react';
import { ChatGroup, SavedChatSession } from '../types';
import { CHAT_HISTORY_GROUPS_KEY } from '../constants/appConstants';
import { generateUniqueId } from '../utils/appUtils';

interface UseChatGroupsProps {
  updateAndPersistSessions: (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;
}

export const useChatGroups = ({ updateAndPersistSessions }: UseChatGroupsProps) => {
  const [savedGroups, setSavedGroups] = useState<ChatGroup[]>([]);

  // 持久化群组数据
  const updateAndPersistGroups = useCallback((updater: (prev: ChatGroup[]) => ChatGroup[]) => {
    setSavedGroups(prevGroups => {
      const newGroups = updater(prevGroups);
      localStorage.setItem(CHAT_HISTORY_GROUPS_KEY, JSON.stringify(newGroups));
      return newGroups;
    });
  }, []);

  // 加载初始数据
  useEffect(() => {
    const storedGroups = localStorage.getItem(CHAT_HISTORY_GROUPS_KEY);
    if (storedGroups) {
      try {
        const parsedGroups = JSON.parse(storedGroups);
        setSavedGroups(parsedGroups);
      } catch (error) {
        console.error('Failed to parse stored groups:', error);
        setSavedGroups([]);
      }
    }
  }, []);

  // 添加新群组
  const handleAddNewGroup = useCallback((name: string) => {
    const newGroup: ChatGroup = {
      id: generateUniqueId(),
      title: name,
      timestamp: Date.now(),
      isPinned: false,
      isExpanded: true,
    };
    updateAndPersistGroups(prev => [newGroup, ...prev]);
    return newGroup.id;
  }, [updateAndPersistGroups]);

  // 删除群组
  const handleDeleteGroup = useCallback((groupId: string) => {
    // 首先将该群组中的所有会话移出群组
    updateAndPersistSessions(prevSessions => 
      prevSessions.map(session => 
        session.groupId === groupId 
          ? { ...session, groupId: null }
          : session
      )
    );
    
    // 然后删除群组
    updateAndPersistGroups(prev => prev.filter(group => group.id !== groupId));
  }, [updateAndPersistGroups, updateAndPersistSessions]);

  // 重命名群组
  const handleRenameGroup = useCallback((groupId: string, newTitle: string) => {
    updateAndPersistGroups(prev => 
      prev.map(group => 
        group.id === groupId 
          ? { ...group, title: newTitle }
          : group
      )
    );
  }, [updateAndPersistGroups]);

  // 移动会话到群组
  const handleMoveSessionToGroup = useCallback((sessionId: string, groupId: string | null) => {
    updateAndPersistSessions(prevSessions => 
      prevSessions.map(session => 
        session.id === sessionId 
          ? { ...session, groupId }
          : session
      )
    );
  }, [updateAndPersistSessions]);

  // 切换群组展开/折叠状态
  const handleToggleGroupExpansion = useCallback((groupId: string) => {
    updateAndPersistGroups(prev => 
      prev.map(group => 
        group.id === groupId 
          ? { ...group, isExpanded: !group.isExpanded }
          : group
      )
    );
  }, [updateAndPersistGroups]);

  // 固定/取消固定群组
  const handleTogglePinGroup = useCallback((groupId: string) => {
    updateAndPersistGroups(prev => 
      prev.map(group => 
        group.id === groupId 
          ? { ...group, isPinned: !group.isPinned }
          : group
      )
    );
  }, [updateAndPersistGroups]);

  // 清空所有群组
  const clearAllGroups = useCallback(() => {
    localStorage.removeItem(CHAT_HISTORY_GROUPS_KEY);
    setSavedGroups([]);
    
    // 同时清空所有会话的群组关联
    updateAndPersistSessions(prevSessions => 
      prevSessions.map(session => ({ ...session, groupId: null }))
    );
  }, [updateAndPersistSessions]);

  return {
    savedGroups,
    setSavedGroups,
    updateAndPersistGroups,
    handleAddNewGroup,
    handleDeleteGroup,
    handleRenameGroup,
    handleMoveSessionToGroup,
    handleToggleGroupExpansion,
    handleTogglePinGroup,
    clearAllGroups,
  };
};

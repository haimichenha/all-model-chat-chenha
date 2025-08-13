import React, { useState, useEffect, useRef } from 'react';
import { SavedChatSession, ChatGroup } from '../types';
import { Edit3, Trash2, X, Search, Menu, MoreHorizontal, Pin, PinOff, Download, Upload, Plus } from 'lucide-react';
import { translations } from '../utils/appUtils';


interface HistorySidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessions: SavedChatSession[];
  groups?: ChatGroup[]; // 添加群组支持
  savedGroups?: ChatGroup[]; // 保存的群组列表
  activeSessionId: string | null;
  loadingSessionIds: Set<string>;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onTogglePinSession: (sessionId: string) => void;
  onExportAllSessions: () => void;
  onImportSessions: () => void; // 新增导入功能
  // 群组相关的处理器
  onAddNewGroup?: (name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newTitle: string) => void;
  onMoveSessionToGroup?: (sessionId: string, groupId: string | null) => void;
  onToggleGroupExpansion?: (groupId: string) => void;
  onTogglePinGroup?: (groupId: string) => void;
  themeColors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textLink: string;
    borderPrimary: string;
    borderSecondary: string;
    iconHistory: string;
  };
  t: (key: keyof typeof translations) => string;
  language: 'en' | 'zh';
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onToggle,
  sessions,
  groups = [], // 默认为空数组
  savedGroups = [], // 保存的群组列表
  activeSessionId,
  loadingSessionIds,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onTogglePinSession,
  onExportAllSessions,
  onImportSessions, // 新增导入功能
  onAddNewGroup,
  onDeleteGroup,
  onRenameGroup,
  onMoveSessionToGroup,
  onToggleGroupExpansion,
  onTogglePinGroup,
  themeColors,
  t,
  language,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [editingSession, setEditingSession] = useState<{ id: string, title: string } | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenu]);

  useEffect(() => {
    if (editingSession) {
      editInputRef.current?.focus();
    }
  }, [editingSession]);

  const handleStartEdit = (session: SavedChatSession) => {
    setEditingSession({ id: session.id, title: session.title });
    setActiveMenu(null); // Close menu
  };

  const handleRenameConfirm = () => {
    if (editingSession && editingSession.title.trim()) {
      onRenameSession(editingSession.id, editingSession.title.trim());
    }
    setEditingSession(null);
  };

  const handleRenameCancel = () => {
    setEditingSession(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRenameConfirm();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  };

  const handleCreateGroup = () => {
    if (newGroupName.trim() && onAddNewGroup) {
      onAddNewGroup(newGroupName.trim());
      setNewGroupName('');
      setIsAddingGroup(false);
    }
  };

  const handleCreateGroupKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreateGroup();
    } else if (e.key === 'Escape') {
      setIsAddingGroup(false);
      setNewGroupName('');
    }
  };

  const toggleMenu = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setActiveMenu(activeMenu === sessionId ? null : sessionId);
  };

  const filteredSessions = sessions.filter(session => {
    if (!searchQuery.trim()) {
      return true;
    }
    const query = searchQuery.toLowerCase();
    if (session.title.toLowerCase().includes(query)) {
      return true;
    }
    return session.messages.some(message =>
      message.content.toLowerCase().includes(query)
    );
  });
  
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.timestamp - a.timestamp;
  });

  return (
    <aside
      className={`h-full flex flex-col w-64 bg-[var(--theme-bg-secondary)] shadow-lg ease-in-out duration-300 absolute top-0 left-0 z-30 transition-transform transform sm:relative sm:transform-none sm:top-auto sm:left-auto sm:z-auto sm:transition-all ${isOpen ? 'translate-x-0' : '-translate-x-full'} sm:w-64 md:w-72 sm:flex-shrink-0 ${isOpen ? 'sm:ml-0' : 'sm:-ml-64 md:-ml-72'} ${isOpen ? 'border-r border-[var(--theme-border-primary)]' : 'sm:border-r-0'}`}
      role="complementary" aria-label={t('history_title')} aria-hidden={!isOpen}
    >
      <div className="p-2 sm:p-3 flex items-center flex-shrink-0 h-[60px] border-b border-[var(--theme-border-primary)]">
        {isSearching ? (
          <div className="w-full flex items-center gap-2">
            <Search size={20} className="text-[var(--theme-text-tertiary)] flex-shrink-0" />
            <input type="text" placeholder={t('history_search_placeholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-transparent border-0 rounded-md py-1.5 text-sm focus:ring-0 outline-none text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-tertiary)] transition-colors" autoFocus onKeyDown={(e) => { if (e.key === 'Escape') setIsSearching(false); }} />
            <button onClick={() => { setIsSearching(false); setSearchQuery(''); }} className="p-1.5 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] rounded-md" aria-label={t('history_search_clear_aria')}>
              <X size={20} />
            </button>
          </div>
        ) : (
          <div className="w-full flex justify-between items-center">
            <button onClick={onToggle} className="p-2 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md" aria-label={isOpen ? t('historySidebarClose') : t('historySidebarOpen')}>
              <Menu size={20} />
            </button>
            <button onClick={() => setIsSearching(true)} className="p-2 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md" aria-label={t('history_search_aria')}>
              <Search size={20} />
            </button>
          </div>
        )}
      </div>
      <div className="px-3 pt-3">
        <button onClick={onNewChat} className="flex items-center gap-3 w-full text-left px-3 py-2 text-sm text-[var(--theme-text-secondary)] font-medium bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-lg hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border-focus)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-border-focus)] shadow-sm transition-all mb-2" aria-label={t('headerNewChat_aria')}>
          <Edit3 size={18} />
          <span>{t('headerNewChat')}</span>
        </button>

        <div className="flex gap-1">
          <button 
            onClick={onExportAllSessions}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--theme-text-secondary)] font-medium bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-md hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border-focus)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-border-focus)] shadow-sm transition-all flex-1" 
            aria-label="导出所有聊天记录"
          >         
            <Download size={12} />
            <span>导出</span>
          </button>

          <button 
            onClick={onImportSessions}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--theme-text-secondary)] font-medium bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-md hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border-focus)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-border-focus)] shadow-sm transition-all flex-1" 
            aria-label="导入聊天记录"
          >         
            <Upload size={12} />
            <span>导入</span>
          </button>
        </div>

        {/* 群组管理部分 */}
        <div className="mt-4 border-t border-[var(--theme-border-primary)] pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-[var(--theme-text-tertiary)] tracking-wider uppercase">聊天群组</h3>
            <button
              onClick={() => setIsAddingGroup(true)}
              className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md transition-colors"
              aria-label="添加新群组"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* 添加群组输入框 */}
          {isAddingGroup && (
            <div className="mb-3">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={handleCreateGroupKeyDown}
                placeholder="输入群组名称"
                className="w-full px-3 py-2 text-sm bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-tertiary)]"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCreateGroup}
                  className="px-3 py-1.5 text-xs bg-[var(--theme-bg-accent)] text-white rounded-md hover:bg-[var(--theme-bg-accent-hover)] transition-colors"
                >
                  创建
                </button>
                <button
                  onClick={() => {
                    setIsAddingGroup(false);
                    setNewGroupName('');
                  }}
                  className="px-3 py-1.5 text-xs text-[var(--theme-text-secondary)] border border-[var(--theme-border-secondary)] rounded-md hover:bg-[var(--theme-bg-tertiary)] transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 群组列表 */}
          {savedGroups && savedGroups.length > 0 ? (
            <div className="space-y-1">
              {savedGroups.map((group) => {
                // 计算每个群组中的会话数量
                const groupSessionCount = sessions.filter(session => session.groupId === group.id).length;
                
                return (
                  <div
                    key={group.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--theme-bg-tertiary)] transition-colors group"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-3 h-3 rounded-full bg-[var(--theme-bg-accent)] flex-shrink-0"></div>
                      <span className="text-sm text-[var(--theme-text-primary)] truncate" title={group.title}>
                        {group.title}
                      </span>
                      <span className="text-xs text-[var(--theme-text-tertiary)] flex-shrink-0">
                        ({groupSessionCount})
                      </span>
                    </div>
                    <button
                      onClick={() => onDeleteGroup && onDeleteGroup(group.id)}
                      className="p-1 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-icon-error)] opacity-0 group-hover:opacity-100 transition-all rounded"
                      aria-label="删除群组"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[var(--theme-text-tertiary)] text-center py-2">
              暂无群组
            </p>
          )}
        </div>

      </div>
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-xs font-semibold text-[var(--theme-text-tertiary)] tracking-wider uppercase">{t('history_recent_chats')}</h3>
      </div>
      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {sessions.length === 0 && !searchQuery ? (
          <p className="p-4 text-xs sm:text-sm text-center text-[var(--theme-text-tertiary)]">{t('history_empty')}</p>
        ) : sortedSessions.length === 0 ? (
          <p className="p-4 text-xs sm:text-sm text-center text-[var(--theme-text-tertiary)]">{t('history_search_no_results')}</p>
        ) : (
          <ul className="py-1 px-2">
            {sortedSessions.map((session) => (
              <li key={session.id} className={`group relative rounded-lg my-0.5 ${session.id === activeSessionId ? 'bg-[var(--theme-bg-tertiary)]' : ''}`}>
                <div className={`w-full flex items-center justify-between text-left px-3 py-2 text-sm transition-colors rounded-lg ${session.id === activeSessionId ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'}`}>
                  {editingSession?.id === session.id ? (
                    <input ref={editInputRef} type="text" value={editingSession.title} onChange={(e) => setEditingSession({ ...editingSession, title: e.target.value })} onBlur={handleRenameConfirm} onKeyDown={handleRenameKeyDown} className="flex-grow bg-transparent border border-[var(--theme-border-focus)] rounded-md px-1 py-0 text-sm w-full" />
                  ) : (
                    <button onClick={() => onSelectSession(session.id)} className="flex items-center flex-grow min-w-0" aria-current={session.id === activeSessionId ? "page" : undefined}>
                      {session.isPinned && <Pin size={12} className="mr-2 text-[var(--theme-text-link)] flex-shrink-0" />}
                      <span className="font-medium truncate" title={session.title}>
                        {session.title}
                      </span>
                    </button>
                  )}
                  {loadingSessionIds.has(session.id) ? (
                    <div className="loading-dots-container"><div className="loading-dot"></div><div className="loading-dot"></div><div className="loading-dot"></div></div>
                  ) : (
                    <button onClick={(e) => toggleMenu(e, session.id)} className="p-1 rounded-full text-[var(--theme-text-tertiary)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-border-focus)]">
                      <MoreHorizontal size={16} />
                    </button>
                  )}
                </div>
                {activeMenu === session.id && (
                  <div ref={menuRef} className="absolute right-3 top-9 z-10 w-40 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-md shadow-lg py-1">
                    <button onClick={() => handleStartEdit(session)} className="w-full text-left px-3 py-1.5 text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] flex items-center gap-2"><Edit3 size={14} /> <span>编辑标题</span></button>
                    <button onClick={() => { onTogglePinSession(session.id); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] flex items-center gap-2">
                      {session.isPinned ? <PinOff size={14} /> : <Pin size={14} />} <span>{session.isPinned ? '取消置顶' : '置顶'}</span>
                    </button>
                    <button onClick={() => { onDeleteSession(session.id); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 text-sm text-[var(--theme-icon-error)] hover:bg-[var(--theme-bg-danger)] hover:text-[var(--theme-text-danger)] flex items-center gap-2"><Trash2 size={14} /> <span>删除</span></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
};
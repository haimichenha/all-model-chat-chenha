import { useRef } from 'react';
import { Upload, Download, History } from 'lucide-react';
import { SavedChatSession } from '../../types';
import { CHAT_HISTORY_SESSIONS_KEY } from '../../constants/appConstants';
import { getResponsiveValue } from '../../utils/appUtils';

interface ChatHistoryImportExportProps {
  t: (key: string) => string;
  onImportSuccess?: () => void;
}

export const ChatHistoryImportExport: React.FC<ChatHistoryImportExportProps> = ({ 
  t, 
  onImportSuccess 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const buttonIconSize = getResponsiveValue(12, 14);

  const baseButtonClass = "px-3 sm:px-4 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-secondary)] flex items-center justify-center gap-2 text-sm font-medium w-full sm:w-auto";

  const handleExportChatHistory = () => {
    try {
      const chatSessions = localStorage.getItem(CHAT_HISTORY_SESSIONS_KEY);
      const sessions: SavedChatSession[] = chatSessions ? JSON.parse(chatSessions) : [];
      
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
    } catch (error) {
      console.error('导出聊天记录失败:', error);
      alert('导出聊天记录失败');
    }
  };

  const handleImportChatHistory = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
      
      alert(`成功导入 ${newSessions.length} 个新的聊天会话`);
      
      // 触发刷新回调
      if (onImportSuccess) {
        onImportSuccess();
      }
      
    } catch (error) {
      console.error('导入聊天记录失败:', error);
      alert('导入聊天记录失败，请检查文件格式');
    }
    
    // 重置文件输入
    if (event.target) {
      event.target.value = '';
    }
  };

  return (
    <div>
      <h4 className="text-sm font-medium text-[var(--theme-text-primary)] mb-2 flex items-center gap-2">
        <History size={16} />
        聊天记录导入导出
      </h4>
      
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleExportChatHistory}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-link)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Download size={buttonIconSize} />
          <span>导出聊天记录</span>
        </button>
        
        <button
          onClick={handleImportChatHistory}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-link)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Upload size={buttonIconSize} />
          <span>导入聊天记录</span>
        </button>
        
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json"
          style={{ display: 'none' }}
        />
      </div>
      
      <div className="mt-2 text-xs text-[var(--theme-text-tertiary)]">
        <p>支持导入/导出所有聊天会话，包括消息内容和设置</p>
      </div>
    </div>
  );
};

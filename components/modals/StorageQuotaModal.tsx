import React, { useState, useEffect } from 'react';
import { AlertTriangle, Download, Cloud, HardDrive, X, FileDown, Database } from 'lucide-react';
import { Modal } from '../shared/Modal';
import { persistentStoreService } from '../../services/persistentStoreService';
import { hybridStorageService, StorageQuotaInfo } from '../../services/hybridStorageService';
import { getResponsiveValue } from '../../utils/appUtils';

interface StorageQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedWithCleanup: () => void;
  currentSystemInstruction?: string;
}

export const StorageQuotaModal: React.FC<StorageQuotaModalProps> = ({
  isOpen,
  onClose,
  onProceedWithCleanup,
  currentSystemInstruction
}) => {
  const [storageInfo, setStorageInfo] = useState<StorageQuotaInfo | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ localStorage: string, firebase: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<'all' | 'settings' | 'chats' | null>(null);

  const headingIconSize = getResponsiveValue(20, 24);
  const buttonIconSize = getResponsiveValue(16, 18);

  useEffect(() => {
    if (isOpen) {
      // 获取存储信息
      hybridStorageService.checkStorageHealth().then(setStorageInfo);
      hybridStorageService.getStorageUsage().then(setStorageUsage);
    }
  }, [isOpen]);

  const handleExport = async (type: 'all' | 'settings' | 'chats') => {
    setIsExporting(true);
    setExportType(type);
    
    try {
      switch (type) {
        case 'all':
          await handleExportAll();
          break;
        case 'settings':
          persistentStoreService.exportToJSON('emergency-settings-backup', currentSystemInstruction);
          break;
        case 'chats':
          await handleExportChats();
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败，请稍后重试');
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleExportAll = async () => {
    const allData = await hybridStorageService.exportAllData();
    if (allData) {
      const exportData = {
        exportTime: new Date().toISOString(),
        exportType: 'complete_backup',
        localStorage: allData.localStorage,
        firebase: allData.firebase,
        settings: persistentStoreService.getStore(),
        currentSystemInstruction
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      const link = document.createElement('a');
      link.setAttribute('href', dataUri);
      link.setAttribute('download', `all-model-chat-complete-backup-${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExportChats = async () => {
    try {
      // 导出聊天记录
      const chatHistory = localStorage.getItem('all-model-chat-sessions');
      if (chatHistory) {
        const exportData = {
          exportTime: new Date().toISOString(),
          exportType: 'chat_history',
          sessions: JSON.parse(chatHistory)
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
        
        const link = document.createElement('a');
        link.setAttribute('href', dataUri);
        link.setAttribute('download', `chat-history-backup-${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Chat export failed:', error);
    }
  };

  const formatPercentage = (used: number, total: number) => {
    return ((used / total) * 100).toFixed(1) + '%';
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-[var(--theme-bg-primary)] rounded-xl shadow-premium w-full max-w-lg flex flex-col">
        <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-[var(--theme-border-primary)]">
          <h2 className="text-lg font-semibold text-[var(--theme-text-error)] flex items-center">
            <AlertTriangle size={headingIconSize} className="mr-2.5" />
            存储空间不足
          </h2>
          <button 
            onClick={onClose} 
            className="text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)] transition-colors p-1 rounded-full" 
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 存储状态信息 */}
          {storageInfo && (
            <div className="bg-[var(--theme-bg-secondary)] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--theme-text-secondary)]">本地存储</span>
                <span className="text-sm font-mono text-[var(--theme-text-primary)]">
                  {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.total)} ({formatPercentage(storageInfo.used, storageInfo.total)})
                </span>
              </div>
              <div className="w-full bg-[var(--theme-bg-tertiary)] rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-[var(--theme-text-error)] to-[var(--theme-text-warning)] h-2 rounded-full"
                  style={{ width: `${(storageInfo.used / storageInfo.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* 使用情况详情 */}
          {storageUsage && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--theme-bg-secondary)] rounded-lg p-3 text-center">
                <HardDrive size={24} className="mx-auto mb-2 text-[var(--theme-text-secondary)]" />
                <div className="text-xs text-[var(--theme-text-secondary)]">本地存储</div>
                <div className="text-sm font-semibold text-[var(--theme-text-primary)]">{storageUsage.localStorage}</div>
              </div>
              <div className="bg-[var(--theme-bg-secondary)] rounded-lg p-3 text-center">
                <Cloud size={24} className="mx-auto mb-2 text-[var(--theme-text-secondary)]" />
                <div className="text-xs text-[var(--theme-text-secondary)]">云端备份</div>
                <div className="text-sm font-semibold text-[var(--theme-text-primary)]">{storageUsage.firebase}</div>
              </div>
            </div>
          )}

          <div className="text-sm text-[var(--theme-text-secondary)] bg-[var(--theme-bg-secondary)] rounded-lg p-3">
            <p className="mb-2">
              浏览器存储空间已满。您可以：
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>导出重要数据备份</li>
              <li>让系统自动清理最旧的聊天记录</li>
              <li>数据将自动备份到云端（需要网络连接）</li>
            </ul>
          </div>

          {/* 导出选项 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">导出备份</h3>
            
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => handleExport('all')}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-[var(--theme-text-link)] text-white rounded-lg hover:bg-[var(--theme-text-link-hover)] transition-colors disabled:opacity-50"
              >
                {isExporting && exportType === 'all' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <Database size={buttonIconSize} />
                )}
                完整备份（推荐）
              </button>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleExport('settings')}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] rounded-lg hover:bg-[var(--theme-bg-input)] transition-colors disabled:opacity-50"
                >
                  {isExporting && exportType === 'settings' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                  ) : (
                    <Download size={buttonIconSize} />
                  )}
                  设置
                </button>
                
                <button
                  onClick={() => handleExport('chats')}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] rounded-lg hover:bg-[var(--theme-bg-input)] transition-colors disabled:opacity-50"
                >
                  {isExporting && exportType === 'chats' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                  ) : (
                    <FileDown size={buttonIconSize} />
                  )}
                  聊天记录
                </button>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onProceedWithCleanup}
              className="flex-1 px-4 py-2 bg-[var(--theme-text-warning)] text-white rounded-lg hover:bg-[var(--theme-text-warning-hover)] transition-colors"
            >
              继续并自动清理
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] rounded-lg hover:bg-[var(--theme-bg-input)] transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
import React, { useState } from 'react';
import { AlertTriangle, HardDrive, Cloud, Download, Upload, X, Loader2 } from 'lucide-react';
import { Modal } from './shared/Modal';
import { firebaseStorageService } from '../services/firebaseStorageService';
import { translations, getResponsiveValue } from '../utils/appUtils';

interface StorageFullModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportChat: (format: 'png' | 'html' | 'txt') => void;
  onMigrateToFirebase?: () => void;
  exportStatus: 'idle' | 'exporting';
  storageQuota: {
    used: number;
    limit: number;
    percentage: number;
    isNearLimit: boolean;
    isOverLimit: boolean;
  };
  t: (key: keyof typeof translations, fallback?: string) => string;
}

export const StorageFullModal: React.FC<StorageFullModalProps> = ({
  isOpen,
  onClose,
  onExportChat,
  onMigrateToFirebase,
  exportStatus,
  storageQuota,
  t
}) => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    migratedKeys: string[];
    errors: string[];
  } | null>(null);

  const headingIconSize = getResponsiveValue(20, 24);
  const buttonIconSize = getResponsiveValue(18, 20);
  const isLoading = exportStatus === 'exporting' || isMigrating;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleMigrateToFirebase = async () => {
    if (!onMigrateToFirebase) return;
    
    setIsMigrating(true);
    setMigrationResult(null);
    
    try {
      const result = await firebaseStorageService.migrateToFirebase();
      setMigrationResult(result);
      
      if (result.success) {
        onMigrateToFirebase();
      }
    } catch (error) {
      setMigrationResult({
        success: false,
        migratedKeys: [],
        errors: [error.message]
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const firebaseStatus = firebaseStorageService.getFirebaseStatus();

  return (
    <Modal isOpen={isOpen} onClose={isLoading ? () => {} : onClose}>
      <div 
        className="bg-[var(--theme-bg-primary)] rounded-xl shadow-premium w-full max-w-md sm:max-w-2xl flex flex-col"
        role="alert"
        aria-labelledby="storage-full-title"
      >
        <div className="flex-shrink-0 flex justify-between items-center p-3 sm:p-4 border-b border-[var(--theme-border-primary)]">
          <h2 id="storage-full-title" className="text-lg sm:text-xl font-semibold text-red-500 flex items-center">
            <AlertTriangle size={headingIconSize} className="mr-2.5" />
            {storageQuota.isOverLimit ? '存储空间已满' : '存储空间不足'}
          </h2>
          <button 
            onClick={onClose} 
            disabled={isLoading}
            className="text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)] transition-colors p-1 rounded-full disabled:opacity-50" 
            aria-label="关闭对话框"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Storage Usage Info */}
          <div className="bg-[var(--theme-bg-secondary)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <HardDrive size={18} className="mr-2 text-[var(--theme-text-secondary)]" />
                <span className="text-sm font-medium text-[var(--theme-text-primary)]">本地存储使用情况</span>
              </div>
              <span className="text-sm text-[var(--theme-text-secondary)]">
                {formatBytes(storageQuota.used)} / {formatBytes(storageQuota.limit)}
              </span>
            </div>
            
            <div className="w-full bg-[var(--theme-border-secondary)] rounded-full h-2 mb-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  storageQuota.percentage >= 100 ? 'bg-red-500' :
                  storageQuota.percentage >= 80 ? 'bg-yellow-500' : 
                  'bg-green-500'
                }`}
                style={{ width: `${Math.min(storageQuota.percentage, 100)}%` }}
              />
            </div>
            
            <p className="text-xs text-[var(--theme-text-tertiary)]">
              已使用 {storageQuota.percentage.toFixed(1)}%
              {storageQuota.isOverLimit && ' - 存储空间已满，需要立即处理'}
              {storageQuota.isNearLimit && !storageQuota.isOverLimit && ' - 即将达到存储限制'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[var(--theme-text-primary)]">解决方案：</h3>
            
            {/* Export Chat Options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => onExportChat('txt')}
                disabled={isLoading}
                className="flex items-center justify-center p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {exportStatus === 'exporting' ? (
                  <Loader2 size={buttonIconSize} className="animate-spin" />
                ) : (
                  <Download size={buttonIconSize} />
                )}
                <span className="ml-2">导出为文本</span>
              </button>
              
              <button
                onClick={() => onExportChat('html')}
                disabled={isLoading}
                className="flex items-center justify-center p-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {exportStatus === 'exporting' ? (
                  <Loader2 size={buttonIconSize} className="animate-spin" />
                ) : (
                  <Download size={buttonIconSize} />
                )}
                <span className="ml-2">导出为HTML</span>
              </button>
              
              <button
                onClick={() => onExportChat('png')}
                disabled={isLoading}
                className="flex items-center justify-center p-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {exportStatus === 'exporting' ? (
                  <Loader2 size={buttonIconSize} className="animate-spin" />
                ) : (
                  <Download size={buttonIconSize} />
                )}
                <span className="ml-2">导出为图片</span>
              </button>
            </div>

            {/* Firebase Migration Option */}
            {firebaseStatus.available && onMigrateToFirebase && (
              <button
                onClick={handleMigrateToFirebase}
                disabled={isLoading}
                className="w-full flex items-center justify-center p-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isMigrating ? (
                  <Loader2 size={buttonIconSize} className="animate-spin" />
                ) : (
                  <Cloud size={buttonIconSize} />
                )}
                <span className="ml-2">迁移到云端存储</span>
              </button>
            )}

            {/* Firebase Status */}
            <div className="bg-[var(--theme-bg-secondary)] rounded-lg p-3">
              <div className="flex items-center">
                <Cloud size={16} className={`mr-2 ${firebaseStatus.available ? 'text-green-500' : 'text-gray-400'}`} />
                <span className="text-sm text-[var(--theme-text-primary)]">
                  云端存储: {firebaseStatus.available ? '已连接' : '未连接'}
                </span>
              </div>
              {!firebaseStatus.available && (
                <p className="text-xs text-[var(--theme-text-tertiary)] mt-1">
                  启用云端存储可以突破 5MB 本地存储限制
                </p>
              )}
            </div>

            {/* Migration Result */}
            {migrationResult && (
              <div className={`rounded-lg p-3 ${
                migrationResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <p className={`text-sm font-medium ${
                  migrationResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {migrationResult.success ? '迁移成功!' : '迁移失败'}
                </p>
                {migrationResult.migratedKeys.length > 0 && (
                  <p className="text-xs text-green-700 mt-1">
                    已迁移 {migrationResult.migratedKeys.length} 项数据到云端
                  </p>
                )}
                {migrationResult.errors.length > 0 && (
                  <div className="text-xs text-red-700 mt-1">
                    <p>错误信息：</p>
                    {migrationResult.errors.slice(0, 3).map((error, index) => (
                      <p key={index}>• {error}</p>
                    ))}
                    {migrationResult.errors.length > 3 && (
                      <p>...还有 {migrationResult.errors.length - 3} 个错误</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-xs text-[var(--theme-text-tertiary)] bg-yellow-50 border border-yellow-200 rounded p-2">
            <strong>提示：</strong> 为避免数据丢失，建议定期导出聊天记录。启用云端存储可以自动同步并突破本地存储限制。
          </div>
        </div>
      </div>
    </Modal>
  );
};
import { useRef } from 'react';
import { Upload, Download, Save } from 'lucide-react';
import { persistentStoreService } from '../../services/persistentStoreService';
import { getResponsiveValue } from '../../utils/appUtils';
import { PersistentStore } from '../../types';

interface DataImportExportProps {
  t: (key: string) => string;
  onImportSuccess?: (newStore: PersistentStore) => void;
  refreshTrigger?: number; // 添加刷新触发器
}

export const DataImportExport: React.FC<DataImportExportProps> = ({ 
  t, 
  onImportSuccess, 
  refreshTrigger 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiConfigFileInputRef = useRef<HTMLInputElement>(null);
  const systemPromptsFileInputRef = useRef<HTMLInputElement>(null);
  const buttonIconSize = getResponsiveValue(12, 14);

  const baseButtonClass = "px-3 sm:px-4 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-secondary)] flex items-center justify-center gap-2 text-sm font-medium w-full sm:w-auto";
  
  const handleExportSettings = () => {
    persistentStoreService.exportToJSON();
  };

  const handleExportApiConfigs = () => {
    persistentStoreService.exportApiConfigsToJSON();
  };

  const handleExportSystemPrompts = () => {
    persistentStoreService.exportSystemPromptsToJSON();
  };

  const handleImportSettings = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleImportApiConfigs = () => {
    if (apiConfigFileInputRef.current) {
      apiConfigFileInputRef.current.click();
    }
  };
  
  const handleImportSystemPrompts = () => {
    if (systemPromptsFileInputRef.current) {
      systemPromptsFileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, importType: 'all' | 'api' | 'prompts') => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        let newStore: PersistentStore | null = null;
        
        switch(importType) {
          case 'all':
            newStore = await persistentStoreService.importFromJSON(file);
            break;
          case 'api':
            newStore = await persistentStoreService.importApiConfigsFromJSON(file);
            break;
          case 'prompts':
            newStore = await persistentStoreService.importSystemPromptsFromJSON(file);
            break;
        }
        
        if (newStore) {
          alert(t('importSuccess') || '导入成功！');
          // 调用回调函数，触发即时刷新
          if (onImportSuccess) {
            onImportSuccess(newStore);
          }
        } else {
          alert(t('importFailure') || '导入失败，请检查文件格式是否正确');
        }
      } catch (error) {
        console.error('导入错误:', error);
        alert(t('importError') || '导入出错');
      }
      
      // 重置 file input 以便能再次选择同一文件
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  return (
    <div>
      <h4 className="text-sm font-medium text-[var(--theme-text-primary)] mb-2">
        {t('dataImportExportTitle') || '数据导出与导入'}
      </h4>
      
      {/* 主要导入导出 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <button
          onClick={handleExportSettings}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-link)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Download size={buttonIconSize} />
          <span>{t('exportAllSettings') || '导出所有设置'}</span>
        </button>
        <button
          onClick={handleImportSettings}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-link)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Upload size={buttonIconSize} />
          <span>{t('importSettings') || '导入设置'}</span>
        </button>
        <input 
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFileChange(e, 'all')}
          accept=".json"
          style={{ display: 'none' }}
        />
      </div>
      
      {/* API配置导入导出 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <button
          onClick={handleExportApiConfigs}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-secondary)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Save size={buttonIconSize} />
          <span>{t('exportApiConfigs') || '导出API配置'}</span>
        </button>
        <button
          onClick={handleImportApiConfigs}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-secondary)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Upload size={buttonIconSize} />
          <span>{t('importApiConfigs') || '导入API配置'}</span>
        </button>
        <input 
          type="file"
          ref={apiConfigFileInputRef}
          onChange={(e) => handleFileChange(e, 'api')}
          accept=".json"
          style={{ display: 'none' }}
        />
      </div>
      
      {/* 系统提示词导入导出 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleExportSystemPrompts}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-secondary)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Save size={buttonIconSize} />
          <span>{t('exportSystemPrompts') || '导出系统提示词'}</span>
        </button>
        <button
          onClick={handleImportSystemPrompts}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-secondary)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Upload size={buttonIconSize} />
          <span>{t('importSystemPrompts') || '导入系统提示词'}</span>
        </button>
        <input 
          type="file"
          ref={systemPromptsFileInputRef}
          onChange={(e) => handleFileChange(e, 'prompts')}
          accept=".json"
          style={{ display: 'none' }}
        />
      </div>
      
      <div className="mt-2 text-xs text-[var(--theme-text-tertiary)]">
        <p>{t('sensitiveDataWarning') || '导出的配置文件包含您的API密钥等敏感信息，请妥善保管'}</p>
      </div>
    </div>
  );
};

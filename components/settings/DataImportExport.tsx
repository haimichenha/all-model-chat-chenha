import React, { useRef } from 'react';
import { Upload, Download, Save } from 'lucide-react';
import { persistentStoreService } from '../../services/persistentStoreService';
import { getResponsiveValue } from '../../utils/appUtils';
import { PersistentStore } from '../../types';

interface DataImportExportProps {
  t: (key: string) => string;
  onImportSuccess?: (newStore: PersistentStore, currentSystemInstruction?: string) => void;
  refreshTrigger?: number; // 添加刷新触发器
  currentSystemInstruction?: string; // 当前使用的系统指令
}

export const DataImportExport: React.FC<DataImportExportProps> = ({ onImportSuccess, refreshTrigger, currentSystemInstruction }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiConfigFileInputRef = useRef<HTMLInputElement>(null);
  const systemPromptsFileInputRef = useRef<HTMLInputElement>(null);
  const buttonIconSize = getResponsiveValue(12, 14);

  // 避免未使用变量警告
  void refreshTrigger;

  const baseButtonClass = "px-3 sm:px-4 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-secondary)] flex items-center justify-center gap-2 text-sm font-medium w-full sm:w-auto";
  
  const handleExportSettings = () => {
    persistentStoreService.exportToJSON('all-model-chat-settings', currentSystemInstruction);
  };

  const handleExportApiConfigs = () => {
    persistentStoreService.exportApiConfigsToJSON();
  };

  const handleExportSystemPrompts = () => {
    persistentStoreService.exportSystemPromptsToJSON();
  };

  const handleExportCurrentSystemInstruction = () => {
    if (!currentSystemInstruction || currentSystemInstruction.trim() === '') {
      alert('当前没有设置系统指令');
      return;
    }

    try {
      const dataStr = JSON.stringify({
        systemInstruction: currentSystemInstruction,
        exportTime: new Date().toISOString(),
        exportType: 'current_system_instruction'
      }, null, 2);
      
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      const link = document.createElement('a');
      link.setAttribute('href', dataUri);
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      link.setAttribute('download', `current-system-instruction_${timestamp}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.info('导出当前系统指令成功');
    } catch (error) {
      console.error('导出当前系统指令失败:', error);
      alert('导出失败，请查看控制台日志获取详情。');
    }
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
        let newStore: any = null;
        
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
          // 检查是否导入了当前系统指令
          if (importType === 'prompts' && newStore.currentSystemInstruction) {
            alert('成功导入当前系统指令！该指令将应用到当前聊天设置。');
            // 调用回调函数，传递当前系统指令
            if (onImportSuccess) {
              const { currentSystemInstruction, ...storeData } = newStore;
              onImportSuccess(storeData, currentSystemInstruction);
            }
          } else {
            alert('导入成功！');
            // 调用回调函数，触发即时刷新，并传递当前系统指令（如果有）
            if (onImportSuccess) {
              const { currentSystemInstruction, ...storeData } = newStore;
              onImportSuccess(storeData, currentSystemInstruction);
            }
          }
        } else {
          alert('导入失败，请检查文件格式是否正确');
        }
      } catch (error) {
        console.error('导入错误:', error);
        alert('导入出错');
      }
      
      // 重置 file input 以便能再次选择同一文件
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  return (
    <div>
      <h4 className="text-sm font-medium text-[var(--theme-text-primary)] mb-2">数据导出与导入</h4>
      
      {/* 主要导入导出 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <button
          onClick={handleExportSettings}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-link)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Download size={buttonIconSize} />
          <span>导出所有设置</span>
        </button>
        <button
          onClick={handleImportSettings}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-link)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Upload size={buttonIconSize} />
          <span>导入设置</span>
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
          <span>导出API配置</span>
        </button>
        <button
          onClick={handleImportApiConfigs}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-secondary)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Upload size={buttonIconSize} />
          <span>导入API配置</span>
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
          onClick={handleExportCurrentSystemInstruction}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-secondary)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Save size={buttonIconSize} />
          <span>导出当前系统指令</span>
        </button>
        <button
          onClick={handleExportSystemPrompts}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-secondary)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Save size={buttonIconSize} />
          <span>导出提示词模板</span>
        </button>
        <button
          onClick={handleImportSystemPrompts}
          type="button"
          className={`${baseButtonClass} bg-[var(--theme-bg-tertiary)] border border-transparent text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-input)] hover:text-[var(--theme-text-secondary)] focus:ring-[var(--theme-border-secondary)]`}
        >
          <Upload size={buttonIconSize} />
          <span>导入系统提示词</span>
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
        <p>导出的配置文件包含您的API密钥等敏感信息，请妥善保管</p>
        <p className="mt-1">支持导入：系统提示词模板、当前系统指令文件</p>
      </div>
    </div>
  );
};

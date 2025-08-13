import React, { useState, useEffect } from 'react';
import { KeyRound, Info, Plus, Trash2, Save, EyeOff, Eye } from 'lucide-react';
import { getResponsiveValue } from '../../utils/appUtils';
import { ApiConfig } from '../../types';
import { persistentStoreService } from '../../services/persistentStoreService';
import { translations } from '../../utils/appUtils';

interface ApiConfigSectionProps {
  // 当用户选择了一个新的活动配置时，调用此函数通知父组件
  onActiveConfigChange: (newConfig: ApiConfig | null) => void;
  // 是否使用自定义API配置
  useCustomApiConfig: boolean;
  setUseCustomApiConfig: (value: boolean) => void;
  // 当前激活的配置ID，用于高亮显示
  activeApiConfigId: string | null;
  // 刷新触发器，用于强制刷新组件
  refreshTrigger?: number;
  // 翻译函数
  t: (key: keyof typeof translations | string) => string;
}

export const ApiConfigSection: React.FC<ApiConfigSectionProps> = ({
  onActiveConfigChange,
  useCustomApiConfig,
  setUseCustomApiConfig,
  activeApiConfigId,
  // onClose 参数暂时未使用，将在未来版本中用于自动关闭设置面板
  refreshTrigger,
  t,
}) => {
  const [isApiKeyFocused, setIsApiKeyFocused] = useState(false);
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([]);
  const [newConfigName, setNewConfigName] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // 当前正在编辑的配置
  // TODO: 在未来版本中可能需要直接引用当前配置对象
  // const [currentConfig, setCurrentConfig] = useState<ApiConfig | null>(null);
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempProxyUrl, setTempProxyUrl] = useState('');

  // 从持久化存储加载API配置
  useEffect(() => {
    // 每次组件渲染、activeApiConfigId 变化或 refreshTrigger 变化时，都从"单一事实来源"重新加载数据
    const allConfigs = persistentStoreService.getApiConfigs();
    setApiConfigs(allConfigs);

    let activeConfig = null;
    if (activeApiConfigId) {
        activeConfig = allConfigs.find(c => c.id === activeApiConfigId) || null;
    }
    
    // 如果找不到指定的 active ID (可能已被删除)，则回退到当前或第一个配置
    if (!activeConfig) {
        activeConfig = persistentStoreService.getCurrentOrFirstApiConfig();
        // 如果连回退的配置都没有，则清空表单
        if (!activeConfig) {
            setTempApiKey('');
            setTempProxyUrl('');
            return; // 提前退出
        }
    }

    // 更新表单的临时值
  setTempApiKey(activeConfig.apiKey);
  setTempProxyUrl((activeConfig as any).apiProxyUrl || (activeConfig as any).proxyUrl || ''); // 兼容旧字段，确保字符串
  }, [activeApiConfigId, refreshTrigger]); // 添加 refreshTrigger 依赖

  const inputBaseClasses = "w-full p-2 border rounded-md focus:ring-2 focus:border-[var(--theme-border-focus)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] text-sm custom-scrollbar";
  const enabledInputClasses = "bg-[var(--theme-bg-input)] border-[var(--theme-border-secondary)] focus:ring-[var(--theme-border-focus)]";
  const disabledInputClasses = "bg-[var(--theme-bg-secondary)] border-[var(--theme-border-primary)] opacity-60 cursor-not-allowed";
  const iconSize = getResponsiveValue(14, 16);

  const apiKeyBlurClass = !isApiKeyFocused && useCustomApiConfig && tempApiKey ? 'text-transparent [text-shadow:0_0_5px_var(--theme-text-primary)]' : '';

  // 处理保存API配置
  const handleSaveConfig = () => {
    if (!tempApiKey) return;
    
    let updatedConfig: ApiConfig | null = null;
    
    try {
      if (activeApiConfigId && !isAddingNew) {
        // 更新现有配置
        persistentStoreService.updateApiConfig(activeApiConfigId, {
          apiKey: tempApiKey,
          apiProxyUrl: (tempProxyUrl || '').trim()
        });
        updatedConfig = persistentStoreService.getApiConfigById(activeApiConfigId) || null;
      } else {
        // 创建新配置
        updatedConfig = persistentStoreService.addApiConfig({
          name: newConfigName || '默认 API 配置',
          apiKey: tempApiKey,
          apiProxyUrl: (tempProxyUrl || '').trim(),
          isDefault: apiConfigs.length === 0 // 如果是第一个配置，设为默认
        });
        
        // 设置为当前选择的配置
        if (updatedConfig) {
          persistentStoreService.setLastSelectedApiConfigId(updatedConfig.id);
        }
      }
      
      // 通知父组件配置变更
      if (updatedConfig) {
        onActiveConfigChange(updatedConfig);
      }
    } catch (error) {
      console.error('保存 API 配置时出错:', error);
      // 可以添加错误处理逻辑，例如显示错误提示
    } finally {
      // 无论成功与否，都重新加载配置列表以反映最新状态
      setApiConfigs(persistentStoreService.getApiConfigs());
      setIsAddingNew(false);
      setNewConfigName('');
    }
  };

  // 切换到新增配置模式
  const handleAddNewConfig = () => {
    setTempApiKey('');
    setTempProxyUrl('');
    setIsAddingNew(true);
  };

  // 选择一个配置
  const handleSelectConfig = (configId: string) => {
    const config = persistentStoreService.getApiConfigById(configId);
    if (config) {
      setTempApiKey(config.apiKey);
      setTempProxyUrl(((config as any).apiProxyUrl || (config as any).proxyUrl) ?? '');
      persistentStoreService.setLastSelectedApiConfigId(config.id);
      onActiveConfigChange(config); // 通知父组件，活动配置已更改
    }
  };

  // 删除配置
  const handleDeleteConfig = (configId: string) => {
    persistentStoreService.deleteApiConfig(configId);
    
    // 重新加载配置列表
    const updatedConfigs = persistentStoreService.getApiConfigs();
    setApiConfigs(updatedConfigs);
    
    // 如果删除的是当前选中的配置，重置表单并选择新的当前配置
    if (configId === activeApiConfigId) {
      const newCurrentConfig = persistentStoreService.getCurrentOrFirstApiConfig();
      if (newCurrentConfig) {
        setTempApiKey(newCurrentConfig.apiKey);
        setTempProxyUrl(((newCurrentConfig as any).apiProxyUrl || (newCurrentConfig as any).proxyUrl) || '');
        onActiveConfigChange(newCurrentConfig);
      } else {
        setTempApiKey('');
        setTempProxyUrl('');
        onActiveConfigChange(null);
        setIsAddingNew(updatedConfigs.length === 0); // 如果没有配置了，自动进入添加模式
      }
    }
  };

  // 取消新增配置
  const handleCancelAddNew = () => {
    setIsAddingNew(false);
    const config = persistentStoreService.getApiConfigById(activeApiConfigId || '') || 
                   persistentStoreService.getCurrentOrFirstApiConfig();
    if (config) {
      setTempApiKey(config.apiKey);
      setTempProxyUrl(((config as any).apiProxyUrl || (config as any).proxyUrl) || '');
    } else {
      setTempApiKey('');
      setTempProxyUrl('');
    }
  };

  return (
    <div className="space-y-3 p-3 sm:p-4 border border-[var(--theme-border-secondary)] rounded-lg bg-[var(--theme-bg-secondary)]">
      <h3 className="text-sm font-semibold text-[var(--theme-text-primary)] flex items-center mb-2">
        <KeyRound size={iconSize} className="mr-2 text-[var(--theme-text-link)] opacity-80" />
        {t('settingsApiConfig')}
      </h3>

      <label htmlFor="use-custom-api-config-toggle" className="flex items-center justify-between py-1 cursor-pointer">
        <span className="text-sm font-medium text-[var(--theme-text-secondary)]">
          {t('settingsUseCustomApi')}
        </span>
        <div className="relative">
          <input
            id="use-custom-api-config-toggle"
            type="checkbox"
            className="sr-only peer"
            checked={useCustomApiConfig}
            onChange={() => setUseCustomApiConfig(!useCustomApiConfig)}
          />
          <div className="w-11 h-6 bg-[var(--theme-bg-input)] rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-offset-[var(--theme-bg-secondary)] peer-focus:ring-[var(--theme-border-focus)] peer-checked:bg-[var(--theme-bg-accent)] transition-colors duration-200 ease-in-out"></div>
          <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out peer-checked:translate-x-5"></div>
        </div>
      </label>

      {!useCustomApiConfig && (
        <p className="text-xs text-[var(--theme-text-tertiary)] flex items-center bg-[var(--theme-bg-info)] bg-opacity-30 p-2 rounded-md border border-[var(--theme-border-secondary)]">
          <Info size={14} className="mr-2 flex-shrink-0 text-[var(--theme-text-info)]" />
          {t('apiConfig_default_info')}
        </p>
      )}

      <div className={`space-y-4 ${!useCustomApiConfig ? 'opacity-50' : ''}`}>
        {/* API配置选择 */}
        {apiConfigs.length > 0 && !isAddingNew && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">API 配置</label>
            <div className="flex flex-col space-y-2">
              {apiConfigs.map(config => (
                <div 
                  key={config.id} 
                  className={`flex justify-between items-center p-2 rounded border ${activeApiConfigId === config.id 
                    ? 'bg-[var(--theme-bg-accent-soft)] border-[var(--theme-border-focus)]' 
                    : 'border-[var(--theme-border-secondary)]'}`}
                >
                  <div 
                    className="flex-grow cursor-pointer" 
                    onClick={() => useCustomApiConfig && handleSelectConfig(config.id)}
                  >
                    <div className="font-medium text-sm">{config.name}</div>
                    <div className="text-xs text-[var(--theme-text-tertiary)]">
                      {((config as any).apiProxyUrl || (config as any).proxyUrl) ? `代理: ${((config as any).apiProxyUrl || (config as any).proxyUrl)}` : '无代理'}
                      {config.isDefault && ' • 默认'}
                    </div>
                  </div>
                  {useCustomApiConfig && (
                    <button 
                      onClick={() => handleDeleteConfig(config.id)}
                      className="p-1.5 hover:bg-[var(--theme-bg-danger)] rounded-full transition-colors"
                      title="删除配置"
                      aria-label="删除API配置"
                      disabled={!useCustomApiConfig}
                    >
                      <Trash2 size={16} className="text-[var(--theme-text-danger)]" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 添加新配置按钮 */}
        {useCustomApiConfig && !isAddingNew && (
          <button 
            onClick={handleAddNewConfig}
            className="flex items-center space-x-1 text-xs font-medium text-[var(--theme-text-link)] hover:text-[var(--theme-text-link-hover)] transition-colors"
          >
            <Plus size={14} />
            <span>添加新配置</span>
          </button>
        )}

        {/* 新配置名称输入 */}
        {isAddingNew && (
          <div>
            <label htmlFor="config-name-input" className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5">配置名称</label>
            <input
              id="config-name-input"
              type="text"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              className={`${inputBaseClasses} ${useCustomApiConfig ? enabledInputClasses : disabledInputClasses}`}
              placeholder="例如: Gemini Pro 配置"
              disabled={!useCustomApiConfig}
            />
          </div>
        )}

        {/* API Key 输入 */}
        <div>
          <label htmlFor="api-key-input" className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5">
            <span>{t('settingsApiKey')}</span>
            {useCustomApiConfig && (
              <button 
                onClick={() => setShowApiKey(!showApiKey)}
                className="ml-2 inline-flex items-center text-xs text-[var(--theme-text-link)]"
                title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
              >
                {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
          </label>
          <textarea
            id="api-key-input"
            rows={3}
            value={tempApiKey}
            onChange={(e) => setTempApiKey(e.target.value)}
            onFocus={() => setIsApiKeyFocused(true)}
            onBlur={() => setIsApiKeyFocused(false)}
            className={`${inputBaseClasses} ${useCustomApiConfig ? enabledInputClasses : disabledInputClasses} resize-y min-h-[60px] transition-all duration-200 ease-in-out ${!showApiKey ? apiKeyBlurClass : ''}`}
            placeholder={useCustomApiConfig ? t('apiConfig_key_placeholder') : t('apiConfig_key_placeholder_disabled')}
            aria-label="Gemini API Key input"
            disabled={!useCustomApiConfig}
          />
          {useCustomApiConfig && (
            <p className="text-xs text-[var(--theme-text-tertiary)] mt-1.5">
              {t('settingsApiKeyHelpText')}
            </p>
          )}
        </div>

        {/* API 代理 URL 输入 */}
        <div>
          <label htmlFor="api-proxy-url-input" className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5">API 代理 URL (可选)</label>
          <input
            id="api-proxy-url-input"
            type="text"
            value={tempProxyUrl}
            onChange={(e) => setTempProxyUrl(e.target.value)}
            className={`${inputBaseClasses} ${useCustomApiConfig ? enabledInputClasses : disabledInputClasses}`}
            placeholder={useCustomApiConfig ? 'e.g., http://localhost:3000/v1beta' : '启用自定义配置以设置代理'}
            aria-label="API Proxy URL"
            disabled={!useCustomApiConfig}
          />
          {useCustomApiConfig && (
            <p className="text-xs text-[var(--theme-text-tertiary)] mt-1.5">
              替换 <code>https://generativelanguage.googleapis.com/v1beta</code> 用于 API 调用。
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        {useCustomApiConfig && (
          <div className="flex justify-end space-x-2 pt-2">
            {isAddingNew && (
              <button 
                onClick={handleCancelAddNew}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-hover)] text-[var(--theme-text-secondary)] rounded-md transition-colors"
              >
                取消
              </button>
            )}
            <button 
              onClick={handleSaveConfig}
              className="px-3 py-1.5 text-xs font-medium bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] text-white rounded-md transition-colors flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!tempApiKey}
            >
              <Save size={14} />
              <span>保存配置</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

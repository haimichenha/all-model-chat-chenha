import { useState } from 'react';
import { Plus, Edit, Trash2, Check, X, Key } from 'lucide-react';
import { ApiConfig } from '../../types';

interface ApiConfigManagerProps {
  apiConfigs: ApiConfig[];
  activeApiConfigId: string | null;
  onApiConfigsChange: (apiConfigs: ApiConfig[]) => void;
  onActiveApiConfigChange: (activeApiConfigId: string | null) => void;
  t: (key: string) => string;
}

export const ApiConfigManager: React.FC<ApiConfigManagerProps> = ({
  apiConfigs,
  activeApiConfigId,
  onApiConfigsChange,
  onActiveApiConfigChange,
  t
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newConfigName, setNewConfigName] = useState('');
  const [newConfigApiKey, setNewConfigApiKey] = useState('');
  const [newConfigProxyUrl, setNewConfigProxyUrl] = useState('');
  const [editConfigName, setEditConfigName] = useState('');
  const [editConfigApiKey, setEditConfigApiKey] = useState('');
  const [editConfigProxyUrl, setEditConfigProxyUrl] = useState('');

  const handleAddConfig = () => {
    if (!newConfigName.trim() || !newConfigApiKey.trim()) return;

    const newConfig: ApiConfig = {
      id: `config_${Date.now()}`,
      name: newConfigName.trim(),
      apiKey: newConfigApiKey.trim(),
      apiProxyUrl: newConfigProxyUrl.trim() || null,
      isDefault: false
    };

    const updatedConfigs = [...apiConfigs, newConfig];
    onApiConfigsChange(updatedConfigs);
    
    setNewConfigName('');
    setNewConfigApiKey('');
    setNewConfigProxyUrl('');
    setIsAdding(false);
  };

  const handleEditConfig = (config: ApiConfig) => {
    setEditingId(config.id);
    setEditConfigName(config.name);
    setEditConfigApiKey(config.apiKey);
    setEditConfigProxyUrl(config.apiProxyUrl || '');
  };

  const handleSaveEdit = () => {
    if (!editConfigName.trim() || !editConfigApiKey.trim() || !editingId) return;

    const updatedConfigs = apiConfigs.map(config => 
      config.id === editingId 
        ? { 
            ...config, 
            name: editConfigName.trim(), 
            apiKey: editConfigApiKey.trim(),
            apiProxyUrl: editConfigProxyUrl.trim() || null
          }
        : config
    );
    
    onApiConfigsChange(updatedConfigs);
    setEditingId(null);
    setEditConfigName('');
    setEditConfigApiKey('');
    setEditConfigProxyUrl('');
  };

  const handleDeleteConfig = (configId: string) => {
    const updatedConfigs = apiConfigs.filter(config => config.id !== configId);
    onApiConfigsChange(updatedConfigs);
    
    // If we deleted the active config, clear the active selection
    if (activeApiConfigId === configId) {
      onActiveApiConfigChange(null);
    }
  };

  const handleSetDefault = (configId: string) => {
    const updatedConfigs = apiConfigs.map(config => ({
      ...config,
      isDefault: config.id === configId
    }));
    
    onApiConfigsChange(updatedConfigs);
    onActiveApiConfigChange(configId);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewConfigName('');
    setNewConfigApiKey('');
    setNewConfigProxyUrl('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditConfigName('');
    setEditConfigApiKey('');
    setEditConfigProxyUrl('');
  };

  const handleSelectConfig = (configId: string | null) => {
    onActiveApiConfigChange(configId);
  };

  const inputBaseClasses = "w-full p-2 border rounded-md focus:ring-2 focus:border-[var(--theme-border-focus)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] text-sm";
  const enabledInputClasses = "bg-[var(--theme-bg-input)] border-[var(--theme-border-secondary)] focus:ring-[var(--theme-border-focus)]";
  const buttonClasses = "px-3 py-1.5 rounded-md text-sm font-medium transition-colors";
  const primaryButtonClasses = "bg-[var(--theme-bg-accent)] text-[var(--theme-text-on-accent)] hover:bg-[var(--theme-bg-accent-hover)]";
  const secondaryButtonClasses = "bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-secondary-hover)] border border-[var(--theme-border-secondary)]";
  const dangerButtonClasses = "bg-red-500 text-white hover:bg-red-600";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-[var(--theme-text-secondary)]">
          {t('settingsApiConfigs') || 'API 配置管理'}
        </label>
        <button
          onClick={() => setIsAdding(true)}
          className={`${buttonClasses} ${primaryButtonClasses} flex items-center gap-1.5`}
          disabled={isAdding}
        >
          <Plus size={14} />
          {t('addApiConfig') || '添加配置'}
        </button>
      </div>

      {/* Add new config section */}
      {isAdding && (
        <div className="border border-[var(--theme-border-secondary)] rounded-lg p-4 bg-[var(--theme-bg-secondary)]">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                {t('configName') || '配置名称'}
              </label>
              <input
                type="text"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
                className={`${inputBaseClasses} ${enabledInputClasses}`}
                placeholder={t('configNamePlaceholder') || 'e.g., 个人配置, 工作配置...'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                {t('apiKey') || 'API密钥'}
              </label>
              <input
                type="password"
                value={newConfigApiKey}
                onChange={(e) => setNewConfigApiKey(e.target.value)}
                className={`${inputBaseClasses} ${enabledInputClasses}`}
                placeholder={t('apiKeyPlaceholder') || '请输入您的 Gemini API 密钥'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                {t('proxyUrl') || '代理地址 (可选)'}
              </label>
              <input
                type="text"
                value={newConfigProxyUrl}
                onChange={(e) => setNewConfigProxyUrl(e.target.value)}
                className={`${inputBaseClasses} ${enabledInputClasses}`}
                placeholder={t('proxyUrlPlaceholder') || 'https://your-proxy.com'}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancelAdd}
                className={`${buttonClasses} ${secondaryButtonClasses} flex items-center gap-1.5`}
              >
                <X size={14} />
                {t('cancel') || '取消'}
              </button>
              <button
                onClick={handleAddConfig}
                className={`${buttonClasses} ${primaryButtonClasses} flex items-center gap-1.5`}
                disabled={!newConfigName.trim() || !newConfigApiKey.trim()}
              >
                <Check size={14} />
                {t('save') || '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config selection */}
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
            {t('activeApiConfig') || '当前 API 配置'}
          </label>
          <select
            value={activeApiConfigId || ''}
            onChange={(e) => handleSelectConfig(e.target.value || null)}
            className={`${inputBaseClasses} ${enabledInputClasses}`}
          >
            <option value="">{t('noApiConfig') || '无配置'}</option>
            {apiConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
                {config.isDefault ? ` (${t('default') || '默认'})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Existing configs list */}
      {apiConfigs.length > 0 && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--theme-text-secondary)]">
            {t('savedConfigs') || '已保存的配置'}
          </label>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {apiConfigs.map((config) => (
              <div
                key={config.id}
                className={`border rounded-lg p-3 ${
                  activeApiConfigId === config.id
                    ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-accent)] bg-opacity-10'
                    : 'border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]'
                }`}
              >
                {editingId === config.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editConfigName}
                      onChange={(e) => setEditConfigName(e.target.value)}
                      className={`${inputBaseClasses} ${enabledInputClasses}`}
                      placeholder={t('configName') || '配置名称'}
                    />
                    <input
                      type="password"
                      value={editConfigApiKey}
                      onChange={(e) => setEditConfigApiKey(e.target.value)}
                      className={`${inputBaseClasses} ${enabledInputClasses}`}
                      placeholder={t('apiKey') || 'API密钥'}
                    />
                    <input
                      type="text"
                      value={editConfigProxyUrl}
                      onChange={(e) => setEditConfigProxyUrl(e.target.value)}
                      className={`${inputBaseClasses} ${enabledInputClasses}`}
                      placeholder={t('proxyUrl') || '代理地址 (可选)'}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={handleCancelEdit}
                        className={`${buttonClasses} ${secondaryButtonClasses} flex items-center gap-1.5`}
                      >
                        <X size={14} />
                        {t('cancel') || '取消'}
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className={`${buttonClasses} ${primaryButtonClasses} flex items-center gap-1.5`}
                        disabled={!editConfigName.trim() || !editConfigApiKey.trim()}
                      >
                        <Check size={14} />
                        {t('save') || '保存'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Key size={16} className="text-[var(--theme-text-link)]" />
                        <h4 className="font-medium text-[var(--theme-text-primary)]">
                          {config.name}
                        </h4>
                        {config.isDefault && (
                          <span className="px-2 py-0.5 text-xs bg-[var(--theme-bg-accent)] text-[var(--theme-text-on-accent)] rounded">
                            {t('default') || '默认'}
                          </span>
                        )}
                        {activeApiConfigId === config.id && (
                          <span className="w-2.5 h-2.5 bg-green-400 bg-opacity-70 rounded-full" title="Active" />
                        )}
                      </div>
                      <div className="flex gap-1">
                        {!config.isDefault && (
                          <button
                            onClick={() => handleSetDefault(config.id)}
                            className={`${buttonClasses} ${secondaryButtonClasses} text-xs`}
                            title={t('setAsDefault') || '设为默认'}
                          >
                            {t('setDefault') || '设为默认'}
                          </button>
                        )}
                        <button
                          onClick={() => handleEditConfig(config)}
                          className={`${buttonClasses} ${secondaryButtonClasses}`}
                          title={t('edit') || '编辑'}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteConfig(config.id)}
                          className={`${buttonClasses} ${dangerButtonClasses}`}
                          title={t('delete') || '删除'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-[var(--theme-text-secondary)]">
                      <p><strong>API密钥:</strong> {config.apiKey.substring(0, 20)}...</p>
                      {config.apiProxyUrl && (
                        <p><strong>代理地址:</strong> {config.apiProxyUrl}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

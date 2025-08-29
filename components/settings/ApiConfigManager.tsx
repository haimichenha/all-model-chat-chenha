import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Check, X, Star, StarOff } from 'lucide-react';
import { ApiConfig } from '../../types';
import { persistentStoreService } from '../../services/persistentStoreService';
import { Modal } from '../shared/Modal';

interface ApiConfigManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onApiConfigChange: (config: ApiConfig | null) => void;
  currentApiConfigId?: string;
}

export const ApiConfigManager: React.FC<ApiConfigManagerProps> = ({
  isOpen,
  onClose,
  onApiConfigChange,
  currentApiConfigId,
}) => {
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<ApiConfig | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newConfig, setNewConfig] = useState({
    name: '',
    apiKey: '',
    proxyUrl: '',
  });

  // 预设的代理地址选项
  const presetProxyUrls = [
    { label: '直连Google (官方API)', value: '' },
    { label: 'API代理 (api-proxy.me)', value: 'https://api-proxy.me/gemini' },
    { label: '自定义地址', value: 'custom' },
  ];

  useEffect(() => {
    if (isOpen) {
      loadApiConfigs();
    }
  }, [isOpen]);

  const loadApiConfigs = () => {
    const configs = persistentStoreService.getApiConfigs();
    setApiConfigs(configs);
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setNewConfig({
      name: '',
      apiKey: '',
      proxyUrl: 'https://generativelanguage.googleapis.com',
    });
  };

  const handleSaveNew = () => {
    if (!newConfig.name.trim() || !newConfig.apiKey.trim() || !newConfig.proxyUrl.trim()) {
      alert('请填写完整的配置信息');
      return;
    }

    const savedConfig = persistentStoreService.addApiConfig({
      name: newConfig.name.trim(),
      apiKey: newConfig.apiKey.trim(),
      proxyUrl: newConfig.proxyUrl.trim(),
    });

    setApiConfigs(prev => [...prev, savedConfig]);
    setIsAddingNew(false);
    setNewConfig({ name: '', apiKey: '', proxyUrl: '' });
  };

  const handleCancelNew = () => {
    setIsAddingNew(false);
    setNewConfig({ name: '', apiKey: '', proxyUrl: '' });
  };

  const handleEdit = (config: ApiConfig) => {
    setEditingConfig({ ...config });
  };

  const handleSaveEdit = () => {
    if (!editingConfig) return;

    if (!editingConfig.name.trim() || !editingConfig.apiKey.trim() || !editingConfig.proxyUrl.trim()) {
      alert('请填写完整的配置信息');
      return;
    }

    persistentStoreService.updateApiConfig(editingConfig.id, {
      name: editingConfig.name.trim(),
      apiKey: editingConfig.apiKey.trim(),
      proxyUrl: editingConfig.proxyUrl.trim(),
    });

    setApiConfigs(prev => 
      prev.map(config => 
        config.id === editingConfig.id ? { ...editingConfig } : config
      )
    );
    setEditingConfig(null);
  };

  const handleCancelEdit = () => {
    setEditingConfig(null);
  };

  const handleDelete = (config: ApiConfig) => {
    if (confirm(`确定要删除配置 "${config.name}" 吗？`)) {
      persistentStoreService.deleteApiConfig(config.id);
      setApiConfigs(prev => prev.filter(c => c.id !== config.id));
      
      // 如果删除的是当前选中的配置，通知父组件
      if (config.id === currentApiConfigId) {
        onApiConfigChange(null);
      }
    }
  };

  const handleSetDefault = (config: ApiConfig) => {
    persistentStoreService.setDefaultApiConfig(config.id);
    setApiConfigs(prev => 
      prev.map(c => ({ ...c, isDefault: c.id === config.id }))
    );
    onApiConfigChange(config);
  };

  const handleSelectConfig = (config: ApiConfig) => {
    persistentStoreService.setLastSelectedApiConfigId(config.id);
    onApiConfigChange(config);
  };

  const renderProxyUrlSelect = (
    value: string,
    onChange: (value: string) => void,
    customValue: string,
    onCustomChange: (value: string) => void
  ) => {
    const isCustom = !presetProxyUrls.slice(0, -1).some(preset => preset.value === value);
    
    return (
      <div className="space-y-2">
        <select
          value={isCustom ? 'custom' : value}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              onChange(customValue || '');
            } else {
              onChange(e.target.value);
            }
          }}
          className="w-full px-3 py-2 text-sm border border-[var(--theme-border-secondary)] rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent"
        >
          {presetProxyUrls.map(preset => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
        
        {(isCustom || value === 'custom') && (
          <input
            type="text"
            value={isCustom ? value : customValue}
            onChange={(e) => {
              if (isCustom) {
                onChange(e.target.value);
              } else {
                onCustomChange(e.target.value);
              }
            }}
            placeholder="请输入自定义代理地址"
            className="w-full px-3 py-2 text-sm border border-[var(--theme-border-secondary)] rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent"
          />
        )}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-[var(--theme-text-primary)]">API配置管理</h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md"
          >
            <X size={20} />
          </button>
        </div>
      <div className="space-y-4">
        {/* 添加新配置按钮 */}
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-[var(--theme-text-primary)]">
            已保存的API配置 ({apiConfigs.length})
          </h3>
          <button
            onClick={handleAddNew}
            disabled={isAddingNew}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--theme-text-link)] rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            添加新配置
          </button>
        </div>

        {/* 添加新配置表单 */}
        {isAddingNew && (
          <div className="p-4 border border-[var(--theme-border-secondary)] rounded-lg bg-[var(--theme-bg-secondary)]">
            <h4 className="text-md font-medium text-[var(--theme-text-primary)] mb-3">添加新的API配置</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">配置名称</label>
                <input
                  type="text"
                  value={newConfig.name}
                  onChange={(e) => setNewConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：主要账号、备用账号"
                  className="w-full px-3 py-2 text-sm border border-[var(--theme-border-secondary)] rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">API Key</label>
                <input
                  type="password"
                  value={newConfig.apiKey}
                  onChange={(e) => setNewConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="输入Google Gemini API Key"
                  className="w-full px-3 py-2 text-sm border border-[var(--theme-border-secondary)] rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">代理地址</label>
                {renderProxyUrlSelect(
                  newConfig.proxyUrl,
                  (value) => setNewConfig(prev => ({ ...prev, proxyUrl: value })),
                  '',
                  () => {}
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveNew}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <Check size={16} />
                  保存
                </button>
                <button
                  onClick={handleCancelNew}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] rounded-md hover:bg-[var(--theme-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]"
                >
                  <X size={16} />
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 配置列表 */}
        <div className="space-y-3">
          {apiConfigs.length === 0 ? (
            <div className="text-center py-8 text-[var(--theme-text-secondary)]">
              <p>还没有保存任何API配置</p>
              <p className="text-sm">点击上方按钮添加第一个配置</p>
            </div>
          ) : (
            apiConfigs.map((config) => (
              <div
                key={config.id}
                className={`p-4 border rounded-lg transition-colors ${
                  config.id === currentApiConfigId
                    ? 'border-[var(--theme-text-link)] bg-blue-50 dark:bg-blue-900/20'
                    : 'border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)]'
                }`}
              >
                {editingConfig?.id === config.id ? (
                  // 编辑模式
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">配置名称</label>
                      <input
                        type="text"
                        value={editingConfig.name}
                        onChange={(e) => setEditingConfig(prev => prev ? { ...prev, name: e.target.value } : null)}
                        className="w-full px-3 py-2 text-sm border border-[var(--theme-border-secondary)] rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">API Key</label>
                      <input
                        type="password"
                        value={editingConfig.apiKey}
                        onChange={(e) => setEditingConfig(prev => prev ? { ...prev, apiKey: e.target.value } : null)}
                        className="w-full px-3 py-2 text-sm border border-[var(--theme-border-secondary)] rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">代理地址</label>
                      {renderProxyUrlSelect(
                        editingConfig.proxyUrl,
                        (value) => setEditingConfig(prev => prev ? { ...prev, proxyUrl: value } : null),
                        '',
                        () => {}
                      )}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveEdit}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                      >
                        <Check size={14} />
                        保存
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] rounded-md hover:bg-[var(--theme-bg-secondary)]"
                      >
                        <X size={14} />
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  // 显示模式
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-[var(--theme-text-primary)]">{config.name}</h4>
                        {config.isDefault && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                            <Star size={12} />
                            默认
                          </span>
                        )}
                        {config.id === currentApiConfigId && (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            当前使用
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleSelectConfig(config)}
                          className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md"
                          title="选择此配置"
                        >
                          <Check size={16} />
                        </button>
                        {!config.isDefault && (
                          <button
                            onClick={() => handleSetDefault(config)}
                            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-yellow-600 hover:bg-yellow-50 rounded-md"
                            title="设为默认"
                          >
                            <StarOff size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(config)}
                          className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md"
                          title="编辑"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(config)}
                          className="p-1.5 text-[var(--theme-text-secondary)] hover:text-red-600 hover:bg-red-50 rounded-md"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-[var(--theme-text-secondary)] space-y-1">
                      <p>API Key: {config.apiKey.slice(0, 8)}...{config.apiKey.slice(-4)}</p>
                      <p>代理地址: {config.proxyUrl}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 说明文字 */}
        <div className="mt-6 p-3 bg-[var(--theme-bg-secondary)] rounded-lg">
          <h4 className="text-sm font-medium text-[var(--theme-text-primary)] mb-2">使用说明</h4>
          <ul className="text-sm text-[var(--theme-text-secondary)] space-y-1">
            <li>• API配置会被安全保存，不会被"清除历史"删除</li>
            <li>• 可以设置多个配置并随时切换使用</li>
            <li>• 直连Google需要能够访问Google服务</li>
            <li>• API代理适合无法直连的情况</li>
          </ul>
        </div>

        {/* API地址使用提示 */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
            <span>💡</span>
            代理地址使用提示
          </h4>
          <div className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
            <div>
              <strong>直连Google:</strong>
              <p className="ml-2">• 使用官方地址 https://generativelanguage.googleapis.com</p>
              <p className="ml-2">• 需要网络能正常访问Google服务</p>
            </div>
            <div>
              <strong>API代理服务:</strong>
              <p className="ml-2">• api-proxy.me: 公共代理服务，支持Gemini API</p>
              <p className="ml-2">• 自定义代理: 可配置您自己搭建的代理服务地址</p>
            </div>
            <div>
              <strong>网络问题排查:</strong>
              <p className="ml-2">• 如果直连失败，建议切换到代理模式</p>
              <p className="ml-2">• 代理失效时可尝试其他代理地址或直连模式</p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </Modal>
  );
};
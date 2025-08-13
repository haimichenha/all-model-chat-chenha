import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit3, Trash2, Check, X, Star, StarOff, Zap, AlertCircle, CheckCircle, Clock, RefreshCw, Settings, Play } from 'lucide-react';
import { ApiConfig } from '../../types';
import { persistentStoreService } from '../../services/persistentStoreService';
import { apiTestingService, ApiTestResult, ApiSelectionStrategy } from '../../services/apiTestingService';
import { Modal } from '../shared/Modal';
import { getResponsiveValue } from '../../utils/appUtils';

interface EnhancedApiConfigManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onApiConfigChange: (config: ApiConfig | null) => void;
  currentApiConfigId?: string;
}

export const EnhancedApiConfigManager: React.FC<EnhancedApiConfigManagerProps> = ({
  isOpen,
  onClose,
  onApiConfigChange,
  currentApiConfigId,
}) => {
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<ApiConfig | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [testResults, setTestResults] = useState<Map<string, ApiTestResult>>(new Map());
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testingConfig, setTestingConfig] = useState<string | null>(null);
  const [selectionStrategy, setSelectionStrategy] = useState<ApiSelectionStrategy>({
    type: 'single',
    selectedConfigIds: []
  });
  const [showStrategySettings, setShowStrategySettings] = useState(false);

  const [newConfig, setNewConfig] = useState({
    name: '',
    apiKey: '',
    proxyUrl: '',
  });

  const iconSize = getResponsiveValue(14, 16);
  const buttonIconSize = getResponsiveValue(12, 14);

  // 预设的代理地址选项
  const presetProxyUrls = [
    { label: '直连Google (官方API)', value: '' },
    { label: 'API代理 (api-proxy.me)', value: 'https://api-proxy.me/gemini' },
    { label: '自定义地址', value: 'custom' },
  ];

  useEffect(() => {
    if (isOpen) {
      loadApiConfigs();
      loadSelectionStrategy();
      loadTestResults();
    }
  }, [isOpen]);

  const loadApiConfigs = () => {
    const configs = persistentStoreService.getApiConfigs();
    setApiConfigs(configs);
  };

  const loadSelectionStrategy = () => {
    const strategy = apiTestingService.getSelectionStrategy();
    setSelectionStrategy(strategy);
  };

  const loadTestResults = () => {
    const results = apiTestingService.getAllTestResults();
    const resultMap = new Map();
    results.forEach(result => {
      resultMap.set(result.configId, result);
    });
    setTestResults(resultMap);
  };

  const handleTestSingleConfig = async (config: ApiConfig) => {
    setTestingConfig(config.id);
    try {
      const result = await apiTestingService.testApiConfig(config);
      setTestResults(prev => new Map(prev.set(config.id, result)));
      
      // 更新配置的健康状态
      const updatedConfigs = apiConfigs.map(c => 
        c.id === config.id 
          ? { ...c, isHealthy: result.success, responseTime: result.responseTime, lastTested: result.timestamp }
          : c
      );
      setApiConfigs(updatedConfigs);
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setTestingConfig(null);
    }
  };

  const handleTestAllConfigs = async () => {
    setIsTestingAll(true);
    try {
      const results = await apiTestingService.testMultipleConfigs(apiConfigs);
      const resultMap = new Map();
      results.forEach(result => {
        resultMap.set(result.configId, result);
      });
      setTestResults(resultMap);

      // 更新所有配置的健康状态
      const updatedConfigs = apiConfigs.map(config => {
        const result = resultMap.get(config.id);
        return result 
          ? { ...config, isHealthy: result.success, responseTime: result.responseTime, lastTested: result.timestamp }
          : config;
      });
      setApiConfigs(updatedConfigs);
    } catch (error) {
      console.error('Batch test failed:', error);
    } finally {
      setIsTestingAll(false);
    }
  };

  const handleToggleConfigSelection = (configId: string) => {
    const newStrategy = { ...selectionStrategy };
    if (newStrategy.selectedConfigIds.includes(configId)) {
      newStrategy.selectedConfigIds = newStrategy.selectedConfigIds.filter(id => id !== configId);
    } else {
      newStrategy.selectedConfigIds.push(configId);
    }
    setSelectionStrategy(newStrategy);
    apiTestingService.setSelectionStrategy(newStrategy);
  };

  const handleStrategyChange = (newType: ApiSelectionStrategy['type']) => {
    const newStrategy = { ...selectionStrategy, type: newType };
    setSelectionStrategy(newStrategy);
    apiTestingService.setSelectionStrategy(newStrategy);
  };

  const handleSelectAllHealthy = () => {
    const healthyConfigs = apiConfigs.filter(config => {
      const result = testResults.get(config.id);
      return result && result.success;
    });
    
    const newStrategy = {
      ...selectionStrategy,
      selectedConfigIds: healthyConfigs.map(c => c.id)
    };
    setSelectionStrategy(newStrategy);
    apiTestingService.setSelectionStrategy(newStrategy);
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setNewConfig({
      name: '',
      apiKey: '',
      proxyUrl: '',
    });
  };

  const handleSaveNew = () => {
    if (!newConfig.name.trim() || !newConfig.apiKey.trim()) {
      alert('请填写配置名称和API密钥');
      return;
    }

    try {
      const apiProxyUrl = newConfig.proxyUrl === 'custom' ? '' : newConfig.proxyUrl;
      const savedConfig = persistentStoreService.addApiConfig({
        name: newConfig.name.trim(),
        apiKey: newConfig.apiKey.trim(),
        apiProxyUrl: apiProxyUrl || null,
        isDefault: false,
        isSelected: false
      });

      setApiConfigs(prev => [...prev, savedConfig]);
      setIsAddingNew(false);
      setNewConfig({ name: '', apiKey: '', proxyUrl: '' });
    } catch (error: any) {
      alert(error.message || '保存失败');
    }
  };

  const handleDelete = (configId: string) => {
    if (confirm('确定要删除这个API配置吗？')) {
      persistentStoreService.deleteApiConfig(configId);
      setApiConfigs(prev => prev.filter(c => c.id !== configId));
      
      // 从选择策略中移除
      const newStrategy = {
        ...selectionStrategy,
        selectedConfigIds: selectionStrategy.selectedConfigIds.filter(id => id !== configId)
      };
      setSelectionStrategy(newStrategy);
      apiTestingService.setSelectionStrategy(newStrategy);
    }
  };

  const handleSetDefault = (configId: string) => {
    persistentStoreService.setDefaultApiConfig(configId);
    setApiConfigs(prev => prev.map(c => ({ ...c, isDefault: c.id === configId })));
    onApiConfigChange(apiConfigs.find(c => c.id === configId) || null);
  };

  const getHealthIcon = (configId: string) => {
    const result = testResults.get(configId);
    if (!result) {
      return <Clock size={buttonIconSize} className="text-[var(--theme-text-tertiary)]" title="未测试" />;
    }
    
    if (result.success) {
      return <CheckCircle size={buttonIconSize} className="text-green-500" title={`健康 - ${result.responseTime}ms`} />;
    } else {
      return <AlertCircle size={buttonIconSize} className="text-red-500" title={`错误: ${result.error}`} />;
    }
  };

  const getConfigStatusColor = (config: ApiConfig) => {
    if (config.isDefault) return 'border-l-4 border-l-[var(--theme-text-link)]';
    if (selectionStrategy.selectedConfigIds.includes(config.id)) return 'border-l-4 border-l-green-500';
    return 'border-l-4 border-l-transparent';
  };

  const isNewApiFormat = (apiKey: string) => {
    return apiTestingService.isNewApiKeyFormat(apiKey);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-[var(--theme-bg-primary)] rounded-xl shadow-premium w-full max-w-4xl flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-[var(--theme-border-primary)]">
          <h2 className="text-xl font-semibold text-[var(--theme-text-primary)] flex items-center">
            <Settings size={iconSize} className="mr-2.5" />
            API配置管理
          </h2>
          <button onClick={onClose} className="text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]">
            <X size={iconSize} />
          </button>
        </div>

        <div className="flex-grow overflow-auto p-4">
          {/* 工具栏 */}
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={handleAddNew}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--theme-text-link)] text-white rounded hover:bg-[var(--theme-text-link-hover)] transition-colors"
            >
              <Plus size={buttonIconSize} />
              添加配置
            </button>
            
            <button
              onClick={handleTestAllConfigs}
              disabled={isTestingAll || apiConfigs.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] rounded hover:bg-[var(--theme-bg-input)] transition-colors disabled:opacity-50"
            >
              {isTestingAll ? (
                <RefreshCw size={buttonIconSize} className="animate-spin" />
              ) : (
                <Zap size={buttonIconSize} />
              )}
              测试所有
            </button>

            <button
              onClick={handleSelectAllHealthy}
              className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              <CheckCircle size={buttonIconSize} />
              选择健康配置
            </button>

            <button
              onClick={() => setShowStrategySettings(!showStrategySettings)}
              className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                showStrategySettings 
                  ? 'bg-[var(--theme-text-link)] text-white' 
                  : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-input)]'
              }`}
            >
              <Play size={buttonIconSize} />
              轮询设置
            </button>
          </div>

          {/* 轮询策略设置 */}
          {showStrategySettings && (
            <div className="mb-4 p-4 bg-[var(--theme-bg-secondary)] rounded-lg">
              <h3 className="text-sm font-semibold text-[var(--theme-text-primary)] mb-3">API轮询策略</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                {(['single', 'roundRobin', 'random', 'failover'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => handleStrategyChange(type)}
                    className={`p-2 text-sm rounded transition-colors ${
                      selectionStrategy.type === type
                        ? 'bg-[var(--theme-text-link)] text-white'
                        : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-input)]'
                    }`}
                  >
                    {{
                      single: '单一',
                      roundRobin: '轮询',
                      random: '随机',
                      failover: '故障转移'
                    }[type]}
                  </button>
                ))}
              </div>
              
              <div className="text-xs text-[var(--theme-text-secondary)]">
                已选择 {selectionStrategy.selectedConfigIds.length} 个配置用于轮询
              </div>
            </div>
          )}

          {/* API配置列表 */}
          <div className="space-y-3">
            {apiConfigs.map((config) => (
              <div
                key={config.id}
                className={`p-4 bg-[var(--theme-bg-secondary)] rounded-lg ${getConfigStatusColor(config)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        type="checkbox"
                        checked={selectionStrategy.selectedConfigIds.includes(config.id)}
                        onChange={() => handleToggleConfigSelection(config.id)}
                        className="w-4 h-4"
                      />
                      
                      <h4 className="font-semibold text-[var(--theme-text-primary)]">
                        {config.name}
                        {config.isDefault && (
                          <span className="ml-2 text-xs bg-[var(--theme-text-link)] text-white px-2 py-1 rounded">
                            默认
                          </span>
                        )}
                        {isNewApiFormat(config.apiKey) && (
                          <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                            NewAPI
                          </span>
                        )}
                      </h4>
                      
                      {getHealthIcon(config.id)}
                    </div>
                    
                    <div className="text-sm text-[var(--theme-text-secondary)] space-y-1">
                      <div>API密钥: {config.apiKey.substring(0, 12)}...</div>
                      <div>代理地址: {config.apiProxyUrl || '直连'}</div>
                      {testResults.get(config.id) && (
                        <div className="text-xs">
                          最后测试: {testResults.get(config.id)!.timestamp.toLocaleString()}
                          {testResults.get(config.id)!.success && (
                            <span className="ml-2">响应时间: {testResults.get(config.id)!.responseTime}ms</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTestSingleConfig(config)}
                      disabled={testingConfig === config.id}
                      className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-input)] rounded transition-colors disabled:opacity-50"
                      title="测试连接"
                    >
                      {testingConfig === config.id ? (
                        <RefreshCw size={buttonIconSize} className="animate-spin" />
                      ) : (
                        <Zap size={buttonIconSize} />
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleSetDefault(config.id)}
                      className={`p-2 rounded transition-colors ${
                        config.isDefault
                          ? 'text-yellow-500'
                          : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-input)]'
                      }`}
                      title="设为默认"
                    >
                      {config.isDefault ? <Star size={buttonIconSize} /> : <StarOff size={buttonIconSize} />}
                    </button>
                    
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="p-2 text-[var(--theme-text-secondary)] hover:text-red-500 hover:bg-[var(--theme-bg-input)] rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 size={buttonIconSize} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 添加新配置表单 */}
          {isAddingNew && (
            <div className="mt-4 p-4 bg-[var(--theme-bg-secondary)] rounded-lg border border-[var(--theme-border-primary)]">
              <h3 className="text-lg font-semibold text-[var(--theme-text-primary)] mb-3">添加新配置</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">配置名称</label>
                  <input
                    type="text"
                    value={newConfig.name}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-[var(--theme-bg-input)] border border-[var(--theme-border-primary)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--theme-text-link)]"
                    placeholder="例如：我的API配置"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">API密钥</label>
                  <input
                    type="password"
                    value={newConfig.apiKey}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    className="w-full px-3 py-2 bg-[var(--theme-bg-input)] border border-[var(--theme-border-primary)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--theme-text-link)]"
                    placeholder="sk-..."
                  />
                  {newConfig.apiKey && isNewApiFormat(newConfig.apiKey) && (
                    <div className="mt-1 text-xs text-blue-500">✓ 检测到NewAPI格式密钥</div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">代理地址</label>
                  <select
                    value={newConfig.proxyUrl}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, proxyUrl: e.target.value }))}
                    className="w-full px-3 py-2 bg-[var(--theme-bg-input)] border border-[var(--theme-border-primary)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--theme-text-link)]"
                  >
                    {presetProxyUrls.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveNew}
                    className="px-4 py-2 bg-[var(--theme-text-link)] text-white rounded hover:bg-[var(--theme-text-link-hover)] transition-colors"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setIsAddingNew(false)}
                    className="px-4 py-2 bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] rounded hover:bg-[var(--theme-bg-input)] transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
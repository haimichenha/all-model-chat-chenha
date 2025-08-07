import React, { useState, useEffect } from 'react';
import { Plus, Settings, TestTube, CheckCircle, XCircle, Clock, Loader2, Trash2, Edit3, Download, Upload } from 'lucide-react';
import { apiTestingService, ApiConfiguration, ApiTestResult } from '../services/apiTestingService';
import { apiRotationService } from '../services/apiRotationService';
import { persistentStoreService } from '../services/persistentStoreService';
import { logService } from '../services/logService';
import { TAB_CYCLE_MODELS } from '../constants/appConstants';
import { ModelOption, ApiConfig } from '../types';
import { 
  apiConfigsToApiConfigurations, 
  isValidApiConfig,
  getApiConfigDisplayInfo 
} from '../utils/apiConfigUtils';

interface ApiManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: string) => string;
  availableModels?: ModelOption[];
}

export const ApiManagementModal: React.FC<ApiManagementModalProps> = ({
  isOpen,
  onClose,
  t,
  availableModels = []
}) => {
  const [apiConfigs, setApiConfigs] = useState<ApiConfiguration[]>([]);
  const [testResults, setTestResults] = useState<Map<string, ApiTestResult>>(new Map());
  const [isTesting, setIsTesting] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ApiConfiguration | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [rotationSettings, setRotationSettings] = useState(apiRotationService.getSettings());
  
  // New state for managing existing app settings
  const [existingApiConfigs, setExistingApiConfigs] = useState<ApiConfig[]>([]);
  const [showImportSection, setShowImportSection] = useState(true);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());

  // Load existing configurations
  useEffect(() => {
    if (isOpen) {
      // Load current API rotation configurations
      setApiConfigs(apiRotationService.getApiConfigurations());
      
      // Load existing API configurations from app settings
      const allAppApiConfigs = persistentStoreService.getAllApiConfigs();
      const validAppApiConfigs = allAppApiConfigs.filter(isValidApiConfig);
      setExistingApiConfigs(validAppApiConfigs);
      
      // Clear previous selections
      setSelectedImportIds(new Set());
    }
  }, [isOpen]);

  const handleAddConfig = (config: Omit<ApiConfiguration, 'id'>) => {
    const newConfig: ApiConfiguration = {
      ...config,
      id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    apiRotationService.addApiConfiguration(newConfig);
    setApiConfigs(apiRotationService.getApiConfigurations());
    setShowAddForm(false);
  };

  const handleEditConfig = (config: ApiConfiguration) => {
    apiRotationService.removeApiConfiguration(config.id);
    apiRotationService.addApiConfiguration(config);
    setApiConfigs(apiRotationService.getApiConfigurations());
    setEditingConfig(null);
  };

  const handleDeleteConfig = (id: string) => {
    if (confirm('确定要删除这个 API 配置吗？')) {
      apiRotationService.removeApiConfiguration(id);
      setApiConfigs(apiRotationService.getApiConfigurations());
      setTestResults(prev => {
        const newResults = new Map(prev);
        newResults.delete(id);
        return newResults;
      });
    }
  };

  const handleToggleSelection = (id: string, isSelected: boolean) => {
    apiRotationService.updateApiSelection(id, isSelected);
    setApiConfigs(apiRotationService.getApiConfigurations());
  };

  const handleTestSingle = async (config: ApiConfiguration) => {
    setIsTesting(true);
    try {
      const result = await apiTestingService.testApiConnection(
        config.apiKey,
        config.modelId || 'gemini-pro',
        config.endpoint
      );
      
      setTestResults(prev => new Map(prev).set(config.id, result));
    } catch (error) {
      logService.error('API test failed:', error);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestAll = async () => {
    setIsTesting(true);
    try {
      const results = await apiTestingService.testMultipleApis(apiConfigs);
      setTestResults(results);
    } catch (error) {
      logService.error('API testing failed:', error);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveRotationSettings = () => {
    apiRotationService.updateSettings(rotationSettings);
    alert('轮询设置已保存');
  };

  const handleImportSelected = () => {
    if (selectedImportIds.size === 0) {
      alert('请选择要导入的API配置');
      return;
    }

    const selectedConfigs = existingApiConfigs.filter(config => selectedImportIds.has(config.id));
    const importedApiConfigurations = apiConfigsToApiConfigurations(
      selectedConfigs, 
      'gemini-2.5-flash',
      Array.from(selectedImportIds) // Mark all imported as selected
    );

    // Add all imported configurations to rotation service
    importedApiConfigurations.forEach(config => {
      // Check if already exists
      const existing = apiConfigs.find(existing => existing.id === config.id);
      if (!existing) {
        apiRotationService.addApiConfiguration(config);
      } else {
        // Update existing configuration
        apiRotationService.removeApiConfiguration(config.id);
        apiRotationService.addApiConfiguration(config);
      }
    });

    // Refresh the list
    setApiConfigs(apiRotationService.getApiConfigurations());
    setSelectedImportIds(new Set());
    
    logService.info(`Imported ${importedApiConfigurations.length} API configurations from app settings`);
    alert(`成功导入 ${importedApiConfigurations.length} 个API配置`);
  };

  const handleToggleImportSelection = (configId: string) => {
    const newSelected = new Set(selectedImportIds);
    if (newSelected.has(configId)) {
      newSelected.delete(configId);
    } else {
      newSelected.add(configId);
    }
    setSelectedImportIds(newSelected);
  };

  const handleSelectAllImport = () => {
    if (selectedImportIds.size === existingApiConfigs.length) {
      setSelectedImportIds(new Set());
    } else {
      setSelectedImportIds(new Set(existingApiConfigs.map(config => config.id)));
    }
  };

  const getStatusIcon = (config: ApiConfiguration) => {
    const result = testResults.get(config.id);
    if (!result) return <Clock size={16} className="text-gray-400" />;
    
    if (result.success) {
      return <CheckCircle size={16} className="text-green-500" />;
    } else {
      return <XCircle size={16} className="text-red-500" />;
    }
  };

  const getStatusText = (config: ApiConfiguration) => {
    const result = testResults.get(config.id);
    if (!result) return '未测试';
    
    if (result.success) {
      return `成功 (${result.responseTime}ms)`;
    } else {
      return `失败: ${result.error}`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              API 管理与测试
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex">
          
          {/* Sidebar - Rotation Settings */}
          <div className="w-80 p-4 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <h3 className="text-lg font-medium mb-4">轮询设置</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">轮询模式</label>
                <select
                  value={rotationSettings.mode}
                  onChange={(e) => setRotationSettings(prev => ({ 
                    ...prev, 
                    mode: e.target.value as any 
                  }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                >
                  <option value="round-robin">轮询 (Round Robin)</option>
                  <option value="random">随机选择</option>
                  <option value="priority">按优先级</option>
                </select>
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={rotationSettings.enableFailover}
                    onChange={(e) => setRotationSettings(prev => ({ 
                      ...prev, 
                      enableFailover: e.target.checked 
                    }))}
                  />
                  <span className="text-sm">启用故障转移</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">最大重试次数</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={rotationSettings.maxRetries}
                  onChange={(e) => setRotationSettings(prev => ({ 
                    ...prev, 
                    maxRetries: parseInt(e.target.value) 
                  }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                />
              </div>

              <button
                onClick={handleSaveRotationSettings}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
              >
                保存设置
              </button>
            </div>

            {/* Statistics */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium mb-2">统计信息</h4>
              <div className="text-xs space-y-1">
                <div>总计: {apiConfigs.length} 个 API</div>
                <div>已选择: {apiConfigs.filter(c => c.isSelected).length} 个</div>
                <div>可用: {apiRotationService.getStatistics().healthyApis} 个</div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
            
            {/* Import from App Settings Section */}
            {existingApiConfigs.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Download size={18} />
                    从应用设置导入API配置
                  </h3>
                  <button
                    onClick={() => setShowImportSection(!showImportSection)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {showImportSection ? '隐藏' : '显示'}
                  </button>
                </div>
                
                {showImportSection && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                      从您的应用设置中选择已配置的API进行导入，然后可以进行连通性测试和轮询设置。
                    </p>
                    
                    {/* Select All / Import Actions */}
                    <div className="flex gap-3 mb-3">
                      <button
                        onClick={handleSelectAllImport}
                        className="text-sm bg-blue-100 text-blue-700 py-1 px-3 rounded hover:bg-blue-200"
                      >
                        {selectedImportIds.size === existingApiConfigs.length ? '取消全选' : '全选'}
                      </button>
                      <button
                        onClick={handleImportSelected}
                        disabled={selectedImportIds.size === 0}
                        className="text-sm bg-blue-600 text-white py-1 px-3 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        导入所选 ({selectedImportIds.size})
                      </button>
                    </div>
                    
                    {/* Available Configurations */}
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {existingApiConfigs.map((config) => {
                        const displayInfo = getApiConfigDisplayInfo(config);
                        const isSelected = selectedImportIds.has(config.id);
                        const isAlreadyImported = apiConfigs.some(existing => existing.id === config.id);
                        
                        return (
                          <div 
                            key={config.id} 
                            className={`flex items-center space-x-3 p-2 rounded border ${
                              isSelected 
                                ? 'bg-blue-100 border-blue-300' 
                                : 'bg-white border-gray-200'
                            } ${isAlreadyImported ? 'opacity-60' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleImportSelection(config.id)}
                              disabled={isAlreadyImported}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{displayInfo.name}</span>
                                {config.isDefault && (
                                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                    默认
                                  </span>
                                )}
                                {isAlreadyImported && (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                    已导入
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                {displayInfo.keyPreview}
                                {displayInfo.endpoint && (
                                  <span className="ml-2 text-blue-500">
                                    ({new URL(displayInfo.endpoint).hostname})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 flex items-center gap-2"
              >
                <Plus size={16} />
                手动添加API
              </button>
              
              <button
                onClick={handleTestAll}
                disabled={isTesting || apiConfigs.length === 0}
                className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isTesting ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
                测试所有已选API
              </button>
            </div>

            {/* API Configurations List */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                当前轮询配置 ({apiConfigs.length})
              </h3>
              
              {apiConfigs.map((config) => {
                const displayInfo = getApiConfigDisplayInfo(config);
                
                return (
                  <div key={config.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={config.isSelected}
                          onChange={(e) => handleToggleSelection(config.id, e.target.checked)}
                        />
                        <div>
                          <h4 className="font-medium flex items-center gap-2">
                            {displayInfo.name}
                            {displayInfo.isProxy && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                代理
                              </span>
                            )}
                          </h4>
                          <p className="text-sm text-gray-500">
                            {displayInfo.keyPreview} | {config.modelId}
                            {displayInfo.endpoint && (
                              <span className="ml-2 text-blue-500">
                                ({new URL(displayInfo.endpoint).hostname})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(config)}
                          <span className="text-sm">{getStatusText(config)}</span>
                        </div>
                        
                        <button
                          onClick={() => handleTestSingle(config)}
                          disabled={isTesting}
                          className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          title="测试此API"
                        >
                          <TestTube size={16} />
                        </button>
                        
                        <button
                          onClick={() => setEditingConfig(config)}
                          className="text-gray-600 hover:text-gray-800"
                          title="编辑配置"
                        >
                          <Edit3 size={16} />
                        </button>
                        
                        <button
                          onClick={() => handleDeleteConfig(config.id)}
                          className="text-red-600 hover:text-red-800"
                          title="删除配置"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {apiConfigs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {existingApiConfigs.length > 0 
                    ? '暂无API配置，请从上方导入现有配置或手动添加'
                    : '暂无API配置，请先在应用设置中配置API或手动添加'
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {(showAddForm || editingConfig) && (
        <ApiConfigForm
          config={editingConfig}
          onSave={editingConfig ? handleEditConfig : handleAddConfig}
          onCancel={() => {
            setShowAddForm(false);
            setEditingConfig(null);
          }}
          availableModels={availableModels}
        />
      )}
    </div>
  );
};

// API Configuration Form Component
interface ApiConfigFormProps {
  config?: ApiConfiguration | null;
  onSave: (config: ApiConfiguration | Omit<ApiConfiguration, 'id'>) => void;
  onCancel: () => void;
  availableModels?: ModelOption[];
}

const ApiConfigForm: React.FC<ApiConfigFormProps> = ({ config, onSave, onCancel, availableModels = [] }) => {
  const [formData, setFormData] = useState({
    name: config?.name || '',
    apiKey: config?.apiKey || '',
    endpoint: config?.endpoint || '',
    modelId: config?.modelId || 'gemini-2.5-flash',
    customModelId: '',
    isSelected: config?.isSelected || false
  });

  // If the current modelId is not in available models, treat it as custom
  useEffect(() => {
    if (config?.modelId) {
      const isModelInList = availableModels.some(model => model.id === config.modelId) || 
                           TAB_CYCLE_MODELS.includes(config.modelId);
      if (!isModelInList) {
        setFormData(prev => ({
          ...prev,
          modelId: 'custom',
          customModelId: config.modelId
        }));
      }
    }
  }, [config?.modelId, availableModels]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.apiKey.trim()) {
      alert('请填写必要信息');
      return;
    }

    // Use custom model ID if selected, otherwise use the selected standard model
    const finalModelId = formData.modelId === 'custom' 
      ? (formData.customModelId.trim() || 'gemini-pro')
      : formData.modelId;

    const finalData = {
      ...formData,
      modelId: finalModelId
    };

    if (config) {
      onSave({ ...config, ...finalData });
    } else {
      onSave(finalData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-60 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">
          {config ? '编辑 API 配置' : '手动添加 API 配置'}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">名称 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              placeholder="例: Google Gemini"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">API 密钥 *</label>
            <input
              type="text"
              value={formData.apiKey}
              onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              placeholder="AIza... 或 sk-..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">自定义端点 (可选)</label>
            <input
              type="url"
              value={formData.endpoint}
              onChange={(e) => setFormData(prev => ({ ...prev, endpoint: e.target.value }))}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              placeholder="https://api.example.com/v1"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">模型 ID</label>
            <div className="relative">
              <select
                value={formData.modelId}
                onChange={(e) => setFormData(prev => ({ ...prev, modelId: e.target.value }))}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 appearance-none pr-8"
                aria-label="选择 AI 模型"
              >
                {/* 固定内置模型 */}
                <optgroup label="内置模型">
                  {TAB_CYCLE_MODELS.map((modelId) => {
                    const name = modelId.includes('/') 
                      ? `Gemini ${modelId.split('/')[1]}`.replace('gemini-','').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                      : `Gemini ${modelId.replace('gemini-','').replace(/-/g, ' ')}`.replace(/\b\w/g, l => l.toUpperCase());
                    return (
                      <option key={modelId} value={modelId}>
                        {name}
                      </option>
                    );
                  })}
                </optgroup>
                
                {/* 可用模型 */}
                {availableModels.length > 0 && (
                  <optgroup label="可用模型">
                    {availableModels
                      .filter(model => !TAB_CYCLE_MODELS.includes(model.id))
                      .map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))
                    }
                  </optgroup>
                )}
                
                {/* 自定义模型选项 */}
                <option value="custom">自定义模型...</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M5.516 7.548c.436-.446 1.043-.48 1.576 0L10 10.405l2.908-2.857c.533-.48 1.14-.446 1.576 0 .436.445.408 1.197 0 1.615l-3.695 3.63c-.533.48-1.14.446-1.576 0L5.516 9.163c-.408-.418-.436-1.17 0-1.615z"/>
                </svg>
              </div>
            </div>
            {formData.modelId === 'custom' && (
              <input
                type="text"
                value={formData.customModelId || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, customModelId: e.target.value }))}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 mt-2"
                placeholder="请输入自定义模型ID，如：gemini-pro"
              />
            )}
          </div>
          
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.isSelected}
                onChange={(e) => setFormData(prev => ({ ...prev, isSelected: e.target.checked }))}
              />
              <span className="text-sm">启用此配置</span>
            </label>
          </div>
          
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
            >
              保存
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
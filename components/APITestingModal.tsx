import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, CheckCircle, XCircle, Clock, RotateCw, Settings, Zap, Shuffle } from 'lucide-react';
import { Modal } from './shared/Modal';
import { ApiConfig } from '../types';
import { apiTestingService, APITestingService } from '../services/apiTestingService';
import { translations, getResponsiveValue } from '../utils/appUtils';

interface APITestResult {
  configId: string;
  configName: string;
  success: boolean;
  responseTime?: number;
  error?: string;
  statusCode?: number;
  model?: string;
}

interface APITestingModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiConfigs: ApiConfig[];
  currentApiConfigId?: string;
  onSelectConfig?: (configId: string) => void;
  t: (key: keyof typeof translations, fallback?: string) => string;
}

export const APITestingModal: React.FC<APITestingModalProps> = ({
  isOpen,
  onClose,
  apiConfigs,
  currentApiConfigId,
  onSelectConfig,
  t
}) => {
  const [testResults, setTestResults] = useState<APITestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testingConfigId, setTestingConfigId] = useState<string | null>(null);
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationMode, setRotationMode] = useState<'round-robin' | 'random'>('round-robin');
  const [selectedForRotation, setSelectedForRotation] = useState<Set<string>>(new Set());
  const [newApiKey, setNewApiKey] = useState('');
  const [newApiUrl, setNewApiUrl] = useState('');
  const [isValidatingNewApi, setIsValidatingNewApi] = useState(false);
  const [newApiValidation, setNewApiValidation] = useState<{ valid: boolean; error?: string; models?: string[] } | null>(null);

  const headingIconSize = getResponsiveValue(20, 24);
  const buttonIconSize = getResponsiveValue(16, 18);

  // Initialize rotation settings
  useEffect(() => {
    const rotationStatus = apiTestingService.getRotationStatus();
    setRotationEnabled(rotationStatus.isActive);
    setRotationMode(rotationStatus.rotationMode);
    setSelectedForRotation(new Set(rotationStatus.selectedConfigs));
  }, [isOpen]);

  // Test a single API configuration
  const testSingleConfig = useCallback(async (config: ApiConfig) => {
    setTestingConfigId(config.id);
    try {
      const result = await apiTestingService.testAPIConfig(config);
      setTestResults(prev => {
        const newResults = prev.filter(r => r.configId !== config.id);
        return [...newResults, result].sort((a, b) => a.configName.localeCompare(b.configName));
      });
    } finally {
      setTestingConfigId(null);
    }
  }, []);

  // Test all configurations
  const testAllConfigs = useCallback(async () => {
    if (apiConfigs.length === 0) return;
    
    setIsTesting(true);
    setTestResults([]);
    
    try {
      const results = await apiTestingService.testMultipleConfigs(apiConfigs);
      setTestResults(results.sort((a, b) => a.configName.localeCompare(b.configName)));
    } finally {
      setIsTesting(false);
    }
  }, [apiConfigs]);

  // Handle rotation toggle
  const handleRotationToggle = useCallback((enabled: boolean) => {
    setRotationEnabled(enabled);
    
    if (enabled && selectedForRotation.size > 1) {
      const selectedConfigs = apiConfigs.filter(config => selectedForRotation.has(config.id));
      apiTestingService.setupRotation(selectedConfigs, rotationMode);
    } else {
      apiTestingService.disableRotation();
    }
  }, [selectedForRotation, rotationMode, apiConfigs]);

  // Handle rotation mode change
  const handleRotationModeChange = useCallback((mode: 'round-robin' | 'random') => {
    setRotationMode(mode);
    apiTestingService.setRotationMode(mode);
  }, []);

  // Handle config selection for rotation
  const handleConfigSelectionToggle = useCallback((configId: string) => {
    setSelectedForRotation(prev => {
      const newSet = new Set(prev);
      if (newSet.has(configId)) {
        newSet.delete(configId);
      } else {
        newSet.add(configId);
      }
      return newSet;
    });
  }, []);

  // Validate NewAPI key
  const validateNewApiKey = useCallback(async () => {
    if (!newApiKey.trim()) return;
    
    setIsValidatingNewApi(true);
    setNewApiValidation(null);
    
    try {
      const result = await apiTestingService.testNewAPIKey(newApiKey.trim(), newApiUrl.trim() || undefined);
      setNewApiValidation(result);
    } finally {
      setIsValidatingNewApi(false);
    }
  }, [newApiKey, newApiUrl]);

  // Format response time
  const formatResponseTime = (ms?: number) => {
    if (!ms) return 'N/A';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  // Get result icon
  const getResultIcon = (result: APITestResult) => {
    if (result.success) {
      return <CheckCircle size={16} className="text-green-500" />;
    } else {
      return <XCircle size={16} className="text-red-500" />;
    }
  };

  // Get result status color
  const getResultColor = (result: APITestResult) => {
    if (result.success) {
      return 'text-green-600 dark:text-green-400';
    } else {
      return 'text-red-600 dark:text-red-400';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-[var(--theme-bg-primary)] rounded-xl shadow-premium w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-[var(--theme-border-primary)]">
          <h2 className="text-xl font-semibold text-[var(--theme-text-link)] flex items-center">
            <Wifi size={headingIconSize} className="mr-2.5" />
            API 连接测试与轮询管理
          </h2>
          <button 
            onClick={onClose} 
            className="text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)] transition-colors p-1 rounded-full" 
          >
            <XCircle size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* API Testing Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-[var(--theme-text-primary)]">连接测试</h3>
              <button
                onClick={testAllConfigs}
                disabled={isTesting || apiConfigs.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isTesting ? (
                  <Clock size={buttonIconSize} className="animate-spin" />
                ) : (
                  <Zap size={buttonIconSize} />
                )}
                测试所有 API
              </button>
            </div>

            {/* API Configurations List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {apiConfigs.length === 0 ? (
                <div className="text-center py-8 text-[var(--theme-text-tertiary)]">
                  <WifiOff size={32} className="mx-auto mb-2 opacity-50" />
                  <p>未配置 API 连接</p>
                </div>
              ) : (
                apiConfigs.map(config => {
                  const result = testResults.find(r => r.configId === config.id);
                  const isCurrentlyTesting = testingConfigId === config.id;
                  const isSelected = selectedForRotation.has(config.id);
                  const isCurrent = currentApiConfigId === config.id;
                  
                  return (
                    <div
                      key={config.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isCurrent 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                          : 'border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {/* Selection checkbox for rotation */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleConfigSelectionToggle(config.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--theme-text-primary)] truncate">
                              {config.name}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                                当前
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-[var(--theme-text-tertiary)] truncate">
                            {config.apiProxyUrl || '默认端点'} • {config.apiKey.substring(0, 10)}...
                          </div>
                        </div>

                        {/* Test Result */}
                        <div className="flex items-center gap-2 text-sm">
                          {isCurrentlyTesting ? (
                            <Clock size={16} className="animate-spin text-blue-500" />
                          ) : result ? (
                            <>
                              {getResultIcon(result)}
                              <span className={getResultColor(result)}>
                                {result.success ? '连接成功' : '连接失败'}
                              </span>
                              {result.responseTime && (
                                <span className="text-[var(--theme-text-tertiary)]">
                                  {formatResponseTime(result.responseTime)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[var(--theme-text-tertiary)]">未测试</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => testSingleConfig(config)}
                          disabled={isCurrentlyTesting}
                          className="p-1 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-link)] transition-colors"
                          title="测试此 API"
                        >
                          <RotateCw size={14} />
                        </button>
                        {onSelectConfig && (
                          <button
                            onClick={() => onSelectConfig(config.id)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          >
                            使用
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Test Results Summary */}
            {testResults.length > 0 && (
              <div className="mt-4 p-3 bg-[var(--theme-bg-secondary)] rounded-lg">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>成功连接:</span>
                    <span className="text-green-600 dark:text-green-400">
                      {testResults.filter(r => r.success).length}/{testResults.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>平均响应时间:</span>
                    <span>
                      {formatResponseTime(
                        testResults
                          .filter(r => r.success && r.responseTime)
                          .reduce((acc, r) => acc + (r.responseTime || 0), 0) / 
                        testResults.filter(r => r.success && r.responseTime).length || 0
                      )}
                    </span>
                  </div>
                </div>
                
                {/* Failed connections */}
                {testResults.filter(r => !r.success).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--theme-border-secondary)]">
                    <p className="text-xs text-red-600 dark:text-red-400 mb-1">连接失败的配置:</p>
                    {testResults.filter(r => !r.success).map(result => (
                      <div key={result.configId} className="text-xs text-[var(--theme-text-tertiary)] pl-2">
                        • {result.configName}: {result.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* API Rotation Section */}
          <div className="border-t border-[var(--theme-border-primary)] pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-[var(--theme-text-primary)]">API 轮询</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rotationEnabled}
                  onChange={(e) => handleRotationToggle(e.target.checked)}
                  disabled={selectedForRotation.size < 2}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-[var(--theme-text-primary)]">启用轮询</span>
              </label>
            </div>

            <div className="space-y-4">
              {/* Rotation Mode */}
              <div>
                <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-2">
                  轮询模式
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rotationMode"
                      value="round-robin"
                      checked={rotationMode === 'round-robin'}
                      onChange={() => handleRotationModeChange('round-robin')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <Settings size={16} />
                    <span className="text-sm">轮流使用</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rotationMode"
                      value="random"
                      checked={rotationMode === 'random'}
                      onChange={() => handleRotationModeChange('random')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <Shuffle size={16} />
                    <span className="text-sm">随机选择</span>
                  </label>
                </div>
              </div>

              {/* Selection Info */}
              <div className="bg-[var(--theme-bg-secondary)] p-3 rounded-lg">
                <p className="text-sm text-[var(--theme-text-primary)]">
                  已选择 {selectedForRotation.size} 个配置用于轮询
                  {selectedForRotation.size < 2 && (
                    <span className="text-yellow-600 dark:text-yellow-400 ml-2">
                      (至少需要选择 2 个配置)
                    </span>
                  )}
                </p>
                {selectedForRotation.size > 0 && (
                  <p className="text-xs text-[var(--theme-text-tertiary)] mt-1">
                    勾选上方配置列表中的复选框来选择参与轮询的 API 配置
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* NewAPI Key Validation Section */}
          <div className="border-t border-[var(--theme-border-primary)] pt-6">
            <h3 className="text-lg font-medium text-[var(--theme-text-primary)] mb-4">
              NewAPI 密钥验证
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">
                  API 密钥 (sk-xxxxx 格式)
                </label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-1cH2udT3NZX7J3LkKA3SJaEetqZBgsbF6k6ZZlqC1wXIEp3B"
                  className="w-full px-3 py-2 border border-[var(--theme-border-primary)] rounded-md bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">
                  API 基础 URL (可选)
                </label>
                <input
                  type="url"
                  value={newApiUrl}
                  onChange={(e) => setNewApiUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 border border-[var(--theme-border-primary)] rounded-md bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={validateNewApiKey}
                disabled={!newApiKey.trim() || isValidatingNewApi}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isValidatingNewApi ? (
                  <Clock size={buttonIconSize} className="animate-spin" />
                ) : (
                  <CheckCircle size={buttonIconSize} />
                )}
                验证密钥
              </button>

              {/* Validation Result */}
              {newApiValidation && (
                <div className={`p-3 rounded-lg ${
                  newApiValidation.valid 
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {newApiValidation.valid ? (
                      <CheckCircle size={16} className="text-green-500" />
                    ) : (
                      <XCircle size={16} className="text-red-500" />
                    )}
                    <span className={`font-medium ${
                      newApiValidation.valid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                    }`}>
                      {newApiValidation.valid ? 'NewAPI 密钥有效' : 'NewAPI 密钥无效'}
                    </span>
                  </div>
                  
                  {newApiValidation.error && (
                    <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                      错误: {newApiValidation.error}
                    </p>
                  )}
                  
                  {newApiValidation.models && newApiValidation.models.length > 0 && (
                    <div className="text-sm">
                      <p className="text-green-700 dark:text-green-300 mb-1">
                        可用模型 ({newApiValidation.models.length} 个):
                      </p>
                      <p className="text-green-600 dark:text-green-400 text-xs font-mono">
                        {newApiValidation.models.slice(0, 5).join(', ')}
                        {newApiValidation.models.length > 5 && '...'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
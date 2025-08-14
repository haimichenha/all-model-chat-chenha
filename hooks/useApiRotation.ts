import { useCallback, useEffect, useState } from 'react';
import { ApiConfig, AppSettings } from '../types';
import { apiTestingService, ApiSelectionStrategy } from '../services/apiTestingService';
import { persistentStoreService } from '../services/persistentStoreService';
import { geminiServiceInstance } from '../services/geminiService';
import { logService } from '../services/logService';

export interface UseApiRotationOptions {
  enableRotation?: boolean;
  autoTestOnMount?: boolean;
}

export const useApiRotation = (
  baseAppSettings: AppSettings, 
  options: UseApiRotationOptions = {}
) => {
  const { enableRotation = false, autoTestOnMount = false } = options;
  
  const [availableConfigs, setAvailableConfigs] = useState<ApiConfig[]>([]);
  const [currentApiConfig, setCurrentApiConfig] = useState<ApiConfig | null>(null);
  const [rotationStats, setRotationStats] = useState({
    totalRequests: 0,
    successfulRequests: 0,
    lastRotation: null as Date | null,
    currentConfigId: null as string | null
  });

  // 加载可用的API配置
  const loadAvailableConfigs = useCallback(() => {
    const allConfigs = persistentStoreService.getApiConfigs();
    const strategy = apiTestingService.getSelectionStrategy();
    
    // 只使用策略中选择的配置
    const selectedConfigs = allConfigs.filter(config => 
      strategy.selectedConfigIds.includes(config.id)
    );
    
    setAvailableConfigs(selectedConfigs);
    logService.info(`Loaded ${selectedConfigs.length} API configs for rotation`);
  }, []);

  // 选择下一个API配置
  const selectNextApiConfig = useCallback((): ApiConfig | null => {
    if (!enableRotation || availableConfigs.length === 0) {
      // 如果未启用轮询或没有可用配置，使用当前设置中的配置
      const currentConfigId = persistentStoreService.getLastSelectedApiConfigId();
      const currentConfig = persistentStoreService.getApiConfigById(currentConfigId);
      return currentConfig || persistentStoreService.getDefaultApiConfig() || null;
    }

    const nextConfig = apiTestingService.selectNextApiConfig(availableConfigs);
    
    if (nextConfig) {
      setCurrentApiConfig(nextConfig);
      setRotationStats(prev => ({
        ...prev,
        lastRotation: new Date(),
        currentConfigId: nextConfig.id
      }));
      
      logService.info(`Selected API config for rotation: ${nextConfig.name} (${nextConfig.id})`);
    }
    
    return nextConfig;
  }, [enableRotation, availableConfigs]);

  // 创建带有轮询配置的AppSettings
  const createRotatedAppSettings = useCallback((selectedConfig?: ApiConfig): AppSettings => {
    const configToUse = selectedConfig || selectNextApiConfig();
    
    if (!configToUse) {
      logService.warn('No API config available for rotation, using base settings');
      return baseAppSettings;
    }

    return {
      ...baseAppSettings,
      apiKey: configToUse.apiKey,
      apiProxyUrl: configToUse.apiProxyUrl || ''
    };
  }, [baseAppSettings, selectNextApiConfig]);

  // 执行API请求并处理轮询
  const executeWithRotation = useCallback(async <T>(
    apiCall: (settings: AppSettings) => Promise<T>
  ): Promise<T> => {
    const selectedConfig = selectNextApiConfig();
    
    if (!selectedConfig) {
      throw new Error('No API configuration available');
    }

    const rotatedSettings = createRotatedAppSettings(selectedConfig);
    
    // 更新Gemini服务的设置
    geminiServiceInstance.updateSettings(rotatedSettings);
    
    setRotationStats(prev => ({
      ...prev,
      totalRequests: prev.totalRequests + 1
    }));

    try {
      const result = await apiCall(rotatedSettings);
      
      setRotationStats(prev => ({
        ...prev,
        successfulRequests: prev.successfulRequests + 1
      }));
      
      // 标记配置为健康状态
      const testResult = apiTestingService.getTestResult(selectedConfig.id);
      if (!testResult || !testResult.success) {
        // 更新测试结果为成功
        apiTestingService['testResults'].set(selectedConfig.id, {
          configId: selectedConfig.id,
          success: true,
          responseTime: 1000, // 估算值
          timestamp: new Date()
        });
      }
      
      return result;
    } catch (error) {
      logService.error(`API request failed with config ${selectedConfig.name}:`, error);
      
      // 标记配置为不健康状态
      apiTestingService['testResults'].set(selectedConfig.id, {
        configId: selectedConfig.id,
        success: false,
        responseTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
      
      throw error;
    }
  }, [selectNextApiConfig, createRotatedAppSettings]);

  // 更新轮询策略
  const updateRotationStrategy = useCallback((strategy: ApiSelectionStrategy) => {
    apiTestingService.setSelectionStrategy(strategy);
    loadAvailableConfigs();
  }, [loadAvailableConfigs]);

  // 获取轮询统计信息
  const getRotationStats = useCallback(() => {
    return {
      ...rotationStats,
      availableConfigsCount: availableConfigs.length,
      isRotationEnabled: enableRotation,
      currentStrategy: apiTestingService.getSelectionStrategy()
    };
  }, [rotationStats, availableConfigs.length, enableRotation]);

  // 重置轮询统计
  const resetRotationStats = useCallback(() => {
    setRotationStats({
      totalRequests: 0,
      successfulRequests: 0,
      lastRotation: null,
      currentConfigId: null
    });
  }, []);

  // 测试所有选中的配置
  const testSelectedConfigs = useCallback(async () => {
    if (availableConfigs.length === 0) return;
    
    logService.info('Testing selected API configurations...');
    
    try {
      await apiTestingService.testMultipleConfigs(availableConfigs);
      // 重新加载配置以更新健康状态
      loadAvailableConfigs();
    } catch (error) {
      logService.error('Failed to test selected configs:', error);
    }
  }, [availableConfigs, loadAvailableConfigs]);

  // 获取健康的配置数量
  const getHealthyConfigsCount = useCallback(() => {
    return availableConfigs.filter(config => {
      const result = apiTestingService.getTestResult(config.id);
      return result && result.success;
    }).length;
  }, [availableConfigs]);

  // 初始化
  useEffect(() => {
    loadAvailableConfigs();
    
    if (autoTestOnMount) {
      // 延迟测试，避免在应用启动时立即执行
      setTimeout(() => {
        testSelectedConfigs();
      }, 2000);
    }
  }, [loadAvailableConfigs, autoTestOnMount, testSelectedConfigs]);

  return {
    // 状态
    availableConfigs,
    currentApiConfig,
    rotationStats: getRotationStats(),
    
    // 方法
    selectNextApiConfig,
    createRotatedAppSettings,
    executeWithRotation,
    updateRotationStrategy,
    resetRotationStats,
    testSelectedConfigs,
    loadAvailableConfigs,
    
    // 计算属性
    isRotationEnabled: enableRotation,
    healthyConfigsCount: getHealthyConfigsCount(),
    hasAvailableConfigs: availableConfigs.length > 0
  };
};
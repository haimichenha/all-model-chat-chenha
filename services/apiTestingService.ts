import { ApiConfig } from '../types';
import { geminiServiceInstance } from './geminiService';
import { logService } from './logService';

export interface ApiTestResult {
  configId: string;
  success: boolean;
  responseTime: number;
  error?: string;
  model?: string;
  timestamp: Date;
}

export interface ApiSelectionStrategy {
  type: 'single' | 'roundRobin' | 'random' | 'failover';
  selectedConfigIds: string[];
}

class ApiTestingService {
  private testResults: Map<string, ApiTestResult> = new Map();
  private currentStrategy: ApiSelectionStrategy = {
    type: 'single',
    selectedConfigIds: []
  };
  private roundRobinIndex = 0;

  /**
   * 测试单个API配置的连接性
   */
  async testApiConfig(config: ApiConfig): Promise<ApiTestResult> {
    const startTime = Date.now();
    const result: ApiTestResult = {
      configId: config.id,
      success: false,
      responseTime: 0,
      timestamp: new Date()
    };

    try {
      logService.info(`Testing API config: ${config.name} (${config.id})`);

      // 创建一个简单的测试请求
      const testPrompt = "Hello";
      
      // 临时设置配置以进行测试
      const originalAppSettings = geminiServiceInstance['currentAppSettings'];
      
      // 创建临时的应用设置来测试API
      const testSettings = {
        ...originalAppSettings,
        apiKey: config.apiKey,
        apiProxyUrl: config.apiProxyUrl || ''
      };

      // 更新服务设置进行测试
      geminiServiceInstance.updateSettings(testSettings);

      // 执行测试请求
      const response = await geminiServiceInstance.generateText(
        testPrompt,
        [],
        {
          temperature: 0.1,
          topP: 0.1,
          systemInstruction: 'Reply with just "OK" to test connectivity.'
        }
      );

      // 恢复原始设置
      if (originalAppSettings) {
        geminiServiceInstance.updateSettings(originalAppSettings);
      }

      const endTime = Date.now();
      result.responseTime = endTime - startTime;

      if (response.text) {
        result.success = true;
        result.model = response.model || 'unknown';
        logService.info(`API test successful for ${config.name}: ${result.responseTime}ms`);
      } else {
        result.success = false;
        result.error = 'No response received';
        logService.warn(`API test failed for ${config.name}: No response`);
      }

    } catch (error: any) {
      const endTime = Date.now();
      result.responseTime = endTime - startTime;
      result.success = false;
      result.error = error.message || 'Unknown error';
      
      logService.error(`API test failed for ${config.name}:`, error);
      
      // 特殊处理一些常见错误
      if (error.message?.includes('API_KEY_INVALID')) {
        result.error = 'Invalid API key';
      } else if (error.message?.includes('quota')) {
        result.error = 'Quota exceeded';
      } else if (error.message?.includes('network')) {
        result.error = 'Network connection failed';
      } else if (error.message?.includes('timeout')) {
        result.error = 'Request timeout';
      }
    }

    // 保存测试结果
    this.testResults.set(config.id, result);
    return result;
  }

  /**
   * 批量测试多个API配置
   */
  async testMultipleConfigs(configs: ApiConfig[]): Promise<ApiTestResult[]> {
    logService.info(`Testing ${configs.length} API configurations...`);
    
    const results: ApiTestResult[] = [];
    
    // 并发测试，但限制并发数量以避免过载
    const batchSize = 3;
    
    for (let i = 0; i < configs.length; i += batchSize) {
      const batch = configs.slice(i, i + batchSize);
      const batchPromises = batch.map(config => this.testApiConfig(config));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        logService.error('Error in batch API testing:', error);
        // 如果批量测试失败，逐个测试
        for (const config of batch) {
          try {
            const result = await this.testApiConfig(config);
            results.push(result);
          } catch (individualError) {
            logService.error(`Individual test failed for ${config.name}:`, individualError);
            results.push({
              configId: config.id,
              success: false,
              responseTime: 0,
              error: 'Test failed',
              timestamp: new Date()
            });
          }
        }
      }
      
      // 在批次之间稍作暂停，避免过度请求
      if (i + batchSize < configs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logService.info(`API testing completed. ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  /**
   * 获取API配置的测试结果
   */
  getTestResult(configId: string): ApiTestResult | null {
    return this.testResults.get(configId) || null;
  }

  /**
   * 获取所有测试结果
   */
  getAllTestResults(): ApiTestResult[] {
    return Array.from(this.testResults.values());
  }

  /**
   * 清除测试结果
   */
  clearTestResults(): void {
    this.testResults.clear();
  }

  /**
   * 设置API选择策略
   */
  setSelectionStrategy(strategy: ApiSelectionStrategy): void {
    this.currentStrategy = strategy;
    this.roundRobinIndex = 0; // 重置轮询索引
    logService.info(`API selection strategy set to: ${strategy.type} with ${strategy.selectedConfigIds.length} configs`);
  }

  /**
   * 获取当前API选择策略
   */
  getSelectionStrategy(): ApiSelectionStrategy {
    return { ...this.currentStrategy };
  }

  /**
   * 根据当前策略选择下一个API配置
   */
  selectNextApiConfig(availableConfigs: ApiConfig[]): ApiConfig | null {
    const selectedConfigs = availableConfigs.filter(config => 
      this.currentStrategy.selectedConfigIds.includes(config.id)
    );

    if (selectedConfigs.length === 0) {
      return null;
    }

    switch (this.currentStrategy.type) {
      case 'single':
        return selectedConfigs[0] || null;

      case 'roundRobin':
        const config = selectedConfigs[this.roundRobinIndex % selectedConfigs.length];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % selectedConfigs.length;
        return config;

      case 'random':
        const randomIndex = Math.floor(Math.random() * selectedConfigs.length);
        return selectedConfigs[randomIndex];

      case 'failover':
        // 选择第一个测试成功的配置
        for (const config of selectedConfigs) {
          const testResult = this.getTestResult(config.id);
          if (testResult && testResult.success) {
            return config;
          }
        }
        // 如果没有成功的测试结果，返回第一个
        return selectedConfigs[0] || null;

      default:
        return selectedConfigs[0] || null;
    }
  }

  /**
   * 获取可用的API配置（基于测试结果）
   */
  getAvailableConfigs(allConfigs: ApiConfig[]): ApiConfig[] {
    return allConfigs.filter(config => {
      const testResult = this.getTestResult(config.id);
      return !testResult || testResult.success;
    });
  }

  /**
   * 验证newapi格式的密钥
   */
  isNewApiKeyFormat(apiKey: string): boolean {
    // newapi格式通常是 sk- 开头，后跟长字符串
    return /^sk-[a-zA-Z0-9]{40,}$/.test(apiKey);
  }

  /**
   * 获取API配置的健康状态
   */
  getConfigHealth(configId: string): 'healthy' | 'unhealthy' | 'unknown' {
    const result = this.getTestResult(configId);
    if (!result) return 'unknown';
    return result.success ? 'healthy' : 'unhealthy';
  }

  /**
   * 获取推荐的API配置（基于性能和可用性）
   */
  getRecommendedConfigs(allConfigs: ApiConfig[]): ApiConfig[] {
    const configsWithResults = allConfigs
      .map(config => ({
        config,
        result: this.getTestResult(config.id)
      }))
      .filter(item => item.result && item.result.success)
      .sort((a, b) => a.result!.responseTime - b.result!.responseTime);

    return configsWithResults.map(item => item.config);
  }
}

export const apiTestingService = new ApiTestingService();
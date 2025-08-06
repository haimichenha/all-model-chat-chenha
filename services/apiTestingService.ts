import { logService } from './logService';
import { geminiServiceInstance } from './geminiService';

export interface ApiTestResult {
  success: boolean;
  responseTime?: number;
  error?: string;
  modelId?: string;
  apiKey?: string;
  endpoint?: string;
}

export interface ApiConfiguration {
  id: string;
  name: string;
  apiKey: string;
  endpoint?: string;
  modelId?: string;
  isSelected?: boolean;
}

class ApiTestingService {
  /**
   * Test a single API key with specified configuration
   */
  async testApiConnection(
    apiKey: string, 
    modelId: string = 'gemini-pro',
    endpoint?: string,
    timeoutMs: number = 10000
  ): Promise<ApiTestResult> {
    const startTime = Date.now();
    
    try {
      // Validate API key format first
      if (!this.validateApiKeyFormat(apiKey)) {
        return {
          success: false,
          error: '无效的 API 密钥格式',
          apiKey,
          modelId
        };
      }

      // Create a test message to validate the API
      const testPrompt = '请回复"测试成功"来确认API连接正常。';
      
      // Create a timeout promise
      const timeoutPromise = new Promise<ApiTestResult>((_, reject) => {
        setTimeout(() => reject(new Error('请求超时')), timeoutMs);
      });

      // Create the API test promise
      const testPromise = this.performApiTest(apiKey, modelId, testPrompt, endpoint);
      
      // Race between timeout and actual test
      const result = await Promise.race([testPromise, timeoutPromise]);
      
      const responseTime = Date.now() - startTime;
      
      return {
        ...result,
        responseTime,
        apiKey,
        modelId,
        endpoint
      };
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        responseTime,
        error: this.parseApiError(error),
        apiKey,
        modelId,
        endpoint
      };
    }
  }

  /**
   * Test multiple API configurations
   */
  async testMultipleApis(configurations: ApiConfiguration[]): Promise<Map<string, ApiTestResult>> {
    const results = new Map<string, ApiTestResult>();
    
    // Test all APIs concurrently
    const testPromises = configurations.map(async (config) => {
      const result = await this.testApiConnection(
        config.apiKey,
        config.modelId || 'gemini-pro',
        config.endpoint
      );
      results.set(config.id, result);
    });
    
    await Promise.allSettled(testPromises);
    
    logService.info(`API testing completed for ${configurations.length} configurations`);
    return results;
  }

  /**
   * Validate API key format - supports various formats including newapi keys
   */
  private validateApiKeyFormat(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Standard Gemini API key format
    if (apiKey.startsWith('AIza') && apiKey.length >= 35) {
      return true;
    }

    // NewAPI key format (sk-xxxx...)
    if (apiKey.startsWith('sk-') && apiKey.length >= 20) {
      return true;
    }

    // Other potential API key formats
    if (apiKey.length >= 20) {
      return true;
    }

    return false;
  }

  /**
   * Perform the actual API test
   */
  private async performApiTest(
    apiKey: string, 
    modelId: string, 
    testPrompt: string,
    endpoint?: string
  ): Promise<Omit<ApiTestResult, 'responseTime' | 'apiKey' | 'modelId' | 'endpoint'>> {
    try {
      // Save current settings
      const originalSettings = { ...geminiServiceInstance['currentAppSettings'] };
      
      // Temporarily update settings for testing
      const testSettings = {
        ...originalSettings,
        modelId,
        apiProxyUrl: endpoint
      };
      
      geminiServiceInstance.updateSettings(testSettings);
      
      try {
        // Attempt to send a test message
        const response = await geminiServiceInstance.sendMessage(
          testPrompt,
          [],
          modelId,
          '你是一个AI助手。请简洁地回复测试请求。',
          { temperature: 0.1, topP: 0.1 },
          false, // showThoughts
          1024, // thinkingBudget
          apiKey,
          false, // isGoogleSearchEnabled
          false, // isCodeExecutionEnabled
          false  // isUrlContextEnabled
        );
        
        if (response && response.content) {
          return { success: true };
        } else {
          return { 
            success: false, 
            error: '收到空响应' 
          };
        }
        
      } finally {
        // Restore original settings
        if (originalSettings) {
          geminiServiceInstance.updateSettings(originalSettings);
        }
      }
      
    } catch (error: any) {
      return {
        success: false,
        error: this.parseApiError(error)
      };
    }
  }

  /**
   * Parse API error messages to provide user-friendly feedback
   */
  private parseApiError(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error?.message) {
      const message = error.message.toLowerCase();
      
      if (message.includes('invalid api key') || message.includes('unauthorized')) {
        return 'API 密钥无效或未授权';
      }
      
      if (message.includes('quota exceeded') || message.includes('rate limit')) {
        return 'API 配额已用尽或请求过于频繁';
      }
      
      if (message.includes('network') || message.includes('timeout')) {
        return '网络连接超时或失败';
      }
      
      if (message.includes('model not found') || message.includes('invalid model')) {
        return '指定的模型不存在或不可用';
      }

      if (message.includes('blocked') || message.includes('safety')) {
        return '请求被安全过滤器阻止';
      }
      
      return error.message;
    }

    if (error?.status) {
      switch (error.status) {
        case 400:
          return '请求格式错误';
        case 401:
          return 'API 密钥无效';
        case 403:
          return '访问被禁止';
        case 404:
          return '模型或端点不存在';
        case 429:
          return '请求过于频繁';
        case 500:
          return 'API 服务器内部错误';
        default:
          return `HTTP 错误: ${error.status}`;
      }
    }

    return '未知错误';
  }

  /**
   * Get suggested configurations for common API providers
   */
  getSuggestedConfigurations(): ApiConfiguration[] {
    return [
      {
        id: 'gemini-official',
        name: 'Google Gemini (官方)',
        apiKey: 'AIza...',
        modelId: 'gemini-pro'
      },
      {
        id: 'gemini-newapi',
        name: 'Gemini (NewAPI)',
        apiKey: 'sk-...',
        endpoint: 'https://api.newapi.com/v1',
        modelId: 'gemini-pro'
      }
    ];
  }
}

export const apiTestingService = new ApiTestingService();
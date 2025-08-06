import { ApiConfig } from '../types';
import { logService } from './logService';

interface APITestResult {
  configId: string;
  configName: string;
  success: boolean;
  responseTime?: number;
  error?: string;
  statusCode?: number;
  model?: string;
}

interface APIRotationState {
  enabled: boolean;
  selectedConfigs: string[]; // Config IDs
  rotationMode: 'round-robin' | 'random';
  currentIndex: number;
  lastUsedTimestamp: number;
}

export class APITestingService {
  private rotationState: APIRotationState = {
    enabled: false,
    selectedConfigs: [],
    rotationMode: 'round-robin',
    currentIndex: 0,
    lastUsedTimestamp: 0
  };

  // Test a single API configuration
  async testAPIConfig(config: ApiConfig): Promise<APITestResult> {
    const startTime = Date.now();
    const result: APITestResult = {
      configId: config.id,
      configName: config.name,
      success: false
    };

    try {
      // Normalize API key for NewAPI format (sk-xxxxx)
      const normalizedApiKey = this.normalizeAPIKey(config.apiKey);
      
      // Determine the API endpoint
      let apiUrl = config.apiProxyUrl || 'https://generativelanguage.googleapis.com/v1beta';
      
      // For NewAPI format, adjust the endpoint structure
      if (this.isNewAPIKey(config.apiKey)) {
        // NewAPI typically uses OpenAI-compatible endpoints
        apiUrl = config.apiProxyUrl || 'https://api.openai.com/v1';
      }

      // Test with a simple model list request or similar lightweight endpoint
      const testEndpoint = this.isNewAPIKey(config.apiKey) 
        ? `${apiUrl}/models`  // OpenAI-compatible endpoint
        : `${apiUrl}/models?key=${normalizedApiKey}`; // Google Gemini endpoint

      const response = await fetch(testEndpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...(this.isNewAPIKey(config.apiKey) && {
            'Authorization': `Bearer ${normalizedApiKey}`,
            'Content-Type': 'application/json'
          })
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      const responseTime = Date.now() - startTime;
      result.responseTime = responseTime;
      result.statusCode = response.status;

      if (response.ok) {
        result.success = true;
        
        try {
          const data = await response.json();
          // Try to extract model information
          if (data.models && Array.isArray(data.models) && data.models.length > 0) {
            result.model = data.models[0].name || data.models[0].id;
          } else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            result.model = data.data[0].id || data.data[0].name;
          }
        } catch (parseError) {
          // JSON parsing failed, but the request was successful
          result.success = true;
        }

        logService.info(`API test successful for ${config.name}: ${responseTime}ms`);
      } else {
        result.success = false;
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = await response.text();
          if (errorData) {
            result.error += ` - ${errorData.substring(0, 200)}`;
          }
        } catch (e) {
          // Ignore parsing error
        }

        logService.warn(`API test failed for ${config.name}: ${result.error}`);
      }

    } catch (error: any) {
      result.success = false;
      result.responseTime = Date.now() - startTime;
      
      if (error.name === 'TimeoutError') {
        result.error = 'Request timeout (10s)';
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        result.error = 'Network error - unable to reach API endpoint';
      } else {
        result.error = error.message || 'Unknown error';
      }

      logService.error(`API test error for ${config.name}:`, error);
    }

    return result;
  }

  // Test multiple API configurations concurrently
  async testMultipleConfigs(configs: ApiConfig[]): Promise<APITestResult[]> {
    logService.info(`Testing ${configs.length} API configurations...`);
    
    const testPromises = configs.map(config => this.testAPIConfig(config));
    const results = await Promise.all(testPromises);
    
    const successCount = results.filter(r => r.success).length;
    logService.info(`API testing completed: ${successCount}/${configs.length} configurations successful`);
    
    return results;
  }

  // Check if an API key is in NewAPI format (sk-xxxxx)
  private isNewAPIKey(apiKey: string): boolean {
    return apiKey.startsWith('sk-') && apiKey.length > 10;
  }

  // Normalize API key for NewAPI format
  private normalizeAPIKey(apiKey: string): string {
    if (this.isNewAPIKey(apiKey)) {
      // NewAPI keys are used as-is
      return apiKey.trim();
    }
    
    // For other API keys, return as-is (e.g., Google API keys)
    return apiKey.trim();
  }

  // Set up API rotation
  setupRotation(configs: ApiConfig[], mode: 'round-robin' | 'random' = 'round-robin'): void {
    this.rotationState = {
      enabled: configs.length > 1,
      selectedConfigs: configs.map(c => c.id),
      rotationMode: mode,
      currentIndex: 0,
      lastUsedTimestamp: Date.now()
    };

    logService.info(`API rotation setup: ${configs.length} configs, mode: ${mode}`);
  }

  // Get next API config for rotation
  getNextAPIConfig(availableConfigs: ApiConfig[]): ApiConfig | null {
    if (!this.rotationState.enabled || this.rotationState.selectedConfigs.length === 0) {
      // Return the first available config or null
      return availableConfigs.length > 0 ? availableConfigs[0] : null;
    }

    const selectedConfigs = availableConfigs.filter(config => 
      this.rotationState.selectedConfigs.includes(config.id)
    );

    if (selectedConfigs.length === 0) {
      logService.warn('No selected configs available for rotation');
      return availableConfigs.length > 0 ? availableConfigs[0] : null;
    }

    let nextConfig: ApiConfig;

    if (this.rotationState.rotationMode === 'random') {
      // Random selection
      const randomIndex = Math.floor(Math.random() * selectedConfigs.length);
      nextConfig = selectedConfigs[randomIndex];
    } else {
      // Round-robin selection
      nextConfig = selectedConfigs[this.rotationState.currentIndex % selectedConfigs.length];
      this.rotationState.currentIndex = (this.rotationState.currentIndex + 1) % selectedConfigs.length;
    }

    this.rotationState.lastUsedTimestamp = Date.now();
    
    logService.info(`Selected API config for rotation: ${nextConfig.name} (${this.rotationState.rotationMode} mode)`);
    return nextConfig;
  }

  // Get rotation status
  getRotationStatus(): APIRotationState & { 
    selectedConfigNames: string[];
    isActive: boolean;
  } {
    return {
      ...this.rotationState,
      selectedConfigNames: [], // This would be populated by the caller with actual config names
      isActive: this.rotationState.enabled && this.rotationState.selectedConfigs.length > 1
    };
  }

  // Disable rotation
  disableRotation(): void {
    this.rotationState.enabled = false;
    logService.info('API rotation disabled');
  }

  // Enable rotation with existing settings
  enableRotation(): void {
    if (this.rotationState.selectedConfigs.length > 1) {
      this.rotationState.enabled = true;
      logService.info('API rotation enabled');
    } else {
      logService.warn('Cannot enable rotation: need at least 2 configs');
    }
  }

  // Update rotation mode
  setRotationMode(mode: 'round-robin' | 'random'): void {
    this.rotationState.rotationMode = mode;
    this.rotationState.currentIndex = 0; // Reset index when mode changes
    logService.info(`API rotation mode changed to: ${mode}`);
  }

  // Test NewAPI key format specifically
  async testNewAPIKey(apiKey: string, baseUrl?: string): Promise<{ valid: boolean; error?: string; models?: string[] }> {
    if (!this.isNewAPIKey(apiKey)) {
      return { valid: false, error: 'Not a valid NewAPI key format (should start with sk-)' };
    }

    try {
      const testUrl = baseUrl || 'https://api.openai.com/v1/models';
      
      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        try {
          const data = await response.json();
          const models = data.data ? data.data.map((m: any) => m.id) : [];
          return { valid: true, models };
        } catch (e) {
          return { valid: true }; // Valid response but couldn't parse JSON
        }
      } else {
        const errorText = await response.text().catch(() => '');
        return { 
          valid: false, 
          error: `HTTP ${response.status}: ${errorText.substring(0, 200)}` 
        };
      }
    } catch (error: any) {
      return { 
        valid: false, 
        error: error.message || 'Network error'
      };
    }
  }
}

export const apiTestingService = new APITestingService();
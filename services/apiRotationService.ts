import { logService } from './logService';
import { ApiConfiguration } from './apiTestingService';

export interface ApiRotationSettings {
  mode: 'round-robin' | 'random' | 'priority';
  enableFailover: boolean;
  maxRetries: number;
  healthCheckInterval: number; // minutes
}

export interface ApiHealthStatus {
  id: string;
  isHealthy: boolean;
  lastChecked: number;
  consecutiveFailures: number;
  responseTime?: number;
  error?: string;
}

class ApiRotationService {
  private configurations: Map<string, ApiConfiguration> = new Map();
  private healthStatus: Map<string, ApiHealthStatus> = new Map();
  private currentIndex = 0;
  private settings: ApiRotationSettings = {
    mode: 'round-robin',
    enableFailover: true,
    maxRetries: 3,
    healthCheckInterval: 5
  };

  /**
   * Add API configuration to rotation
   */
  addApiConfiguration(config: ApiConfiguration): void {
    this.configurations.set(config.id, { ...config });
    
    // Initialize health status
    this.healthStatus.set(config.id, {
      id: config.id,
      isHealthy: true, // Assume healthy until proven otherwise
      lastChecked: Date.now(),
      consecutiveFailures: 0
    });
    
    logService.info(`Added API configuration: ${config.name} (${config.id})`);
  }

  /**
   * Remove API configuration from rotation
   */
  removeApiConfiguration(id: string): boolean {
    const removed = this.configurations.delete(id);
    this.healthStatus.delete(id);
    
    // Reset index if needed
    if (this.currentIndex >= this.configurations.size) {
      this.currentIndex = 0;
    }
    
    if (removed) {
      logService.info(`Removed API configuration: ${id}`);
    }
    
    return removed;
  }

  /**
   * Get all API configurations
   */
  getApiConfigurations(): ApiConfiguration[] {
    return Array.from(this.configurations.values());
  }

  /**
   * Get selected API configurations (those marked as isSelected: true)
   */
  getSelectedApiConfigurations(): ApiConfiguration[] {
    return Array.from(this.configurations.values()).filter(config => config.isSelected);
  }

  /**
   * Update API configuration selection
   */
  updateApiSelection(id: string, isSelected: boolean): void {
    const config = this.configurations.get(id);
    if (config) {
      config.isSelected = isSelected;
      logService.info(`Updated API selection: ${config.name} -> ${isSelected}`);
    }
  }

  /**
   * Get next API configuration based on rotation settings
   */
  getNextApiConfiguration(): ApiConfiguration | null {
    const selectedConfigs = this.getSelectedApiConfigurations();
    const healthyConfigs = selectedConfigs.filter(config => 
      this.isApiHealthy(config.id)
    );

    if (healthyConfigs.length === 0) {
      logService.warn('No healthy API configurations available');
      return selectedConfigs.length > 0 ? selectedConfigs[0] : null;
    }

    switch (this.settings.mode) {
      case 'round-robin':
        return this.getRoundRobinApi(healthyConfigs);
      case 'random':
        return this.getRandomApi(healthyConfigs);
      case 'priority':
        return this.getPriorityApi(healthyConfigs);
      default:
        return healthyConfigs[0];
    }
  }

  /**
   * Round-robin selection
   */
  private getRoundRobinApi(configs: ApiConfiguration[]): ApiConfiguration {
    const api = configs[this.currentIndex % configs.length];
    this.currentIndex = (this.currentIndex + 1) % configs.length;
    return api;
  }

  /**
   * Random selection
   */
  private getRandomApi(configs: ApiConfiguration[]): ApiConfiguration {
    const randomIndex = Math.floor(Math.random() * configs.length);
    return configs[randomIndex];
  }

  /**
   * Priority selection (first healthy API in order)
   */
  private getPriorityApi(configs: ApiConfiguration[]): ApiConfiguration {
    // Sort by some priority criteria (could be response time, success rate, etc.)
    const sortedConfigs = configs.sort((a, b) => {
      const healthA = this.healthStatus.get(a.id);
      const healthB = this.healthStatus.get(b.id);
      
      if (!healthA || !healthB) return 0;
      
      // Prioritize by fewest consecutive failures, then by response time
      const failureDiff = healthA.consecutiveFailures - healthB.consecutiveFailures;
      if (failureDiff !== 0) return failureDiff;
      
      return (healthA.responseTime || Infinity) - (healthB.responseTime || Infinity);
    });
    
    return sortedConfigs[0];
  }

  /**
   * Mark API as failed and update health status
   */
  markApiAsFailed(id: string, error?: string): void {
    const health = this.healthStatus.get(id);
    if (health) {
      health.consecutiveFailures += 1;
      health.lastChecked = Date.now();
      health.error = error;
      
      // Mark as unhealthy after multiple consecutive failures
      if (health.consecutiveFailures >= 3) {
        health.isHealthy = false;
        logService.warn(`API marked as unhealthy: ${id} (${health.consecutiveFailures} consecutive failures)`);
      }
    }
  }

  /**
   * Mark API as successful and update health status
   */
  markApiAsSuccessful(id: string, responseTime?: number): void {
    const health = this.healthStatus.get(id);
    if (health) {
      health.consecutiveFailures = 0;
      health.isHealthy = true;
      health.lastChecked = Date.now();
      health.responseTime = responseTime;
      health.error = undefined;
    }
  }

  /**
   * Check if API is healthy
   */
  isApiHealthy(id: string): boolean {
    const health = this.healthStatus.get(id);
    if (!health) return false;
    
    // Check if health check is stale
    const now = Date.now();
    const staleThreshold = this.settings.healthCheckInterval * 60 * 1000;
    const isStale = (now - health.lastChecked) > staleThreshold;
    
    if (isStale && !health.isHealthy) {
      // Give unhealthy APIs a chance after some time
      health.isHealthy = true;
      health.consecutiveFailures = Math.max(0, health.consecutiveFailures - 1);
      logService.info(`Giving API another chance after cooldown: ${id}`);
    }
    
    return health.isHealthy;
  }

  /**
   * Get health status for all APIs
   */
  getHealthStatus(): Map<string, ApiHealthStatus> {
    return new Map(this.healthStatus);
  }

  /**
   * Update rotation settings
   */
  updateSettings(newSettings: Partial<ApiRotationSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    logService.info('API rotation settings updated', this.settings);
  }

  /**
   * Get current rotation settings
   */
  getSettings(): ApiRotationSettings {
    return { ...this.settings };
  }

  /**
   * Reset health status for all APIs
   */
  resetHealthStatus(): void {
    for (const [id, health] of this.healthStatus) {
      health.isHealthy = true;
      health.consecutiveFailures = 0;
      health.lastChecked = Date.now();
      health.error = undefined;
    }
    logService.info('Reset health status for all APIs');
  }

  /**
   * Get statistics about API usage and health
   */
  getStatistics(): {
    totalApis: number;
    selectedApis: number;
    healthyApis: number;
    averageResponseTime: number;
  } {
    const allConfigs = this.getApiConfigurations();
    const selectedConfigs = this.getSelectedApiConfigurations();
    const healthyConfigs = selectedConfigs.filter(config => this.isApiHealthy(config.id));
    
    const responseTimes = Array.from(this.healthStatus.values())
      .map(h => h.responseTime)
      .filter(t => t !== undefined) as number[];
    
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;
    
    return {
      totalApis: allConfigs.length,
      selectedApis: selectedConfigs.length,
      healthyApis: healthyConfigs.length,
      averageResponseTime: Math.round(averageResponseTime)
    };
  }

  /**
   * Execute with failover - tries multiple APIs if needed
   */
  async executeWithFailover<T>(
    apiCall: (config: ApiConfiguration) => Promise<T>
  ): Promise<{ result: T; usedApiId: string }> {
    const selectedConfigs = this.getSelectedApiConfigurations();
    
    if (selectedConfigs.length === 0) {
      throw new Error('No API configurations selected for rotation');
    }

    let lastError: Error | undefined;
    let attempts = 0;
    const maxAttempts = Math.min(this.settings.maxRetries, selectedConfigs.length);
    
    while (attempts < maxAttempts) {
      const config = this.getNextApiConfiguration();
      
      if (!config) {
        throw new Error('No available API configurations');
      }

      try {
        const startTime = Date.now();
        const result = await apiCall(config);
        const responseTime = Date.now() - startTime;
        
        this.markApiAsSuccessful(config.id, responseTime);
        
        return { result, usedApiId: config.id };
        
      } catch (error: any) {
        lastError = error;
        attempts++;
        
        this.markApiAsFailed(config.id, error.message);
        logService.warn(`API call failed for ${config.name}: ${error.message}`);
        
        if (attempts >= maxAttempts) {
          break;
        }
      }
    }
    
    throw lastError || new Error('All API attempts failed');
  }
}

export const apiRotationService = new ApiRotationService();
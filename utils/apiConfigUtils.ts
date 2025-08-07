import { ApiConfig } from '../types';
import { ApiConfiguration } from '../services/apiTestingService';

/**
 * Utility functions to bridge ApiConfig (from app settings) and ApiConfiguration (from rotation service)
 */

/**
 * Convert ApiConfig (from app settings) to ApiConfiguration (for rotation service)
 */
export function apiConfigToApiConfiguration(apiConfig: ApiConfig, modelId?: string, isSelected: boolean = false): ApiConfiguration {
  return {
    id: apiConfig.id,
    name: apiConfig.name,
    apiKey: apiConfig.apiKey,
    endpoint: apiConfig.apiProxyUrl || undefined,
    modelId: modelId || 'gemini-2.5-flash',
    isSelected
  };
}

/**
 * Convert ApiConfiguration (from rotation service) to ApiConfig (for app settings)
 */
export function apiConfigurationToApiConfig(apiConfiguration: ApiConfiguration, isDefault: boolean = false): ApiConfig {
  return {
    id: apiConfiguration.id,
    name: apiConfiguration.name,
    apiKey: apiConfiguration.apiKey,
    apiProxyUrl: apiConfiguration.endpoint || null,
    isDefault
  };
}

/**
 * Convert array of ApiConfig to array of ApiConfiguration
 */
export function apiConfigsToApiConfigurations(
  apiConfigs: ApiConfig[], 
  defaultModelId: string = 'gemini-2.5-flash',
  selectedIds: string[] = []
): ApiConfiguration[] {
  return apiConfigs
    .filter(config => config.apiKey.trim() !== '') // Only include configs with actual API keys
    .map(config => 
      apiConfigToApiConfiguration(
        config, 
        defaultModelId, 
        selectedIds.includes(config.id)
      )
    );
}

/**
 * Validate that an API configuration has the minimum required fields
 */
export function isValidApiConfig(apiConfig: ApiConfig): boolean {
  return !!(
    apiConfig.id &&
    apiConfig.name &&
    apiConfig.apiKey &&
    apiConfig.apiKey.trim().length > 0
  );
}

/**
 * Validate that an API configuration has the minimum required fields
 */
export function isValidApiConfiguration(apiConfiguration: ApiConfiguration): boolean {
  return !!(
    apiConfiguration.id &&
    apiConfiguration.name &&
    apiConfiguration.apiKey &&
    apiConfiguration.apiKey.trim().length > 0
  );
}

/**
 * Generate a unique ID for a new API configuration
 */
export function generateApiConfigId(name: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substr(2, 9);
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
  return `api-${safeName}-${timestamp}-${randomSuffix}`;
}

/**
 * Get display information for an API configuration
 */
export function getApiConfigDisplayInfo(config: ApiConfig | ApiConfiguration): {
  name: string;
  keyPreview: string;
  endpoint?: string;
  isProxy: boolean;
} {
  const endpoint = 'apiProxyUrl' in config ? config.apiProxyUrl : config.endpoint;
  
  return {
    name: config.name,
    keyPreview: config.apiKey.substring(0, 10) + '...',
    endpoint: endpoint || undefined,
    isProxy: !!(endpoint && endpoint.trim().length > 0)
  };
}
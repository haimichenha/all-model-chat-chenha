import { AppSettings, ChatSettings } from '../types';
import { API_KEY_LAST_USED_INDEX_KEY } from '../constants/appConstants';
import { logService } from '../services/logService';
import { persistentStoreService } from '../services/persistentStoreService';

export const getActiveApiConfig = (appSettings: AppSettings): { apiKeysString: string | null } => {
    if (appSettings.useCustomApiConfig) {
        // 如果指定了activeApiConfigId，尝试获取该配置
        if (appSettings.activeApiConfigId) {
            const configs = persistentStoreService.getApiConfigs();
            const config = configs.find(c => c.id === appSettings.activeApiConfigId);
            if (config && config.apiKey) {
                return {
                    apiKeysString: config.apiKey,
                };
            }
        }
        
        // 如果没有指定ID或找不到配置，使用第一个可用的配置
        const currentConfig = persistentStoreService.getCurrentOrFirstApiConfig();
        if (currentConfig && currentConfig.apiKey) {
            return {
                apiKeysString: currentConfig.apiKey,
            };
        }
        
        // 兜底使用appSettings中的apiKey
        if (appSettings.apiKey) {
            return {
                apiKeysString: appSettings.apiKey,
            };
        }
    }
    return {
        apiKeysString: process.env.API_KEY || null,
    };
};

export const getKeyForRequest = (
    appSettings: AppSettings,
    currentChatSettings: ChatSettings
): { key: string; isNewKey: boolean } | { error: string } => {
    const logUsage = (key: string) => {
        if (appSettings.useCustomApiConfig) {
            logService.recordApiKeyUsage(key);
        }
    };

    if (currentChatSettings.lockedApiKey) {
        logUsage(currentChatSettings.lockedApiKey);
        return { key: currentChatSettings.lockedApiKey, isNewKey: false };
    }

    const { apiKeysString } = getActiveApiConfig(appSettings);
    if (!apiKeysString) {
        return { error: "API Key not configured." };
    }
    const availableKeys = apiKeysString.split('\n').map(k => k.trim()).filter(Boolean);
    if (availableKeys.length === 0) {
        return { error: "No valid API keys found." };
    }

    if (availableKeys.length === 1) {
        const key = availableKeys[0];
        logUsage(key);
        return { key, isNewKey: true };
    }

    // Round-robin logic
    let lastUsedIndex = -1;
    try {
        const storedIndex = localStorage.getItem(API_KEY_LAST_USED_INDEX_KEY);
        if (storedIndex) {
            lastUsedIndex = parseInt(storedIndex, 10);
        }
    } catch (e) {
        logService.error("Could not parse last used API key index", e);
    }

    if (isNaN(lastUsedIndex) || lastUsedIndex < 0 || lastUsedIndex >= availableKeys.length) {
        lastUsedIndex = -1;
    }

    const nextIndex = (lastUsedIndex + 1) % availableKeys.length;
    const nextKey = availableKeys[nextIndex];

    try {
        localStorage.setItem(API_KEY_LAST_USED_INDEX_KEY, nextIndex.toString());
    } catch (e) {
        logService.error("Could not save last used API key index", e);
    }
    
    logUsage(nextKey);
    return { key: nextKey, isNewKey: true };
};

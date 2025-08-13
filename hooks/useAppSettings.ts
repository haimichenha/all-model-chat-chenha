import { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS, APP_SETTINGS_KEY } from '../constants/appConstants';
import { AVAILABLE_THEMES, DEFAULT_THEME_ID } from '../constants/themeConstants';
import { persistentStoreService } from '../services/persistentStoreService';
import { generateThemeCssVariables } from '../utils/appUtils';

export const useAppSettings = () => {
    const [appSettings, setAppSettings] = useState<AppSettings>(() => {
        // 从localStorage加载基本设置
        const stored = localStorage.getItem(APP_SETTINGS_KEY);
        const baseSettings = stored ? { ...DEFAULT_APP_SETTINGS, ...JSON.parse(stored) } : DEFAULT_APP_SETTINGS;

        // 从持久化存储中加载当前或默认的API配置
        const currentConfig = persistentStoreService.getCurrentOrFirstApiConfig();
        // 环境变量中的 API_KEY（由 Vite 在构建时内联）
        const envKey = (process as any)?.env?.API_KEY as string | undefined;

        // 采用策略：
        // - 若用户显式启用自定义配置，则总是使用持久化配置
        // - 否则，若环境未提供 API_KEY，则自动回退到持久化配置（含代理）
        if (currentConfig && (baseSettings.useCustomApiConfig || !envKey)) {
            baseSettings.apiKey = currentConfig.apiKey;
            // 兼容旧字段
            baseSettings.apiProxyUrl = (currentConfig as any).apiProxyUrl || (currentConfig as any).proxyUrl || null;
            baseSettings.activeApiConfigId = currentConfig.id;
            // 若环境无 Key，而我们回退到了持久化配置，则默认开启自定义配置，确保后续流程一致
            if (!baseSettings.useCustomApiConfig && !envKey) {
                baseSettings.useCustomApiConfig = true;
            }
        }

        return baseSettings;
    });

    const [language, setLanguage] = useState<'en' | 'zh'>('en');

    const currentTheme = AVAILABLE_THEMES.find(t => t.id === appSettings.themeId) || AVAILABLE_THEMES.find(t => t.id === DEFAULT_THEME_ID)!;

    useEffect(() => {
        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));

        const themeVariablesStyleTag = document.getElementById('theme-variables');
        if (themeVariablesStyleTag) {
            themeVariablesStyleTag.innerHTML = generateThemeCssVariables(currentTheme.colors);
        }

        const bodyClassList = document.body.classList;
        AVAILABLE_THEMES.forEach(t => bodyClassList.remove(`theme-${t.id}`));
        bodyClassList.add(`theme-${currentTheme.id}`, 'antialiased');

        document.body.style.fontSize = `${appSettings.baseFontSize}px`;

        let effectiveLang: 'en' | 'zh' = 'en';
        const settingLang = appSettings.language || 'system';
        if (settingLang === 'system') {
            const browserLang = navigator.language.toLowerCase();
            if (browserLang.startsWith('zh')) {
                effectiveLang = 'zh';
            }
        } else {
            effectiveLang = settingLang;
        }
        setLanguage(effectiveLang);

        // Send proxy URL to Service Worker
        if ('serviceWorker' in navigator) {
            const postProxyUrlToSw = (registration?: ServiceWorkerRegistration) => {
                const controller = registration ? registration.active : navigator.serviceWorker.controller;
                controller?.postMessage({
                    type: 'SET_PROXY_URL',
                    url: appSettings.apiProxyUrl,
                });
            };
            navigator.serviceWorker.ready.then(postProxyUrlToSw).catch(e => console.error("SW ready error:", e));
        }


    }, [appSettings, currentTheme]);

    return { appSettings, setAppSettings, currentTheme, language };
};
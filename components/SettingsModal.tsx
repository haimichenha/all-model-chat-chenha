import React, { useState, useEffect, useRef } from 'react';
import { AppSettings } from '../types';
import { Settings2, X, SlidersHorizontal, KeyRound, Bot } from 'lucide-react';
import { DEFAULT_APP_SETTINGS } from '../constants/appConstants';
import { Theme } from '../constants/themeConstants';
import { translations, getResponsiveValue } from '../utils/appUtils';
import { ApiConfigSection } from './settings/ApiConfigSection';
import { AppearanceSection } from './settings/AppearanceSection';
import { ChatBehaviorSection } from './settings/ChatBehaviorSection';
import { DataManagementSection } from './settings/DataManagementSection';
import { SettingsActions } from './settings/SettingsActions';
import { ModelOption } from '../types';
import { Modal } from './shared/Modal';
import { ApiRotationSection } from './settings/ApiRotationSection';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AppSettings; 
  availableModels: ModelOption[];
  availableThemes: Theme[]; 
  onSave: (newSettings: AppSettings) => void; 
  isModelsLoading: boolean;
  modelsLoadingError: string | null;
  onClearAllHistory: () => void;
  onClearCache: () => void;
  onOpenLogViewer: () => void;
  t: (key: keyof typeof translations | string) => string;
}

type SettingsTab = 'general' | 'api' | 'model';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, currentSettings, availableModels, availableThemes, 
  onSave, isModelsLoading, modelsLoadingError, onClearAllHistory, onClearCache, onOpenLogViewer, t
}) => {
  const [settings, setSettings] = useState(currentSettings);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // 用于触发子组件刷新
  
  const headingIconSize = getResponsiveValue(18, 20);
  const tabIconSize = getResponsiveValue(16, 18);

  useEffect(() => {
    if (isOpen) {
      setSettings(currentSettings);
      setActiveTab('general');
      const timer = setTimeout(() => closeButtonRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleClose = () => { if (isOpen) onClose(); };
  const handleSave = () => { onSave(settings); };
  const handleResetToDefaults = () => { setSettings(DEFAULT_APP_SETTINGS); };
  
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <SlidersHorizontal size={tabIconSize} /> },
    { id: 'api', label: 'API', icon: <KeyRound size={tabIconSize} /> },
    { id: 'model', label: 'Model', icon: <Bot size={tabIconSize} /> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div 
        className="bg-[var(--theme-bg-primary)] rounded-xl shadow-premium w-full max-w-md sm:max-w-3xl flex flex-col max-h-[90vh] sm:h-[85vh] sm:max-h-[750px]"
        role="document"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex justify-between items-center p-3 sm:p-4 border-b border-[var(--theme-border-primary)]">
          <h2 id="settings-title" className="text-lg sm:text-xl font-semibold text-[var(--theme-text-link)] flex items-center">
             <Settings2 size={headingIconSize + 2} className="mr-2.5 opacity-80" /> {t('settingsTitle')}
          </h2>
          <button ref={closeButtonRef} onClick={handleClose} className="text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)] transition-colors p-1 rounded-full" aria-label="Close settings">
            <X size={22} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-grow min-h-0">
          {/* Nav */}
          <nav className="flex-shrink-0 w-full sm:w-48 bg-[var(--theme-bg-secondary)] sm:border-r border-b sm:border-b-0 border-[var(--theme-border-primary)] flex sm:flex-col p-2 sm:p-3 sm:space-y-1 overflow-x-auto sm:overflow-x-visible">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`settings-nav-button w-full flex-shrink-0 sm:flex-shrink-1 flex items-center justify-start gap-3 px-3 py-2.5 text-sm font-medium rounded-md ${activeTab === tab.id ? 'active' : ''}`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
          
          {/* Content Panel */}
          <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar">
            <div className="p-3 sm:p-5 tab-content-enter-active">
              {activeTab === 'general' && (
                <div className="space-y-4">
                  <AppearanceSection
                    themeId={settings.themeId}
                    setThemeId={(val) => updateSetting('themeId', val as 'system' | 'onyx' | 'pearl')}
                    availableThemes={availableThemes}
                    baseFontSize={settings.baseFontSize}
                    setBaseFontSize={(val) => updateSetting('baseFontSize', val)}
                    language={settings.language}
                    setLanguage={(val) => updateSetting('language', val)}
                    t={t}
                  />
                  <DataManagementSection
                    onClearHistory={() => { onClearAllHistory(); onClose(); }}
                    onClearCache={onClearCache}
                    onOpenLogViewer={onOpenLogViewer}
                    currentSystemInstruction={settings.systemInstruction}
                    onImportSuccess={(newStore, currentSystemInstruction) => {
                      // 从新存储中获取API配置，并应用到当前设置
                      if (newStore.apiConfigs && newStore.apiConfigs.length > 0) {
                        const activeConfigId = newStore.lastSelectedApiConfigId;
                        const activeConfig = activeConfigId 
                          ? newStore.apiConfigs.find(c => c.id === activeConfigId)
                          : newStore.apiConfigs.find(c => c.isDefault) || newStore.apiConfigs[0];
                          
                        if (activeConfig) {
                          updateSetting('apiKey', activeConfig.apiKey);
                          updateSetting('apiProxyUrl', activeConfig.apiProxyUrl || null);
                          updateSetting('activeApiConfigId', activeConfig.id);
                          updateSetting('useCustomApiConfig', true);
                        }
                      }
                      
                      // 优先使用导入的当前系统指令，否则使用第一个系统提示词模板
                      if (currentSystemInstruction !== undefined) {
                        updateSetting('systemInstruction', currentSystemInstruction);
                      } else if (newStore.systemPrompts && newStore.systemPrompts.length > 0) {
                        updateSetting('systemInstruction', newStore.systemPrompts[0].prompt);
                      }
                      
                      // 触发刷新以更新 ApiConfigSection 组件
                      setRefreshTrigger(prev => prev + 1);
                      
                      alert('设置已即时应用！');
                    }}
                    refreshTrigger={refreshTrigger}
                    t={t}
                  />
                </div>
              )}
              {activeTab === 'api' && (
                <div className="space-y-4">
                  <ApiConfigSection
                    useCustomApiConfig={settings.useCustomApiConfig}
                    setUseCustomApiConfig={(val) => updateSetting('useCustomApiConfig', val)}
                    activeApiConfigId={settings.activeApiConfigId}
                    onActiveConfigChange={(config) => {
                      if (config) {
                        updateSetting('apiKey', config.apiKey);
                        // 兼容旧字段 proxyUrl
                        // @ts-ignore
                        const proxyUrl = (config.apiProxyUrl ?? (config as any).proxyUrl) || null;
                        updateSetting('apiProxyUrl', proxyUrl);
                        updateSetting('activeApiConfigId', config.id);
                      } else {
                        updateSetting('apiKey', null);
                        updateSetting('apiProxyUrl', null);
                        updateSetting('activeApiConfigId', null);
                      }
                    }}
                    refreshTrigger={refreshTrigger}
                    t={t}
                  />
                  <ApiRotationSection
                    settings={settings}
                    onChange={(partial) => setSettings(prev => ({ ...prev, ...partial }))}
                  />
                </div>
              )}
              {activeTab === 'model' && (
                <ChatBehaviorSection
                  modelId={settings.modelId}
                  setModelId={(val) => updateSetting('modelId', val)}
                  isModelsLoading={isModelsLoading}
                  modelsLoadingError={modelsLoadingError}
                  availableModels={availableModels}
                  transcriptionModelId={settings.transcriptionModelId}
                  setTranscriptionModelId={(val) => updateSetting('transcriptionModelId', val)}
                  ttsVoice={settings.ttsVoice}
                  setTtsVoice={(val) => updateSetting('ttsVoice', val)}
                  systemInstruction={settings.systemInstruction}
                  setSystemInstruction={(val) => updateSetting('systemInstruction', val)}
                  temperature={settings.temperature}
                  setTemperature={(val) => updateSetting('temperature', val)}
                  topP={settings.topP}
                  setTopP={(val) => updateSetting('topP', val)}
                  showThoughts={settings.showThoughts}
                  setShowThoughts={(val) => updateSetting('showThoughts', val)}
                  thinkingBudget={settings.thinkingBudget}
                  setThinkingBudget={(val) => updateSetting('thinkingBudget', val)}
                  isStreamingEnabled={settings.isStreamingEnabled}
                  setIsStreamingEnabled={(val) => updateSetting('isStreamingEnabled', val)}
                  isTranscriptionThinkingEnabled={settings.isTranscriptionThinkingEnabled}
                  setIsTranscriptionThinkingEnabled={(val) => updateSetting('isTranscriptionThinkingEnabled', val)}
                  useFilesApiForImages={settings.useFilesApiForImages}
                  setUseFilesApiForImages={(val) => updateSetting('useFilesApiForImages', val)}
                  expandCodeBlocksByDefault={settings.expandCodeBlocksByDefault}
                  setExpandCodeBlocksByDefault={(val) => updateSetting('expandCodeBlocksByDefault', val)}
                  // 自动功能开关
                  isAutoTitleEnabled={settings.isAutoTitleEnabled || false}
                  setIsAutoTitleEnabled={(val) => updateSetting('isAutoTitleEnabled', val)}
                  isSuggestionsEnabled={settings.isSuggestionsEnabled || false}
                  setIsSuggestionsEnabled={(val) => updateSetting('isSuggestionsEnabled', val)}
                  // 图表渲染和通知功能
                  isMermaidRenderingEnabled={settings.isMermaidRenderingEnabled || false}
                  setIsMermaidRenderingEnabled={(val) => updateSetting('isMermaidRenderingEnabled', val)}
                  isGraphvizRenderingEnabled={settings.isGraphvizRenderingEnabled || false}
                  setIsGraphvizRenderingEnabled={(val) => updateSetting('isGraphvizRenderingEnabled', val)}
                  isCompletionNotificationEnabled={settings.isCompletionNotificationEnabled || false}
                  setIsCompletionNotificationEnabled={(val) => updateSetting('isCompletionNotificationEnabled', val)}
                  t={t}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0">
          <SettingsActions
            onSave={handleSave}
            onCancel={handleClose}
            onReset={handleResetToDefaults}
            t={t}
          />
        </div>
      </div>
    </Modal>
  );
};
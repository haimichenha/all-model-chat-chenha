import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Settings, ChevronDown, Check, Loader2, Trash2, Pin, MessagesSquare, Menu, FilePlus2, Wand2, Lock, FileText } from 'lucide-react'; 
import { ModelOption } from '../types';
import { translations, getResponsiveValue } from '../utils/appUtils';

interface HeaderProps {
  onNewChat: () => void; // Changed from onClearChat
  onOpenSettingsModal: () => void; 
  onOpenScenariosModal: () => void; 
  onToggleHistorySidebar: () => void;
  onOpenLogViewer?: () => void; // Add log viewer functionality
  isLoading: boolean;
  currentModelName?: string;
  availableModels: ModelOption[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  isModelsLoading: boolean; 
  isSwitchingModel: boolean;
  isHistorySidebarOpen: boolean;
  onLoadCanvasPrompt: () => void;
  isCanvasPromptActive: boolean; // New prop for canvas prompt status
  t: (key: keyof typeof translations) => string;
  isKeyLocked: boolean;
  defaultModelId?: string;
  onSetDefaultModel?: (modelId: string) => void;
  themeId?: string;
}

const MOBILE_BREAKPOINT = 640; // Tailwind's sm breakpoint

export const Header: React.FC<HeaderProps> = ({
  onNewChat,
  onOpenSettingsModal, 
  onOpenScenariosModal,
  onToggleHistorySidebar,
  onOpenLogViewer,
  isLoading,
  currentModelName,
  availableModels,
  selectedModelId,
  onSelectModel,
  isModelsLoading,
  isSwitchingModel,
  isHistorySidebarOpen,
  onLoadCanvasPrompt,
  isCanvasPromptActive, // Destructure new prop
  t,
  isKeyLocked,
}) => {
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const [newChatShortcut, setNewChatShortcut] = useState('');
  
  const [isModelNameOverflowing, setIsModelNameOverflowing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const singleInstanceRef = useRef<HTMLSpanElement>(null);

  const displayModelName = isModelsLoading && !currentModelName ? t('appLoadingModels') : currentModelName;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const singleInstance = singleInstanceRef.current;
    const contentWrapper = contentWrapperRef.current;

    if (container && singleInstance && contentWrapper) {
        const isOverflowing = singleInstance.scrollWidth > container.clientWidth;
        
        if (isOverflowing !== isModelNameOverflowing) {
            setIsModelNameOverflowing(isOverflowing);
        }
        
        if (isOverflowing) {
            // pl-4 is 1rem = 16px
            const scrollAmount = singleInstance.scrollWidth + 16;
            contentWrapper.style.setProperty('--marquee-scroll-amount', `-${scrollAmount}px`);
        }
    }
  }, [displayModelName, isModelNameOverflowing]);

  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    setNewChatShortcut(`${isMac ? 'Cmd' : 'Ctrl'} + Alt + N`);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
        setIsModelSelectorOpen(false);
      }
    };
    if (isModelSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModelSelectorOpen]);

  const handleModelSelect = (modelId: string) => {
    onSelectModel(modelId);
    setIsModelSelectorOpen(false);
  };

  const canvasPromptButtonBaseClasses = "p-2 sm:p-2.5 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-primary)] focus:ring-[var(--theme-border-focus)] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-100";
  const canvasPromptButtonActiveClasses = `bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] hover:bg-[var(--theme-bg-accent-hover)] shadow-premium`;
  const canvasPromptButtonInactiveClasses = `bg-[var(--theme-bg-tertiary)] text-[var(--theme-icon-settings)] hover:bg-[var(--theme-bg-input)]`;

  const canvasPromptAriaLabel = isCanvasPromptActive 
    ? t('canvasHelperActive_aria')
    : t('canvasHelperInactive_aria');
  const canvasPromptTitle = isCanvasPromptActive 
    ? t('canvasHelperActive_title')
    : t('canvasHelperInactive_title');


  return (
    <header className="bg-[var(--theme-bg-primary)] p-2 shadow-premium flex items-center justify-between flex-wrap gap-2 border-b border-[var(--theme-border-primary)] flex-shrink-0">
      <div className="flex items-center gap-2">
        <button
            onClick={onToggleHistorySidebar}
            className={`p-1.5 sm:p-2 text-[var(--theme-icon-history)] hover:bg-[var(--theme-bg-tertiary)] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-primary)] focus:ring-[var(--theme-border-focus)] transition-transform hover:scale-110 active:scale-105 ${isHistorySidebarOpen ? 'sm:hidden' : ''}`}
            aria-label={isHistorySidebarOpen ? t('historySidebarClose') : t('historySidebarOpen')}
            title={isHistorySidebarOpen ? t('historySidebarClose_short') : t('historySidebarOpen_short')}
        >
            <Menu size={getResponsiveValue(18, 20)} />
        </button>
        <div className="flex flex-col">
          <h1 className="text-base sm:text-lg font-bold text-[var(--theme-text-link)] whitespace-nowrap">{t('headerTitle')}</h1>
          
          <div className="relative mt-0.5" ref={modelSelectorRef}>
            <button
              onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
              disabled={isModelsLoading || isLoading || isSwitchingModel}
              className={`w-[6.6rem] sm:w-[7.8rem] md:w-[9rem] text-xs bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-input)] px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md self-start flex items-center justify-between gap-1 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200 active:scale-95 ${isSwitchingModel ? 'animate-pulse' : ''}`}
              title={`${t('headerModelSelectorTooltip_current')}: ${displayModelName}. ${t('headerModelSelectorTooltip_action')}`}
              aria-label={`${t('headerModelAriaLabel_current')}: ${displayModelName}. ${t('headerModelAriaLabel_action')}`}
              aria-haspopup="listbox"
              aria-expanded={isModelSelectorOpen}
            >
               <div ref={containerRef} className="flex-1 overflow-hidden">
                    <div ref={contentWrapperRef} className={`flex w-max items-center ${isModelNameOverflowing ? 'horizontal-scroll-marquee' : ''}`}>
                        <span ref={singleInstanceRef} className="flex items-center gap-1 whitespace-nowrap">
                            {isModelsLoading && !currentModelName ? <Loader2 size={12} className="animate-spin mr-1 text-[var(--theme-text-link)] flex-shrink-0" /> : null}
                            {isKeyLocked && <span title="API Key is locked for this session"><Lock size={10} className="mr-1 text-[var(--theme-text-link)]"/></span>}
                            <span>{displayModelName}</span>
                        </span>
                        {isModelNameOverflowing && (
                            <span className="flex items-center gap-1 whitespace-nowrap pl-4">
                                {isModelsLoading && !currentModelName ? <Loader2 size={12} className="animate-spin mr-1 text-[var(--theme-text-link)] flex-shrink-0" /> : null}
                                {isKeyLocked && <span title="API Key is locked for this session"><Lock size={10} className="mr-1 text-[var(--theme-text-link)]"/></span>}
                                <span>{displayModelName}</span>
                            </span>
                        )}
                    </div>
                </div>
              <ChevronDown size={12} className={`transition-transform duration-200 flex-shrink-0 ${isModelSelectorOpen ? 'rotate-180' : ''}`} />
            </button>

            {isModelSelectorOpen && (
              <div 
                className="absolute top-full left-0 mt-1 w-60 sm:w-72 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-lg shadow-premium z-20 max-h-60 overflow-y-auto custom-scrollbar"
                role="listbox"
                aria-labelledby="model-selector-button" 
              >
                {isModelsLoading ? (
                  <div>
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="px-3 py-2 flex items-center gap-2 animate-pulse">
                        <div className="h-4 w-4 bg-[var(--theme-bg-tertiary)] rounded-full"></div>
                        <div className="h-4 flex-grow bg-[var(--theme-bg-tertiary)] rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : availableModels.length > 0 ? (
                  availableModels.map(model => (
                    <button
                      key={model.id}
                      onClick={() => handleModelSelect(model.id)}
                      role="option"
                      aria-selected={model.id === selectedModelId}
                      className={`w-full text-left px-3 py-2 text-xs sm:text-sm flex items-center justify-between hover:bg-[var(--theme-bg-tertiary)] transition-colors
                        ${model.id === selectedModelId ? 'text-[var(--theme-text-link)]' : 'text-[var(--theme-text-primary)]'}`
                      }
                    >
                      <div className="flex items-center gap-2">
                        {model.isPinned && (
                          <Pin size={12} className="text-[var(--theme-text-tertiary)] flex-shrink-0" />
                        )}
                        <span className="truncate" title={model.name}>{model.name}</span>
                      </div>
                      {model.id === selectedModelId && <Check size={14} className="text-[var(--theme-text-link)] flex-shrink-0" />}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs sm:text-sm text-[var(--theme-text-tertiary)]">{t('headerModelSelectorNoModels')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
        <button
          onClick={onLoadCanvasPrompt}
          disabled={isLoading}
          className={`${canvasPromptButtonBaseClasses} ${isCanvasPromptActive ? canvasPromptButtonActiveClasses : canvasPromptButtonInactiveClasses}`}
          aria-label={canvasPromptAriaLabel}
          title={canvasPromptTitle}
        >
          <Wand2 size={getResponsiveValue(16, 18)} />
        </button>
        <button
          onClick={onOpenScenariosModal}
          className="p-2 sm:p-2.5 bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-input)] text-[var(--theme-icon-settings)] rounded-lg shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-primary)] focus:ring-[var(--theme-border-focus)] flex items-center justify-center hover:scale-105 active:scale-100"
          aria-label={t('scenariosManage_aria')}
          title={t('scenariosManage_title')}
        >
          <MessagesSquare size={getResponsiveValue(16, 18)} />
        </button>
        <button
          onClick={onOpenLogViewer}
          className="p-2 sm:p-2.5 bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-input)] text-[var(--theme-icon-settings)] rounded-lg shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-primary)] focus:ring-[var(--theme-border-focus)] flex items-center justify-center hover:scale-105 active:scale-100"
          aria-label="打开日志查看器"
          title="查看系统日志和网络记录"
        >
          <FileText size={getResponsiveValue(16, 18)} />
        </button>
        <button
          onClick={onOpenSettingsModal} 
          className="p-2 sm:p-2.5 bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-input)] text-[var(--theme-icon-settings)] rounded-lg shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-primary)] focus:ring-[var(--theme-border-focus)] flex items-center justify-center hover:scale-105 active:scale-100"
          aria-label={t('settingsOpen_aria')}
          title={t('settingsOpen_title')}
        >
          <Settings size={getResponsiveValue(16, 18)} />
        </button>
        
        <button
          onClick={onNewChat}
          className="p-2.5 sm:p-3 bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] text-[var(--theme-icon-clear-chat)] rounded-lg shadow-premium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-primary)] focus:ring-[var(--theme-bg-accent)] flex items-center justify-center hover:scale-105 active:scale-100"
          aria-label={t('headerNewChat_aria')}
          title={`${t('headerNewChat')} (${newChatShortcut})`}
        >
          <FilePlus2 size={getResponsiveValue(14, 16)} />
        </button>
      </div>
    </header>
  );
};

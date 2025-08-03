import React, { useCallback, useEffect, useState, ReactElement } from 'react';
import { AppSettings, PersistentStore } from './types';
import { CANVAS_ASSISTANT_SYSTEM_PROMPT, DEFAULT_SYSTEM_INSTRUCTION } from './constants/promptConstants';
import { HistorySidebar } from './components/HistorySidebar';
import { useAppSettings } from './hooks/useAppSettings';
import { useChat } from './hooks/useChat';
import { useAppUI } from './hooks/useAppUI';
import { useAppEvents } from './hooks/useAppEvents';
import { getTranslator, logService } from './utils/appUtils';
import { getKeyForRequest } from './utils/apiUtils';
import mermaid from 'mermaid';
import { ChatArea } from './components/layout/ChatArea';
import { AppModals } from './components/modals/AppModals';
import { sanitizeFilename, exportElementAsPng, exportHtmlStringAsFile, exportTextStringAsFile, gatherPageStyles } from './utils/exportUtils';
import DOMPurify from 'dompurify';


const App = (): ReactElement => {
  const { 
    appSettings, 
    setAppSettings, 
    currentTheme, 
    language, 
    applyImportedStore,
    activeApiConfig,
    handleActiveApiConfigChange,
    refreshTrigger
  } = useAppSettings();
  const t = getTranslator(language);
  
  const chatState = useChat(appSettings, language);
  const {
      messages,
      isLoading,
      loadingSessionIds,
      generatingTitleSessionIds,
      currentChatSettings,
      commandedInput,
      setCommandedInput,
      selectedFiles,
      setSelectedFiles,
      editingMessageId,
      appFileError,
      isAppProcessingFile,
      savedSessions,
      savedGroups,
      activeSessionId,
      apiModels,
      isModelsLoading,
      modelsLoadingError,
      isSwitchingModel,
      messagesEndRef,
      scrollContainerRef,
      savedScenarios,
      isAppDraggingOver,
      aspectRatio,
      setAspectRatio,
      ttsMessageId,
      loadChatSession,
      startNewChat,
      handleClearCurrentChat,
      handleSelectModelInHeader,
      handleProcessAndAddFiles,
      handleSendMessage,
      handleStopGenerating,
      handleEditMessage,
      handleCancelEdit,
      handleDeleteMessage,
      handleRetryMessage,
      handleRetryLastTurn,
      handleEditLastUserMessage,
      handleDeleteChatHistorySession,
      handleRenameSession,
      handleTogglePinSession,
      handleTogglePinCurrentSession,
      handleAddNewGroup,
      handleDeleteGroup,
      handleRenameGroup,
      handleMoveSessionToGroup,
      handleToggleGroupExpansion,
      clearCacheAndReload,
      handleSaveAllScenarios,
      handleLoadPreloadedScenario,
      handleImportPreloadedScenario,
      handleExportPreloadedScenario,
      onScrollContainerScroll: handleScroll,
      handleAppDragEnter,
      handleAppDragOver,
      handleAppDragLeave,
      handleAppDrop,
      handleCancelFileUpload,
      handleAddFileById,
      handleTextToSpeech,
      handleTranscribeAudio,
      setCurrentChatSettings,
      scrollNavVisibility,
      scrollToPrevTurn,
      scrollToNextTurn,
      toggleGoogleSearch,
      toggleCodeExecution,
      toggleUrlContext,
      updateAndPersistSessions,
      loadInitialData,
      handleExportChatHistory,
      handleImportChatHistory,
      handleExportChatHistoryAsText,
      handleImportChatHistoryFromText,
  } = chatState;

  const {
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isPreloadedMessagesModalOpen,
    setIsPreloadedMessagesModalOpen,
    isHistorySidebarOpen,
    setIsHistorySidebarOpen,
    isLogViewerOpen,
    setIsLogViewerOpen,
    handleTouchStart,
    handleTouchEnd,
  } = useAppUI();
  
  const {
    installPromptEvent,
    isStandalone,
    handleInstallPwa,
    handleExportSettings,
    handleImportSettings,
  } = useAppEvents({
    appSettings,
    setAppSettings,
    savedSessions,
    language,
    startNewChat,
    handleClearCurrentChat,
    currentChatSettings,
    handleSelectModelInHeader,
    isSettingsModalOpen,
    isPreloadedMessagesModalOpen,
    setIsLogViewerOpen,
    updateAndPersistSessions,
  });

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle');

  // 初始化应用
  useEffect(() => {
    logService.info('App initialized.');
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default', 
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    });
    
    // 注册全局文本分析函数 - 简化版本，只是一个标记本地文本文件不需要API验证的空实现
    (window as any).triggerIntelligentAnalysis = async (content: string, filename: string) => {
      try {
        // 直接创建一个新聊天（不使用复杂的聊天结构，而是简单地处理文本文件）
        const file = new File([content], filename, { type: 'text/plain' });
        
        // 标记为本地文本文件，这样就不需要API验证了
        Object.defineProperty(file, 'isLocalTextFile', {
          value: true,
          writable: false
        });
        
        // 直接处理文件
        await handleProcessAndAddFiles([file]);
        
        alert(`已成功处理文本文件"${filename}"。本地文本文件无需API验证即可使用。`);
      } catch (error) {
        console.error('处理文本文件失败:', error);
        alert(`处理文本文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    };
    
    // 清理函数
    return () => {
      delete (window as any).triggerIntelligentAnalysis;
    };
  }, [handleProcessAndAddFiles]);

  // 监听智能分析完成的效果，目前简化实现
  useEffect(() => {
    const handleIntelligentAnalysisCompleted = (event: CustomEvent) => {
      // 此事件处理在简化实现中不再需要
      console.log('智能分析完成事件已触发，但已使用简化实现');
    };

    window.addEventListener('intelligentAnalysisCompleted', handleIntelligentAnalysisCompleted as EventListener);
    
    return () => {
      window.removeEventListener('intelligentAnalysisCompleted', handleIntelligentAnalysisCompleted as EventListener);
    };
  }, []);
  
  const handleSaveSettings = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
  
    if (activeSessionId && setCurrentChatSettings) {
      setCurrentChatSettings(prevChatSettings => ({
        ...prevChatSettings,
        temperature: newSettings.temperature,
        topP: newSettings.topP,
        systemInstruction: newSettings.systemInstruction,
        showThoughts: newSettings.showThoughts,
        ttsVoice: newSettings.ttsVoice,
        thinkingBudget: newSettings.thinkingBudget,
        // When settings are saved, especially API settings, we must clear any
        // locked API key on the current session. This ensures the next request
        // uses the new global settings instead of an old, potentially invalid, locked key.
        lockedApiKey: null,
      }));
    }
    
    setIsSettingsModalOpen(false);
  };

  const handlePersistentStoreImportSuccess = useCallback((newStore: PersistentStore) => {
    // [简化] 回调函数现在只是一个简单的调用
    applyImportedStore(newStore);
  }, [applyImportedStore]);

  const handleChatHistoryRefresh = useCallback(() => {
    // 刷新聊天历史
    if (loadInitialData) {
      loadInitialData();
    }
    console.log('聊天历史已刷新');
  }, [loadInitialData]);

  const handleSetDefaultModel = (modelId: string) => {
    logService.info(`Setting new default model: ${modelId}`);
    setAppSettings(prev => ({ ...prev, modelId }));
  };

  const handleLoadCanvasHelperPromptAndSave = () => {
    const isCurrentlyCanvasPrompt = currentChatSettings.systemInstruction === CANVAS_ASSISTANT_SYSTEM_PROMPT;
    const newSystemInstruction = isCurrentlyCanvasPrompt ? DEFAULT_SYSTEM_INSTRUCTION : CANVAS_ASSISTANT_SYSTEM_PROMPT;
    
    setAppSettings(prev => ({...prev, systemInstruction: newSystemInstruction}));

    if (activeSessionId && setCurrentChatSettings) {
      setCurrentChatSettings(prevSettings => ({
        ...prevSettings,
        systemInstruction: newSystemInstruction,
      }));
    }
  };
  
  const handleHomepageSuggestionClick = (text: string) => {
    setCommandedInput({ text: text + '\n', id: Date.now() });
    setTimeout(() => {
        const textarea = document.querySelector('textarea[aria-label="Chat message input"]') as HTMLTextAreaElement;
        if (textarea) textarea.focus();
    }, 0);
  };

  const handleFollowUpSuggestionClick = (text: string) => {
    handleSendMessage({ text });
  };

  const getCurrentModelDisplayName = () => {
    const modelIdToDisplay = currentChatSettings.modelId || appSettings.modelId;
    if (isModelsLoading && !modelIdToDisplay && apiModels.length === 0) return t('loading');
    if (isModelsLoading && modelIdToDisplay && !apiModels.find(m => m.id === modelIdToDisplay)) return t('appVerifyingModel');
    if (isSwitchingModel) return t('appSwitchingModel');
    const model = apiModels.find(m => m.id === modelIdToDisplay);
    if (model) return model.name;
    if (modelIdToDisplay) { let n = modelIdToDisplay.split('/').pop()?.replace('gemini-','Gemini ') || modelIdToDisplay; return n.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ').replace(' Preview ',' Preview ');}
    return apiModels.length === 0 && !isModelsLoading ? t('appNoModelsAvailable') : t('appNoModelSelected');
  };

  const activeChat = savedSessions.find(s => s.id === activeSessionId);

  const handleExportChat = useCallback(async (format: 'png' | 'html' | 'txt') => {
    if (!activeChat) return;
    setExportStatus('exporting');
    
    const safeTitle = sanitizeFilename(activeChat.title);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `chat-${safeTitle}-${date}.${format}`;

    try {
        if (format === 'png') {
            if (!scrollContainerRef.current) return;
            document.body.classList.add('is-exporting-png');
            await new Promise(resolve => setTimeout(resolve, 100)); // Allow styles to apply
            
            await exportElementAsPng(scrollContainerRef.current, filename, {
                backgroundColor: currentTheme.colors.bgSecondary,
            });

        } else if (format === 'html') {
            if (!scrollContainerRef.current) return;

            const headContent = await gatherPageStyles();
            const bodyClasses = document.body.className;
            const rootBgColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-bg-primary');
            const chatHtml = scrollContainerRef.current.innerHTML;

            const fullHtml = `
                <!DOCTYPE html>
                <html lang="${language}">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Chat Export: ${DOMPurify.sanitize(activeChat.title)}</title>
                    ${headContent}
                    <script>
                        document.addEventListener('DOMContentLoaded', () => {
                            if (window.hljs) {
                                document.querySelectorAll('pre code').forEach((el) => {
                                    window.hljs.highlightElement(el);
                                });
                            }
                        });
                    </script>
                    <style>
                        body { background-color: ${rootBgColor}; padding: 1rem; box-sizing: border-box; }
                        .message-actions { opacity: 0.5 !important; transform: none !important; }
                        .group:hover .message-actions { opacity: 1 !important; }
                        .sticky[aria-label="Scroll to bottom"] { display: none !important; }
                    </style>
                </head>
                <body class="${bodyClasses}">
                    <div class="exported-chat-container w-full max-w-7xl mx-auto">
                        ${chatHtml}
                    </div>
                </body>
                </html>
            `;
            exportHtmlStringAsFile(fullHtml, filename);
        } else { // TXT
            const textContent = activeChat.messages.map(message => {
                const role = message.role === 'user' ? 'USER' : 'ASSISTANT';
                let content = `### ${role}\n`;
                if (message.files && message.files.length > 0) {
                    message.files.forEach(file => {
                        content += `[File attached: ${file.name}]\n`;
                    });
                }
                content += message.content;
                return content;
            }).join('\n\n');

            exportTextStringAsFile(textContent, filename);
        }
    } catch (error) {
        logService.error(`Chat export failed (format: ${format})`, { error });
        alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        document.body.classList.remove('is-exporting-png');
        setExportStatus('idle');
        setIsExportModalOpen(false);
    }
  }, [activeChat, currentTheme, language, scrollContainerRef, setExportStatus, setIsExportModalOpen]);

  const isCanvasPromptActive = currentChatSettings.systemInstruction === CANVAS_ASSISTANT_SYSTEM_PROMPT;
  const isImagenModel = currentChatSettings.modelId?.includes('imagen');

  return (
    <div 
      className={`relative flex h-full bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] theme-${currentTheme.id}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {isHistorySidebarOpen && (
        <div 
          onClick={() => setIsHistorySidebarOpen(false)} 
          className="fixed sm:hidden inset-0 bg-black/60 z-20 transition-opacity duration-300"
          aria-hidden="true"
        />
      )}
      <HistorySidebar
        isOpen={isHistorySidebarOpen}
        onToggle={() => setIsHistorySidebarOpen(prev => !prev)}
        sessions={savedSessions}
        groups={savedGroups}
        activeSessionId={activeSessionId}
        loadingSessionIds={loadingSessionIds}
        generatingTitleSessionIds={generatingTitleSessionIds}
        onSelectSession={(id) => loadChatSession(id, savedSessions)}
        onNewChat={() => startNewChat()}
        onDeleteSession={handleDeleteChatHistorySession}
        onRenameSession={handleRenameSession}
        onTogglePinSession={handleTogglePinSession}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onAddNewGroup={handleAddNewGroup}
        onDeleteGroup={handleDeleteGroup}
        onRenameGroup={handleRenameGroup}
        onMoveSessionToGroup={handleMoveSessionToGroup}
        onToggleGroupExpansion={handleToggleGroupExpansion}
        onExportChatHistory={handleExportChatHistoryAsText}
        onImportChatHistory={handleImportChatHistoryFromText}
        themeColors={currentTheme.colors}
        t={t}
        themeId={currentTheme.id}
        language={language}
      />
      <ChatArea
        isAppDraggingOver={isAppDraggingOver}
        handleAppDragEnter={handleAppDragEnter}
        handleAppDragOver={handleAppDragOver}
        handleAppDragLeave={handleAppDragLeave}
        handleAppDrop={handleAppDrop}
        onNewChat={() => startNewChat()}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenScenariosModal={() => setIsPreloadedMessagesModalOpen(true)}
        onToggleHistorySidebar={() => setIsHistorySidebarOpen(prev => !prev)}
        isLoading={isLoading}
        currentModelName={getCurrentModelDisplayName()}
        availableModels={apiModels}
        selectedModelId={currentChatSettings.modelId || appSettings.modelId}
        onSelectModel={handleSelectModelInHeader}
        isModelsLoading={isModelsLoading}
        isSwitchingModel={isSwitchingModel}
        isHistorySidebarOpen={isHistorySidebarOpen}
        onLoadCanvasPrompt={handleLoadCanvasHelperPromptAndSave}
        isCanvasPromptActive={isCanvasPromptActive}
        isKeyLocked={!!currentChatSettings.lockedApiKey}
        defaultModelId={appSettings.modelId}
        onSetDefaultModel={handleSetDefaultModel}
        themeId={currentTheme.id}
        modelsLoadingError={modelsLoadingError}
        messages={messages}
        messagesEndRef={messagesEndRef}
        scrollContainerRef={scrollContainerRef}
        onScrollContainerScroll={handleScroll}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onRetryMessage={handleRetryMessage}
        showThoughts={currentChatSettings.showThoughts}
        themeColors={currentTheme.colors}
        baseFontSize={appSettings.baseFontSize}
        expandCodeBlocksByDefault={appSettings.expandCodeBlocksByDefault}
        isMermaidRenderingEnabled={appSettings.isMermaidRenderingEnabled}
        isGraphvizRenderingEnabled={appSettings.isGraphvizRenderingEnabled ?? true}
        onSuggestionClick={handleHomepageSuggestionClick}
        onFollowUpSuggestionClick={handleFollowUpSuggestionClick}
        onTextToSpeech={handleTextToSpeech}
        ttsMessageId={ttsMessageId}
        language={language}
        scrollNavVisibility={scrollNavVisibility}
        onScrollToPrevTurn={scrollToPrevTurn}
        onScrollToNextTurn={scrollToNextTurn}
        appSettings={appSettings}
        commandedInput={commandedInput}
        onMessageSent={() => setCommandedInput(null)}
        selectedFiles={selectedFiles}
        setSelectedFiles={setSelectedFiles}
        onSendMessage={(text) => handleSendMessage({ text })}
        isEditing={!!editingMessageId}
        onStopGenerating={handleStopGenerating}
        onCancelEdit={handleCancelEdit}
        onProcessFiles={handleProcessAndAddFiles}
        onAddFileById={handleAddFileById}
        onCancelUpload={handleCancelFileUpload}
        onTranscribeAudio={handleTranscribeAudio}
        isProcessingFile={isAppProcessingFile}
        fileError={appFileError}
        isImagenModel={isImagenModel}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        isGoogleSearchEnabled={!!currentChatSettings.isGoogleSearchEnabled}
        onToggleGoogleSearch={toggleGoogleSearch}
        isCodeExecutionEnabled={!!currentChatSettings.isCodeExecutionEnabled}
        onToggleCodeExecution={toggleCodeExecution}
        isUrlContextEnabled={!!currentChatSettings.isUrlContextEnabled}
        onToggleUrlContext={toggleUrlContext}
        onClearChat={handleClearCurrentChat}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onToggleCanvasPrompt={handleLoadCanvasHelperPromptAndSave}
        onTogglePinCurrentSession={handleTogglePinCurrentSession}
        onRetryLastTurn={handleRetryLastTurn}
        onEditLastUserMessage={handleEditLastUserMessage}
        t={t}
      />
      <AppModals
        isSettingsModalOpen={isSettingsModalOpen}
        setIsSettingsModalOpen={setIsSettingsModalOpen}
        appSettings={appSettings}
        availableModels={apiModels}
        handleSaveSettings={handleSaveSettings}
        isModelsLoading={isModelsLoading}
        modelsLoadingError={modelsLoadingError}
        clearCacheAndReload={clearCacheAndReload}
        handleInstallPwa={handleInstallPwa}
        installPromptEvent={installPromptEvent}
        isStandalone={isStandalone}
        handleImportSettings={handleImportSettings}
        handleExportSettings={handleExportSettings}
        onPersistentStoreImportSuccess={handlePersistentStoreImportSuccess}
        activeApiConfig={activeApiConfig}
        handleActiveApiConfigChange={handleActiveApiConfigChange}
        refreshTrigger={refreshTrigger}
        isPreloadedMessagesModalOpen={isPreloadedMessagesModalOpen}
        setIsPreloadedMessagesModalOpen={setIsPreloadedMessagesModalOpen}
        savedScenarios={savedScenarios}
        handleSaveAllScenarios={handleSaveAllScenarios}
        handleLoadPreloadedScenario={handleLoadPreloadedScenario}
        handleImportPreloadedScenario={handleImportPreloadedScenario}
        handleExportPreloadedScenario={handleExportPreloadedScenario}
        isExportModalOpen={isExportModalOpen}
        setIsExportModalOpen={setIsExportModalOpen}
        handleExportChat={handleExportChat}
        exportStatus={exportStatus}
        isLogViewerOpen={isLogViewerOpen}
        setIsLogViewerOpen={setIsLogViewerOpen}
        currentChatSettings={currentChatSettings}
        t={t}
      />
    </div>
  );
};

export default App;

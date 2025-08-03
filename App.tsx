import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { AppSettings, UploadedFile } from './types';
import { DEFAULT_SYSTEM_INSTRUCTION, TAB_CYCLE_MODELS, CANVAS_ASSISTANT_SYSTEM_PROMPT } from './constants/appConstants';
import { AVAILABLE_THEMES } from './constants/themeConstants';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { HistorySidebar } from './components/HistorySidebar';
import { useAppSettings } from './hooks/useAppSettings';
import { useChat } from './hooks/useChat';
import { getTranslator, getResponsiveValue } from './utils/appUtils';
import { logService } from './services/logService';
import { SettingsModal } from './components/SettingsModal';
import { LogViewer } from './components/LogViewer';
import { PreloadedMessagesModal } from './components/PreloadedMessagesModal';

import { geminiServiceInstance } from './services/geminiService';
const App: React.FC = () => {
  const { appSettings, setAppSettings, currentTheme, language } = useAppSettings();
  const t = getTranslator(language);
  
  // [新增] 1. 创建"信号灯"状态
  const [isServiceInitialized, setIsServiceInitialized] = useState<boolean>(false);
  
  const {
      messages,
      isLoading,
      loadingSessionIds,
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
      handleDeleteChatHistorySession,
      handleRenameSession,
      handleTogglePinSession,
      handleAddNewGroup,
      handleDeleteGroup,
      handleRenameGroup,
      handleMoveSessionToGroup,
      handleToggleGroupExpansion,
      handleTogglePinGroup,
      clearCacheAndReload,
      handleSaveAllScenarios,
      handleLoadPreloadedScenario,
      handleImportPreloadedScenario,
      handleExportPreloadedScenario,
      handleScroll,
      handleAppDragEnter,
      handleAppDragOver,
      handleAppDragLeave,
      handleAppDrop,
      handleCancelFileUpload,
      handleAddFileById,
      handleTextToSpeech,
      handleImportSessions,
      setCurrentChatSettings,
      showScrollToBottom,
      scrollToBottom,
      toggleGoogleSearch,
      toggleCodeExecution,

      handleExportAllSessions,
  } = useChat(appSettings, isServiceInitialized);

  // [修改] 2. 在注入设置成功后，将信号灯变为绿色
  useEffect(() => {
    if (appSettings) {
      geminiServiceInstance.updateSettings(appSettings);
      setIsServiceInitialized(true); // <-- 绿灯亮起！
    }
  }, [appSettings]);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isPreloadedMessagesModalOpen, setIsPreloadedMessagesModalOpen] = useState<boolean>(false);
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState<boolean>(window.innerWidth >= 768);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState<boolean>(false);

  const handleSaveSettings = (newSettings: AppSettings) => {
    // Save the new settings as the global default for subsequent new chats
    setAppSettings(newSettings);
  
    // Also, apply the relevant behavioral settings to the current active chat session
    // This provides immediate feedback for the user on settings changes.
    if (activeSessionId && setCurrentChatSettings) {
      setCurrentChatSettings(prevChatSettings => ({
        ...prevChatSettings,
        // Apply generation-related settings from the modal.
        // We explicitly DO NOT update modelId, lockedApiKey, or tool settings,
        // as those are managed directly within the session context (header, file uploads, tool toggles).
        temperature: newSettings.temperature,
        topP: newSettings.topP,
        systemInstruction: newSettings.systemInstruction,
        showThoughts: newSettings.showThoughts,
        ttsVoice: newSettings.ttsVoice,
        thinkingBudget: newSettings.thinkingBudget,
      }));
    }
    
    setIsSettingsModalOpen(false);
  };

  useEffect(() => {
    logService.info('App initialized.');
  }, []);

  // File import functionality
  const handleImportChatHistory = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        
        if (file.name.endsWith('.json')) {
          // Try to parse as JSON (structured export)
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              handleImportSessions(parsed);
              logService.info(`Successfully imported ${parsed.length} sessions from JSON file`);
            } else {
              // Single session
              handleImportSessions([parsed]);
              logService.info('Successfully imported 1 session from JSON file');
            }
          } catch (jsonError) {
            logService.error('Failed to parse JSON file:', jsonError);
            alert('文件格式错误：无法解析 JSON 文件');
          }
        } else {
          // Handle as plain text - trigger chunked processing
          handleImportSessions([], content, file.name);
          logService.info(`Imported and processing text file: ${file.name}`);
        }
      } catch (error) {
        logService.error('Failed to read file:', error);
        alert('读取文件失败');
      }
    };
    input.click();
  }, [handleImportSessions]);
  
  // Memory management for file previews
  const prevSelectedFilesRef = useRef<UploadedFile[]>([]);
  useEffect(() => {
      const prevFiles = prevSelectedFilesRef.current;
      const currentFiles = selectedFiles;
      const removedFiles = prevFiles.filter(prevFile => !currentFiles.some(currentFile => currentFile.id === prevFile.id));
      removedFiles.forEach(file => { if (file.dataUrl && file.dataUrl.startsWith('blob:')) URL.revokeObjectURL(file.dataUrl); });
      prevSelectedFilesRef.current = currentFiles;
  }, [selectedFiles]);

  // Final cleanup on unmount
  useEffect(() => () => { prevSelectedFilesRef.current.forEach(file => { if (file.dataUrl?.startsWith('blob:')) URL.revokeObjectURL(file.dataUrl) }); }, []);

  const handleLoadCanvasHelperPromptAndSave = () => {
    const isCurrentlyCanvasPrompt = currentChatSettings.systemInstruction === CANVAS_ASSISTANT_SYSTEM_PROMPT;
    const newSystemInstruction = isCurrentlyCanvasPrompt ? DEFAULT_SYSTEM_INSTRUCTION : CANVAS_ASSISTANT_SYSTEM_PROMPT;
    
    // Apply this as a global default for new chats
    setAppSettings(prev => ({...prev, systemInstruction: newSystemInstruction}));

    // Also apply to the current chat if one is active, without sending a message.
    if (activeSessionId && setCurrentChatSettings) {
      setCurrentChatSettings(prevSettings => ({
        ...prevSettings,
        systemInstruction: newSystemInstruction,
      }));
    }
  };
  
  const handleSuggestionClick = (text: string) => {
    setCommandedInput({ text: text + '\n', id: Date.now() });
    setTimeout(() => {
        const textarea = document.querySelector('textarea[aria-label="Chat message input"]') as HTMLTextAreaElement;
        if (textarea) textarea.focus();
    }, 0);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        const activeElement = document.activeElement as HTMLElement;
        const isGenerallyInputFocused = activeElement && (activeElement.tagName.toLowerCase() === 'input' || activeElement.tagName.toLowerCase() === 'textarea' || activeElement.tagName.toLowerCase() === 'select' || activeElement.isContentEditable);
        if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'n') {
            event.preventDefault();
            startNewChat(); 
        } else if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'l') {
            event.preventDefault();
            setIsLogViewerOpen(prev => !prev);
        }
        else if (event.key === 'Delete') {
            if (isSettingsModalOpen || isPreloadedMessagesModalOpen) return;
            const chatTextareaAriaLabel = 'Chat message input';
            const isChatTextareaFocused = activeElement?.getAttribute('aria-label') === chatTextareaAriaLabel;
            
            if (isGenerallyInputFocused) {
                if (isChatTextareaFocused && (activeElement as HTMLTextAreaElement).value.trim() === '') {
                    event.preventDefault();
                    handleClearCurrentChat(); 
                }
            } else {
                event.preventDefault();
                handleClearCurrentChat();
            }
        } else if (event.key === 'Tab' && TAB_CYCLE_MODELS.length > 0) {
            const isChatTextareaFocused = activeElement?.getAttribute('aria-label') === 'Chat message input';
            if (isChatTextareaFocused || !isGenerallyInputFocused) {
                event.preventDefault();
                const currentModelId = currentChatSettings.modelId;
                const currentIndex = TAB_CYCLE_MODELS.indexOf(currentModelId);
                let nextIndex: number;
                if (currentIndex === -1) nextIndex = 0;
                else nextIndex = (currentIndex + 1) % TAB_CYCLE_MODELS.length;
                const newModelId = TAB_CYCLE_MODELS[nextIndex];
                if (newModelId) handleSelectModelInHeader(newModelId);
            }
        }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [startNewChat, handleClearCurrentChat, isSettingsModalOpen, isPreloadedMessagesModalOpen, currentChatSettings.modelId, handleSelectModelInHeader]);

  const getCurrentModelDisplayName = () => {
    const modelIdToDisplay = currentChatSettings.modelId || appSettings.modelId;
    if (isModelsLoading && !modelIdToDisplay && apiModels.length === 0) return t('appLoadingModels');
    if (isModelsLoading && modelIdToDisplay && !apiModels.find(m => m.id === modelIdToDisplay)) return t('appVerifyingModel');
    if (isSwitchingModel) return t('appSwitchingModel');
    const model = apiModels.find(m => m.id === modelIdToDisplay);
    if (model) return model.name;
    if (modelIdToDisplay) { let n = modelIdToDisplay.split('/').pop()?.replace('gemini-','Gemini ') || modelIdToDisplay; return n.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ').replace(' Preview ',' Preview ');}
    return apiModels.length === 0 && !isModelsLoading ? t('appNoModelsAvailable') : t('appNoModelSelected');
  };

  const isCanvasPromptActive = currentChatSettings.systemInstruction === CANVAS_ASSISTANT_SYSTEM_PROMPT;
  const isImagenModel = currentChatSettings.modelId?.includes('imagen');

  return (
    <div className={`relative flex h-full bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] theme-${currentTheme.id}`}>
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
        savedGroups={savedGroups}
        activeSessionId={activeSessionId}
        loadingSessionIds={loadingSessionIds}
        onSelectSession={(id) => loadChatSession(id, savedSessions)}
        onNewChat={() => startNewChat()}
        onDeleteSession={handleDeleteChatHistorySession}
        onRenameSession={handleRenameSession}
        onTogglePinSession={handleTogglePinSession}
        onExportAllSessions={handleExportAllSessions}
        onImportSessions={handleImportChatHistory}
        onAddNewGroup={handleAddNewGroup}
        onDeleteGroup={handleDeleteGroup}
        onRenameGroup={handleRenameGroup}
        onMoveSessionToGroup={handleMoveSessionToGroup}
        onToggleGroupExpansion={handleToggleGroupExpansion}
        onTogglePinGroup={handleTogglePinGroup}
        themeColors={currentTheme.colors}
        t={t}
        language={language}
      />
      <div
        className="flex flex-col flex-grow h-full overflow-hidden relative chat-bg-enhancement"
        onDragEnter={handleAppDragEnter}
        onDragOver={handleAppDragOver}
        onDragLeave={handleAppDragLeave}
        onDrop={handleAppDrop}
      >
        {isAppDraggingOver && (
          <div className="absolute inset-0 bg-[var(--theme-bg-accent)] bg-opacity-25 flex flex-col items-center justify-center pointer-events-none z-50 border-4 border-dashed border-[var(--theme-bg-accent)] rounded-lg m-1 sm:m-2 drag-overlay-animate">
            <Paperclip size={getResponsiveValue(48, 64)} className="text-[var(--theme-bg-accent)] opacity-80 mb-2 sm:mb-4" />
            <p className="text-lg sm:text-2xl font-semibold text-[var(--theme-text-link)] text-center px-2">
              {t('appDragDropRelease')}
            </p>
             <p className="text-sm text-[var(--theme-text-primary)] opacity-80 mt-2">{t('appDragDropHelpText')}</p>
          </div>
        )}
        <Header
          onNewChat={() => startNewChat()}
          onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
          onOpenScenariosModal={() => setIsPreloadedMessagesModalOpen(true)}
          onToggleHistorySidebar={() => setIsHistorySidebarOpen(prev => !prev)}
          onOpenLogViewer={() => setIsLogViewerOpen(true)}
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
          t={t}
          isKeyLocked={!!currentChatSettings.lockedApiKey}
        />
        {modelsLoadingError && (
          <div className="p-2 bg-[var(--theme-bg-danger)] text-[var(--theme-text-danger)] text-center text-xs flex-shrink-0">{modelsLoadingError}</div>
        )}
        <>
          {isLogViewerOpen && (
            <LogViewer
                isOpen={isLogViewerOpen}
                onClose={() => setIsLogViewerOpen(false)}
                appSettings={appSettings}
                currentChatSettings={currentChatSettings}
            />
          )}
          {isSettingsModalOpen && (
            <SettingsModal
              isOpen={isSettingsModalOpen}
              onClose={() => setIsSettingsModalOpen(false)}
              currentSettings={appSettings}
              availableModels={apiModels}
              availableThemes={AVAILABLE_THEMES}
              onSave={handleSaveSettings}
              isModelsLoading={isModelsLoading}
              modelsLoadingError={modelsLoadingError}
              onClearAllHistory={clearCacheAndReload}
              onClearCache={clearCacheAndReload}
              onOpenLogViewer={() => setIsLogViewerOpen(true)}
              t={t}
            />
          )}
          {isPreloadedMessagesModalOpen && (
            <PreloadedMessagesModal
              isOpen={isPreloadedMessagesModalOpen}
              onClose={() => setIsPreloadedMessagesModalOpen(false)}
              savedScenarios={savedScenarios}
              onSaveAllScenarios={handleSaveAllScenarios}
              onLoadScenario={handleLoadPreloadedScenario}
              onImportScenario={handleImportPreloadedScenario}
              onExportScenario={handleExportPreloadedScenario}
              t={t}
            />
          )}
        </>
        <MessageList
          messages={messages}
          messagesEndRef={messagesEndRef}
          scrollContainerRef={scrollContainerRef}
          onScrollContainerScroll={handleScroll}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onRetryMessage={handleRetryMessage}
          showThoughts={currentChatSettings.showThoughts}
          themeColors={currentTheme.colors}
          themeId={currentTheme.id}
          baseFontSize={appSettings.baseFontSize}
          expandCodeBlocksByDefault={appSettings.expandCodeBlocksByDefault}
          onSuggestionClick={handleSuggestionClick}
          onTextToSpeech={handleTextToSpeech}
          ttsMessageId={ttsMessageId}
          t={t}
          language={language}
          showScrollToBottom={showScrollToBottom}
          onScrollToBottom={scrollToBottom}
        />
        <ChatInput
          appSettings={appSettings}
          commandedInput={commandedInput}
          onMessageSent={() => setCommandedInput(null)}
          selectedFiles={selectedFiles}
          setSelectedFiles={setSelectedFiles}
          onSendMessage={(text) => handleSendMessage({ text })}
          isLoading={isLoading}
          isEditing={!!editingMessageId}
          onStopGenerating={handleStopGenerating}
          onCancelEdit={handleCancelEdit}
          onProcessFiles={handleProcessAndAddFiles}
          onAddFileById={handleAddFileById}
          onCancelUpload={handleCancelFileUpload}
          isProcessingFile={isAppProcessingFile}
          fileError={appFileError}
          isImagenModel={isImagenModel}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          t={t}
          transcriptionModelId={appSettings.transcriptionModelId}
          isTranscriptionThinkingEnabled={appSettings.isTranscriptionThinkingEnabled}
          isGoogleSearchEnabled={!!currentChatSettings.isGoogleSearchEnabled}
          onToggleGoogleSearch={toggleGoogleSearch}
          isCodeExecutionEnabled={!!currentChatSettings.isCodeExecutionEnabled}
          onToggleCodeExecution={toggleCodeExecution}
          isUrlContextEnabled={!!currentChatSettings.isUrlContextEnabled}
          onToggleUrlContext={() => {}}
          onClearChat={() => handleClearCurrentChat()}
          onNewChat={() => startNewChat()}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onToggleCanvasPrompt={handleLoadCanvasHelperPromptAndSave}
          availableModels={apiModels}
          onSelectModel={(modelId) => setCurrentChatSettings(prev => ({ ...prev, model: modelId }))}
          onTogglePinCurrentSession={() => activeSessionId && handleTogglePinSession(activeSessionId)}
          onRetryLastTurn={() => {}}
          onEditLastUserMessage={() => {}}
          onAttachmentAction={() => {}}
          setIsHelpModalOpen={() => {}}
        />
      </div>
    </div>
  );
};

export default App;

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
import { getTranslator, getResponsiveValue, getKeyForRequest } from './utils/appUtils';
import { logService } from './services/logService';
import { SettingsModal } from './components/SettingsModal';
import { LogViewer } from './components/LogViewer';
import { PreloadedMessagesModal } from './components/PreloadedMessagesModal';
import { geminiServiceInstance } from './services/geminiService';
import { PipDialog } from './components/PipDialog';
import { Part } from '@google/genai';

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
      toggleUrlContext,

  handleExportAllSessions,
  appendModelMessage,
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
  // PiP state
  const [pipVisible, setPipVisible] = useState(false);
  const [pipMode, setPipMode] = useState<'explain' | 'reanswer'>('explain');
  const [pipOriginalText, setPipOriginalText] = useState('');
  const [pipResponse, setPipResponse] = useState<string>('');
  const [pipLoading, setPipLoading] = useState(false);
  // 仍通过右键选中触发
  
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
  
  // Generate content for PiP dialog using current chat settings and rotation-enabled service
  const runPipGeneration = useCallback(async (mode: 'explain' | 'reanswer', selectedText: string) => {
    console.log('runPipGeneration called:', { mode, selectedText });
    
    // 守卫：确保关键配置已就绪，避免未就绪时访问属性导致崩溃
    if (!appSettings || !currentChatSettings) {
      console.error('PiP generation aborted: settings not ready.');
      logService.error('PiP generation aborted: settings not ready.');
      setPipResponse(language === 'zh' ? '应用配置尚未加载完毕，请稍后再试。' : 'App settings are not ready. Please try again.');
      setPipLoading(false);
      return;
    }
    if (!selectedText.trim()) {
      console.log('Empty selectedText, aborting');
      return;
    }
    
    console.log('Starting PiP generation...');
    setPipLoading(true);
    setPipResponse('');
    
    const abort = new AbortController();
    let isRequestComplete = false;
    
    try {
      // Build a concise instruction based on mode
      const userPrompt = mode === 'explain'
        ? (language === 'zh' ? `请用简洁清晰的语言解释以下选中内容：\n\n${selectedText}` : `Explain the following selected text clearly and concisely:\n\n${selectedText}`)
        : (language === 'zh' ? `请基于以下选中内容，重新组织更好的回答：\n\n${selectedText}` : `Re-answer and improve the response based on the selected text:\n\n${selectedText}`);

      const history = [{ role: 'user' as const, parts: [{ text: userPrompt }] }];
      
      // 关键字段兜底校验
      // 选择与主对话一致的有效 API Key（支持 lockedApiKey/多Key池）
      const keyResult = getKeyForRequest(appSettings, currentChatSettings);
      if ('error' in keyResult) {
        setPipResponse(language === 'zh' ? '未配置可用的 API Key，请在设置中填写后重试。' : 'No usable API key configured. Please set it in Settings.');
        setPipLoading(false);
        return;
      }
      const apiKey = keyResult.key;
      const modelId = currentChatSettings.modelId || appSettings.modelId;
      const systemInstruction = currentChatSettings.systemInstruction || appSettings.systemInstruction;
      const temperature = currentChatSettings.temperature;
      const topP = currentChatSettings.topP;
      if (!modelId) {
        console.error('No model selected');
        setPipResponse(language === 'zh' ? '尚未选择可用模型，请在顶部选择模型后重试。' : 'No model selected. Please choose a model and try again.');
        setPipLoading(false);
        return;
      }

      console.log('About to call sendMessageNonStream with:', { apiKey: apiKey.substring(0, 10) + '...', modelId });

      await new Promise<void>((resolve, reject) => {
        try {
          geminiServiceInstance.sendMessageNonStream(
            apiKey,
            modelId,
            history,
            systemInstruction,
            { temperature, topP },
            false,
            currentChatSettings.thinkingBudget || appSettings.thinkingBudget,
            !!currentChatSettings.isGoogleSearchEnabled,
            !!currentChatSettings.isCodeExecutionEnabled,
            !!currentChatSettings.isUrlContextEnabled,
            abort.signal,
            (err) => {
              logService.error('PiP API error:', err);
              reject(err);
            },
            (parts: Part[]) => {
              try {
                console.log('Received response parts:', parts);
                const text = parts.map(p => p.text || '').join('');
                console.log('Generated text:', text.substring(0, 100) + '...');
                isRequestComplete = true;
                if (!abort.signal.aborted) {
                  setPipResponse(text);
                }
                resolve();
              } catch (processingError) {
                console.error('PiP response processing error:', processingError);
                logService.error('PiP response processing error:', processingError);
                reject(processingError);
              }
            }
          );
        } catch (syncError) {
          logService.error('PiP sync error:', syncError);
          reject(syncError);
        }
      });
    } catch (e) {
      logService.error('PiP generation failed:', e);
      if (!abort.signal.aborted && !isRequestComplete) {
        setPipResponse(language === 'zh' ? '生成失败，请稍后重试（查看控制台了解详情）。' : 'Generation failed. Please try again (see console).');
      }
    } finally {
      if (!abort.signal.aborted) {
        setPipLoading(false);
      }
      // 注意：不要在这里调用 abort.abort()，因为请求可能还在进行中
    }
  }, [appSettings, currentChatSettings, language]);


  const handlePipRequest = useCallback((mode: 'explain' | 'reanswer', selectedText: string) => {
    console.log('PiP Request:', { mode, selectedText, visible: pipVisible });
    setPipMode(mode);
    setPipOriginalText(selectedText);
    setPipVisible(true);
    runPipGeneration(mode, selectedText);
  }, [runPipGeneration, pipVisible]);

  const handlePipAddToChat = useCallback((response: string) => {
    if (!response?.trim()) { setPipVisible(false); return; }
    appendModelMessage(response);
    setPipVisible(false);
  }, [appendModelMessage]);

  const handlePipCancel = useCallback(() => {
    setPipVisible(false);
  }, []);

  const handlePipClose = useCallback(() => {
    setPipVisible(false);
  }, []);

  const handlePipFollowUp = useCallback((follow: string) => {
    if (!follow.trim()) return;
    runPipGeneration('reanswer', `${pipOriginalText}\n\n追问: ${follow}`);
  }, [pipOriginalText, runPipGeneration]);

  // Provide TTS for PiP content, return audio blob URL
  const handlePipTts = useCallback(async (text: string): Promise<string | null> => {
    try {
      // 与主对话一致的有效 Key
      if (!currentChatSettings) return null;
      const keyResult = getKeyForRequest(appSettings, currentChatSettings);
      if ('error' in keyResult) return null;
      const key = keyResult.key;
      const modelId = 'models/gemini-2.5-flash-preview-tts';
      const voice = appSettings.ttsVoice;
      const abort = new AbortController();
      const base64Pcm = await geminiServiceInstance.generateSpeech(key, modelId, text, voice, abort.signal);
      // Convert to WAV URL (reuse util inside hook isn’t exported here; inline a tiny converter)
      const pcm = atob(base64Pcm);
      const pcmBuffer = new Uint8Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) pcmBuffer[i] = pcm.charCodeAt(i);
      // Simple WAV header for 16-bit PCM mono 22.05kHz (service default); fallback
      const sampleRate = 22050; const numChannels = 1; const bitsPerSample = 16;
      const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
      const blockAlign = (numChannels * bitsPerSample) / 8;
      const dataSize = pcmBuffer.byteLength;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);
      const writeString = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      writeString(36, 'data');
      view.setUint32(40, dataSize, true);
      new Uint8Array(buffer, 44).set(pcmBuffer);
      const blob = new Blob([buffer], { type: 'audio/wav' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error('PIP TTS failed', e);
      return null;
    }
  }, [appSettings, currentChatSettings]);
  
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
          onPipRequest={handlePipRequest}
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
          onToggleUrlContext={toggleUrlContext}
          onClearChat={() => handleClearCurrentChat()}
          onNewChat={() => startNewChat()}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onToggleCanvasPrompt={handleLoadCanvasHelperPromptAndSave}
          availableModels={apiModels}
          onSelectModel={(modelId) => setCurrentChatSettings(prev => ({ ...prev, modelId }))}
          onTogglePinCurrentSession={() => activeSessionId && handleTogglePinSession(activeSessionId)}
          onRetryLastTurn={() => {}}
          onEditLastUserMessage={() => {}}
          onAttachmentAction={() => {}}
          setIsHelpModalOpen={() => {}}
          latestModelMessage={(() => {
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'model') return messages[i];
            }
            return null;
          })()}
        />
      </div>
      {/* PiP mini dialog */}
      <PipDialog
        isVisible={pipVisible}
        originalText={pipOriginalText}
        requestType={pipMode}
        response={pipResponse}
        isLoading={pipLoading}
        onConfirm={handlePipAddToChat}
        onCancel={handlePipCancel}
        onClose={handlePipClose}
        onSendFollowUp={handlePipFollowUp}
        onRequestTts={handlePipTts}
        onOpenHtmlPreview={(html, options) => {
          // forward to MessageList’s HTML preview modal by temporary bridge
          // Using a global custom event to avoid ref drilling
          window.dispatchEvent(new CustomEvent('open-html-preview', { detail: { html, options } }));
        }}
        onInsertToInput={(text) => {
          setCommandedInput({ text, id: Date.now() });
          setTimeout(() => {
            const textarea = document.querySelector('textarea[aria-label="Chat message input"]') as HTMLTextAreaElement;
            if (textarea) textarea.focus();
          }, 0);
        }}
      />
    </div>
  );
};

export default App;

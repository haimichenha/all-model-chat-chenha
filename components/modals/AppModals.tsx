import React from 'react';
// import { SettingsModal } from '../SettingsModal';
import { LogViewer } from '../LogViewer';
import { PreloadedMessagesModal } from '../PreloadedMessagesModal';
import { ExportChatModal } from '../ExportChatModal';
import { AppModalsProps } from '../../types';

export const AppModals: React.FC<AppModalsProps> = (props) => {
    const {
        isSettingsModalOpen, setIsSettingsModalOpen, appSettings, availableModels,
        handleSaveSettings, isModelsLoading, modelsLoadingError, clearCacheAndReload,
        isPreloadedMessagesModalOpen, setIsPreloadedMessagesModalOpen, savedScenarios,
        handleSaveAllScenarios, handleLoadPreloadedScenario, handleImportPreloadedScenario,
        handleExportPreloadedScenario,
        isExportModalOpen, setIsExportModalOpen, handleExportChat, exportStatus,
        isLogViewerOpen, setIsLogViewerOpen, currentChatSettings,
        t
    } = props;
    
    return (
        <>
          {isLogViewerOpen && (
            <LogViewer
                isOpen={isLogViewerOpen}
                onClose={() => setIsLogViewerOpen(false)}
                appSettings={appSettings}
                currentChatSettings={currentChatSettings}
            />
          )}
          {/* TODO: Add SettingsModal once props are properly aligned
          {isSettingsModalOpen && (
            <SettingsModal
              isOpen={isSettingsModalOpen}
              onClose={() => setIsSettingsModalOpen(false)}
              currentSettings={appSettings}
              availableModels={availableModels}
              onSave={handleSaveSettings}
              isModelsLoading={isModelsLoading}
              modelsLoadingError={modelsLoadingError}
              onClearAllHistory={clearCacheAndReload}
              onClearCache={clearCacheAndReload}
              onOpenLogViewer={() => setIsLogViewerOpen(true)}
              t={t as any}
            />
          )}
          */}
          {isPreloadedMessagesModalOpen && (
            <PreloadedMessagesModal
              isOpen={isPreloadedMessagesModalOpen}
              onClose={() => setIsPreloadedMessagesModalOpen(false)}
              savedScenarios={savedScenarios}
              onSaveAllScenarios={handleSaveAllScenarios}
              onLoadScenario={handleLoadPreloadedScenario}
              onImportScenario={handleImportPreloadedScenario}
              onExportScenario={handleExportPreloadedScenario}
              t={t as any}
            />
          )}
          {isExportModalOpen && (
              <ExportChatModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExportChat}
                exportStatus={exportStatus}
                t={t}
              />
          )}
        </>
    );
};

export default AppModals;

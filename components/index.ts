// Layout Components
export { ChatArea } from './layout/ChatArea';

// Modal Components  
export { AppModals } from './modals/AppModals';

// Export existing components for backward compatibility
export { ChatInput } from './ChatInput';
export { Header } from './Header';
export { HistorySidebar } from './HistorySidebar';
export { HtmlPreviewModal } from './HtmlPreviewModal';
export { LogViewer } from './LogViewer';
export { MessageList } from './MessageList';
export { PreloadedMessagesModal } from './PreloadedMessagesModal';
export { ScenarioEditor } from './ScenarioEditor';
export { SettingsModal } from './SettingsModal';
export { ExportChatModal } from './ExportChatModal';

// Export types for external use
export type { 
  AppModalsProps,
  ChatAreaProps
} from '../types';

// Chat Input Components Index
export { AddFileByIdInput } from './AddFileByIdInput';
export { AttachmentMenu } from './AttachmentMenu';
export { ChatInputActions } from './ChatInputActions';
export { ChatInputModals } from './ChatInputModals';
export { ChatInputToolbar } from './ChatInputToolbar';
export { SlashCommandMenu } from './SlashCommandMenu';
export { ToolsMenu } from './ToolsMenu';

// Direct exports for problematic components
export { default as HelpModal } from './HelpModal';
export { default as ImagenAspectRatioSelector } from './ImagenAspectRatioSelector';

// Export types for external use
export type { 
  CommandInfo,
  ChatInputModalsProps,
  ChatInputToolbarProps
} from '../../../types';

// Re-export SlashCommandMenu types
export type { Command } from './SlashCommandMenu';

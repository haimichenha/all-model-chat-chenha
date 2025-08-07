import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '../types';
import { logService } from '../utils/appUtils';

interface PiPContextState {
  isContextMenuVisible: boolean;
  contextMenuPosition: { x: number; y: number };
  selectedText: string;
  targetMessageId: string | null;
  isPiPWindowOpen: boolean;
  pipWindowTitle: string;
  pipWindowContent: string;
  isPipLoading: boolean;
  contextAction: 'explain' | 'regenerate' | null;
}

export const usePiPContext = (
  onSendMessage?: (options: { text: string }) => void,
  onUpdateMessage?: (messageId: string, newContent: string) => void
) => {
  const [state, setState] = useState<PiPContextState>({
    isContextMenuVisible: false,
    contextMenuPosition: { x: 0, y: 0 },
    selectedText: '',
    targetMessageId: null,
    isPiPWindowOpen: false,
    pipWindowTitle: '',
    pipWindowContent: '',
    isPipLoading: false,
    contextAction: null
  });

  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle text selection and right-click context menu
  const handleContextMenu = useCallback((
    event: React.MouseEvent,
    messageId: string,
    messageElement: HTMLElement
  ) => {
    event.preventDefault();
    
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (!selectedText || selectedText.length < 3) {
      // If no meaningful text is selected, hide context menu
      setState(prev => ({ ...prev, isContextMenuVisible: false }));
      return;
    }

    // Ensure the selection is within the message content
    const messageContainer = messageElement.closest('[data-message-id]');
    if (!messageContainer || messageContainer.getAttribute('data-message-id') !== messageId) {
      setState(prev => ({ ...prev, isContextMenuVisible: false }));
      return;
    }

    setState(prev => ({
      ...prev,
      isContextMenuVisible: true,
      contextMenuPosition: { x: event.clientX, y: event.clientY },
      selectedText,
      targetMessageId: messageId,
      isPiPWindowOpen: false // Close PiP window if context menu is opened
    }));

    logService.info(`Context menu opened for message ${messageId} with selected text: "${selectedText.substring(0, 50)}..."`);
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setState(prev => ({ ...prev, isContextMenuVisible: false }));
    
    // Clear selection after a short delay to avoid flickering
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }
    selectionTimeoutRef.current = setTimeout(() => {
      window.getSelection()?.removeAllRanges();
    }, 100);
  }, []);

  // Handle "explain" action
  const handleExplain = useCallback(async () => {
    const { selectedText, targetMessageId } = state;
    if (!selectedText || !onSendMessage) return;

    setState(prev => ({
      ...prev,
      isContextMenuVisible: false,
      isPiPWindowOpen: true,
      pipWindowTitle: '文本解释',
      pipWindowContent: '',
      isPipLoading: true,
      contextAction: 'explain'
    }));

    try {
      const explainPrompt = `请解释以下文本的含义和背景：\n\n"${selectedText}"`;
      
      // Send the explanation request through the real message system
      // This will create a new message in the chat with the explanation
      onSendMessage({ text: explainPrompt });
      
      // Set a placeholder content for the PiP window
      setState(prev => ({
        ...prev,
        pipWindowContent: '正在生成对以下文本的解释：\n\n"' + selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : '') + '"\n\n请查看聊天记录中的回复。',
        isPipLoading: false
      }));

      logService.info(`Explanation request sent for selected text from message ${targetMessageId}`);
    } catch (error) {
      logService.error('Error sending explanation request:', error);
      setState(prev => ({
        ...prev,
        pipWindowContent: '抱歉，发送解释请求时出现错误。请重试。',
        isPipLoading: false
      }));
    }
  }, [state, onSendMessage]);

  // Handle "regenerate" action
  const handleRegenerate = useCallback(async () => {
    const { selectedText, targetMessageId } = state;
    if (!selectedText || !onSendMessage) return;

    setState(prev => ({
      ...prev,
      isContextMenuVisible: false,
      isPiPWindowOpen: true,
      pipWindowTitle: '重新生成回答',
      pipWindowContent: '',
      isPipLoading: true,
      contextAction: 'regenerate'
    }));

    try {
      const regeneratePrompt = `请针对以下内容重新生成一个更好的回答：\n\n"${selectedText}"`;
      
      // Send the regeneration request through the real message system
      onSendMessage({ text: regeneratePrompt });
      
      // Set a placeholder content for the PiP window
      setState(prev => ({
        ...prev,
        pipWindowContent: '正在重新生成对以下内容的回答：\n\n"' + selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : '') + '"\n\n请查看聊天记录中的新回复。',
        isPipLoading: false
      }));

      logService.info(`Regeneration request sent for selected text from message ${targetMessageId}`);
    } catch (error) {
      logService.error('Error sending regeneration request:', error);
      setState(prev => ({
        ...prev,
        pipWindowContent: '抱歉，发送重新生成请求时出现错误。请重试。',
        isPipLoading: false
      }));
    }
  }, [state, onSendMessage]);

  // Handle adding the PiP content to the message
  const handleAddPiPContent = useCallback(() => {
    const { pipWindowContent, targetMessageId, contextAction } = state;
    if (!pipWindowContent || !targetMessageId) return;

    // Since we're now sending requests directly through the message system,
    // the "Add" button can be used to close the PiP window and indicate satisfaction
    // with the response that appeared in the chat
    
    setState(prev => ({
      ...prev,
      isPiPWindowOpen: false,
      pipWindowContent: '',
      contextAction: null
    }));

    logService.info(`PiP window closed for message ${targetMessageId} with action ${contextAction}`);
  }, [state]);

  // Handle canceling the PiP window
  const handleCancelPiP = useCallback(() => {
    setState(prev => ({
      ...prev,
      isPiPWindowOpen: false,
      pipWindowContent: '',
      contextAction: null
    }));
  }, []);

  // Add text selection listener for better UX
  const handleTextSelection = useCallback((messageId: string) => {
    // This can be used to provide visual feedback when text is selected
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      logService.debug(`Text selected in message ${messageId}: "${selection.toString().substring(0, 30)}..."`);
    }
  }, []);

  return {
    // Context menu state
    isContextMenuVisible: state.isContextMenuVisible,
    contextMenuPosition: state.contextMenuPosition,
    selectedText: state.selectedText,
    
    // PiP window state
    isPiPWindowOpen: state.isPiPWindowOpen,
    pipWindowTitle: state.pipWindowTitle,
    pipWindowContent: state.pipWindowContent,
    isPipLoading: state.isPipLoading,
    
    // Event handlers
    handleContextMenu,
    closeContextMenu,
    handleExplain,
    handleRegenerate,
    handleAddPiPContent,
    handleCancelPiP,
    handleTextSelection
  };
};
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
  onSendMessage?: (text: string) => void,
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
      
      // For now, we'll simulate the response. In a real implementation,
      // this would call the actual model API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // This is a placeholder - in the actual implementation, you'd integrate with your message sending system
      const mockExplanation = `对于选中的文本"${selectedText.substring(0, 100)}..."的解释：\n\n这是一个示例解释。在实际实现中，这里会显示模型生成的详细解释内容。`;
      
      setState(prev => ({
        ...prev,
        pipWindowContent: mockExplanation,
        isPipLoading: false
      }));

      logService.info(`Explanation generated for selected text from message ${targetMessageId}`);
    } catch (error) {
      logService.error('Error generating explanation:', error);
      setState(prev => ({
        ...prev,
        pipWindowContent: '抱歉，生成解释时出现错误。请重试。',
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
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // This is a placeholder - in the actual implementation, you'd integrate with your message generation system
      const mockRegeneration = `重新生成的回答：\n\n这是对"${selectedText.substring(0, 50)}..."的重新生成内容。在实际实现中，这里会显示模型生成的新回答，可以替换原来的内容。`;
      
      setState(prev => ({
        ...prev,
        pipWindowContent: mockRegeneration,
        isPipLoading: false
      }));

      logService.info(`Regeneration completed for selected text from message ${targetMessageId}`);
    } catch (error) {
      logService.error('Error regenerating content:', error);
      setState(prev => ({
        ...prev,
        pipWindowContent: '抱歉，重新生成内容时出现错误。请重试。',
        isPipLoading: false
      }));
    }
  }, [state, onSendMessage]);

  // Handle adding the PiP content to the message
  const handleAddPiPContent = useCallback(() => {
    const { pipWindowContent, targetMessageId, contextAction } = state;
    if (!pipWindowContent || !targetMessageId) return;

    if (contextAction === 'explain') {
      // For explanations, we might want to send a new message or append to current
      if (onSendMessage) {
        onSendMessage(pipWindowContent);
      }
    } else if (contextAction === 'regenerate' && onUpdateMessage) {
      // For regenerations, update the target message
      onUpdateMessage(targetMessageId, pipWindowContent);
    }

    setState(prev => ({
      ...prev,
      isPiPWindowOpen: false,
      pipWindowContent: '',
      contextAction: null
    }));

    logService.info(`PiP content added for message ${targetMessageId} with action ${contextAction}`);
  }, [state, onSendMessage, onUpdateMessage]);

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
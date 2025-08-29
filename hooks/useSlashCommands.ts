import { useState, useCallback, useMemo } from 'react';
import { Command } from '../components/chat/input/SlashCommandMenu';
import { ModelOption } from '../types';

interface UseSlashCommandsProps {
  inputText: string;
  setInputText: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  availableModels: ModelOption[];
  onSelectModel: (modelId: string) => void;
  onNewChat: () => void;
  onClearChat: () => void;
  onOpenSettings: () => void;
  onTogglePinCurrentSession: () => void;
  onRetryLastTurn: () => void;
  onEditLastUserMessage: () => void;
  onStopGenerating: () => void;
  onToggleGoogleSearch: () => void;
  onToggleCodeExecution: () => void;
  onToggleUrlContext: () => void;
  onToggleCanvasPrompt: () => void;
  onAttachmentAction: () => void;
  onMessageSent: () => void;
  setIsHelpModalOpen: (open: boolean) => void;
  t: (key: string) => string;
}

interface SlashCommandState {
  isOpen: boolean;
  query: string;
  filteredCommands: Command[];
  selectedIndex: number;
}

export const useSlashCommands = ({
  inputText, // 当前输入文本，用于命令处理逻辑
  setInputText,
  textareaRef,
  availableModels,
  onSelectModel,
  onNewChat,
  onClearChat,
  onOpenSettings,
  onTogglePinCurrentSession,
  onRetryLastTurn,
  onEditLastUserMessage,
  onStopGenerating,
  onToggleGoogleSearch,
  onToggleCodeExecution,
  onToggleUrlContext,
  onToggleCanvasPrompt,
  onAttachmentAction,
  onMessageSent,
  setIsHelpModalOpen,
  t,
}: UseSlashCommandsProps) => {
  const [slashCommandState, setSlashCommandState] = useState<SlashCommandState>({
    isOpen: false,
    query: '',
    filteredCommands: [],
    selectedIndex: 0,
  });

  const commands = useMemo<Command[]>(() => [
    { name: 'model', description: t('help_cmd_model') || '切换模型', icon: 'bot', action: () => {
        setInputText('/model ');
        setTimeout(() => {
            const textarea = textareaRef.current;
            if (textarea) {
                textarea.focus();
                const textLength = textarea.value.length;
                textarea.setSelectionRange(textLength, textLength);
            }
        }, 0);
    } },
    { name: 'help', description: t('help_cmd_help') || '显示帮助', icon: 'help', action: () => setIsHelpModalOpen(true) },
    { name: 'edit', description: t('help_cmd_edit') || '编辑最后一条消息', icon: 'edit', action: onEditLastUserMessage },
    { name: 'pin', description: t('help_cmd_pin') || '置顶当前对话', icon: 'pin', action: onTogglePinCurrentSession },
    { name: 'retry', description: t('help_cmd_retry') || '重试最后一次对话', icon: 'retry', action: onRetryLastTurn },
    { name: 'stop', description: t('help_cmd_stop') || '停止生成', icon: 'stop', action: onStopGenerating },
    { name: 'search', description: t('help_cmd_search') || '切换网页搜索', icon: 'search', action: onToggleGoogleSearch },
    { name: 'code', description: t('help_cmd_code') || '切换代码执行', icon: 'code', action: onToggleCodeExecution },
    { name: 'url', description: t('help_cmd_url') || '切换URL上下文', icon: 'url', action: onToggleUrlContext },
    { name: 'file', description: t('help_cmd_file') || '添加文件', icon: 'file', action: onAttachmentAction },
    { name: 'clear', description: t('help_cmd_clear') || '清空对话', icon: 'clear', action: onClearChat },
    { name: 'new', description: t('help_cmd_new') || '新建对话', icon: 'new', action: onNewChat },
    { name: 'settings', description: t('help_cmd_settings') || '打开设置', icon: 'settings', action: onOpenSettings },
    { name: 'canvas', description: t('help_cmd_canvas') || '切换Canvas助手', icon: 'canvas', action: onToggleCanvasPrompt },
  ], [t, onToggleGoogleSearch, onToggleCodeExecution, onToggleUrlContext, onClearChat, onNewChat, onOpenSettings, onToggleCanvasPrompt, onTogglePinCurrentSession, onRetryLastTurn, onStopGenerating, onAttachmentAction, setInputText, textareaRef, setIsHelpModalOpen, onEditLastUserMessage]);
  
  const allCommandsForHelp = useMemo(() => [
    ...commands.map(c => ({ name: `/${c.name}`, description: c.description })),
  ], [commands]);

  const handleCommandSelect = useCallback((command: Command) => {
    if (!command) return;
    
    command.action();
    
    setSlashCommandState({ isOpen: false, query: '', filteredCommands: [], selectedIndex: 0 });

    const commandsThatPopulateInput = ['model', 'edit'];
    // This check prevents clearing the input for commands like /edit or /model
    // and also for the dynamic model selection commands (whose actions handle clearing the input themselves).
    if (!commandsThatPopulateInput.includes(command.name) && !availableModels.some(m => m.name === command.name)) {
        setInputText('');
        onMessageSent();
    }
  }, [onMessageSent, setInputText, availableModels]);
  
  const handleInputChange = (value: string) => {
    // 验证输入文本状态的一致性
    const isConsistent = inputText === value || value.length === 0;
    if (!isConsistent) {
      console.debug('Input text state mismatch:', { inputText, value });
    }
    
    setInputText(value);
  
    if (!value.startsWith('/')) {
      setSlashCommandState(prev => ({ ...prev, isOpen: false }));
      return;
    }
  
    const commandPart = value.split(' ')[0];
    const commandName = commandPart.substring(1).toLowerCase();
  
    if (value.endsWith(' ') && value.trim() === `/${commandName}`) {
      const matchedCommand = commands.find(cmd => cmd.name === commandName);
      if (matchedCommand && matchedCommand.name !== 'model') {
        matchedCommand.action();
        setInputText('');
        onMessageSent();
        setSlashCommandState({ isOpen: false, query: '', filteredCommands: [], selectedIndex: 0 });
        return;
      }
    }
  
    if (!value.includes(' ')) {
      const query = commandPart.substring(1);
      const filtered = commands.filter(cmd => cmd.name.toLowerCase().startsWith(query));
      setSlashCommandState({
        isOpen: filtered.length > 0 && !value.includes(' '),
        query: query,
        filteredCommands: filtered,
        selectedIndex: 0,
      });
    }
  };
  
  const handleSlashCommandExecution = (text: string) => {
    const [commandWithSlash, ...args] = text.split(' ');
    const keyword = args.join(' ').toLowerCase();
    const commandName = commandWithSlash.substring(1);

    if (commandName === 'model' && keyword) {
        const model = availableModels.find(m => m.name.toLowerCase().includes(keyword));
        if (model) {
            onSelectModel(model.id);
            setInputText('');
            onMessageSent();
        }
        return;
    }

    const command = commands.find(cmd => cmd.name === commandName);
    if (command && !keyword) {
        command.action();
        const commandsThatPopulateInput = ['model', 'edit'];
        if (!commandsThatPopulateInput.includes(command.name)) {
            setInputText('');
            onMessageSent();
        }
    }
  };

  const handleKeyNavigation = useCallback((e: React.KeyboardEvent) => {
    const { isOpen, filteredCommands, selectedIndex } = slashCommandState;
    
    if (!isOpen || filteredCommands.length === 0) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSlashCommandState(prev => ({
          ...prev,
          selectedIndex: (selectedIndex + 1) % filteredCommands.length
        }));
        return true;
      case 'ArrowUp':
        e.preventDefault();
        setSlashCommandState(prev => ({
          ...prev,
          selectedIndex: selectedIndex === 0 ? filteredCommands.length - 1 : selectedIndex - 1
        }));
        return true;
      case 'Enter':
        e.preventDefault();
        const selectedCommand = filteredCommands[selectedIndex];
        if (selectedCommand) {
          handleCommandSelect(selectedCommand);
        }
        return true;
      case 'Escape':
        e.preventDefault();
        setSlashCommandState({ isOpen: false, query: '', filteredCommands: [], selectedIndex: 0 });
        return true;
      default:
        return false;
    }
  }, [slashCommandState, handleCommandSelect]);

  return {
    slashCommandState,
    setSlashCommandState,
    allCommandsForHelp,
    handleCommandSelect,
    handleInputChange,
    handleSlashCommandExecution,
    handleKeyNavigation,
  };
};

import { useState } from 'react';
import { Plus, Edit, Trash2, Check, X } from 'lucide-react';
import { SystemPrompt } from '../../types';

interface SystemPromptManagerProps {
  systemPrompts: SystemPrompt[];
  activeSystemPromptId: string | null;
  onSystemPromptsChange: (systemPrompts: SystemPrompt[]) => void;
  onActiveSystemPromptChange: (activeSystemPromptId: string | null) => void;
  t: (key: string) => string;
}

export const SystemPromptManager: React.FC<SystemPromptManagerProps> = ({
  systemPrompts,
  activeSystemPromptId,
  onSystemPromptsChange,
  onActiveSystemPromptChange,
  t
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [editPromptName, setEditPromptName] = useState('');
  const [editPromptText, setEditPromptText] = useState('');

  const handleAddPrompt = () => {
    if (!newPromptName.trim() || !newPromptText.trim()) return;

    const newPrompt: SystemPrompt = {
      id: `prompt_${Date.now()}`,
      name: newPromptName.trim(),
      prompt: newPromptText.trim(),
      isDefault: false
    };

    const updatedPrompts = [...systemPrompts, newPrompt];
    onSystemPromptsChange(updatedPrompts);
    
    setNewPromptName('');
    setNewPromptText('');
    setIsAdding(false);
  };

  const handleEditPrompt = (prompt: SystemPrompt) => {
    setEditingId(prompt.id);
    setEditPromptName(prompt.name);
    setEditPromptText(prompt.prompt);
  };

  const handleSaveEdit = () => {
    if (!editPromptName.trim() || !editPromptText.trim() || !editingId) return;

    const updatedPrompts = systemPrompts.map(prompt => 
      prompt.id === editingId 
        ? { ...prompt, name: editPromptName.trim(), prompt: editPromptText.trim() }
        : prompt
    );
    
    onSystemPromptsChange(updatedPrompts);
    setEditingId(null);
    setEditPromptName('');
    setEditPromptText('');
  };

  const handleDeletePrompt = (promptId: string) => {
    const updatedPrompts = systemPrompts.filter(prompt => prompt.id !== promptId);
    onSystemPromptsChange(updatedPrompts);
    
    // If we deleted the active prompt, clear the active selection
    if (activeSystemPromptId === promptId) {
      onActiveSystemPromptChange(null);
    }
  };

  const handleSetDefault = (promptId: string) => {
    const updatedPrompts = systemPrompts.map(prompt => ({
      ...prompt,
      isDefault: prompt.id === promptId
    }));
    
    onSystemPromptsChange(updatedPrompts);
    onActiveSystemPromptChange(promptId);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewPromptName('');
    setNewPromptText('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditPromptName('');
    setEditPromptText('');
  };

  const handleSelectPrompt = (promptId: string | null) => {
    onActiveSystemPromptChange(promptId);
    
    // 如果有一个选中的提示，可能需要将其内容加载到系统指令字段中
    // 这部分逻辑应该由父组件实现，这里只触发 ID 的改变
  };

  const inputBaseClasses = "w-full p-2 border rounded-md focus:ring-2 focus:border-[var(--theme-border-focus)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] text-sm";
  const enabledInputClasses = "bg-[var(--theme-bg-input)] border-[var(--theme-border-secondary)] focus:ring-[var(--theme-border-focus)]";
  const buttonClasses = "px-3 py-1.5 rounded-md text-sm font-medium transition-colors";
  const primaryButtonClasses = "bg-[var(--theme-bg-accent)] text-[var(--theme-text-on-accent)] hover:bg-[var(--theme-bg-accent-hover)]";
  const secondaryButtonClasses = "bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-secondary-hover)] border border-[var(--theme-border-secondary)]";
  const dangerButtonClasses = "bg-red-500 text-white hover:bg-red-600";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-[var(--theme-text-secondary)]">
          {t('settingsSystemPrompts') || 'System Prompts'}
        </label>
        <button
          onClick={() => setIsAdding(true)}
          className={`${buttonClasses} ${primaryButtonClasses} flex items-center gap-1.5`}
          disabled={isAdding}
        >
          <Plus size={14} />
          {t('addSystemPrompt') || 'Add Prompt'}
        </button>
      </div>

      {/* Add new prompt section */}
      {isAdding && (
        <div className="border border-[var(--theme-border-secondary)] rounded-lg p-4 bg-[var(--theme-bg-secondary)]">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                {t('promptName') || 'Prompt Name'}
              </label>
              <input
                type="text"
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
                className={`${inputBaseClasses} ${enabledInputClasses}`}
                placeholder={t('promptNamePlaceholder') || 'e.g., Creative Writer, Code Reviewer...'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                {t('promptText') || 'Prompt Text'}
              </label>
              <textarea
                value={newPromptText}
                onChange={(e) => setNewPromptText(e.target.value)}
                rows={4}
                className={`${inputBaseClasses} ${enabledInputClasses} resize-y min-h-[80px] custom-scrollbar`}
                placeholder={t('chatBehavior_systemPrompt_placeholder') || 'e.g., You are a helpful AI assistant.'}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancelAdd}
                className={`${buttonClasses} ${secondaryButtonClasses} flex items-center gap-1.5`}
              >
                <X size={14} />
                {t('cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleAddPrompt}
                className={`${buttonClasses} ${primaryButtonClasses} flex items-center gap-1.5`}
                disabled={!newPromptName.trim() || !newPromptText.trim()}
              >
                <Check size={14} />
                {t('save') || 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System prompt selection */}
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
            {t('activeSystemPrompt') || 'Active System Prompt'}
          </label>
          <select
            value={activeSystemPromptId || ''}
            onChange={(e) => handleSelectPrompt(e.target.value || null)}
            className={`${inputBaseClasses} ${enabledInputClasses}`}
          >
            <option value="">{t('noSystemPrompt') || 'No System Prompt'}</option>
            {systemPrompts.map((prompt) => (
              <option key={prompt.id} value={prompt.id}>
                {prompt.name}
                {prompt.isDefault ? ` (${t('default') || 'Default'})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Existing prompts list */}
      {systemPrompts.length > 0 && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--theme-text-secondary)]">
            {t('savedPrompts') || 'Saved Prompts'}
          </label>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {systemPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className={`border rounded-lg p-3 ${
                  activeSystemPromptId === prompt.id
                    ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-accent)] bg-opacity-10'
                    : 'border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]'
                }`}
              >
                {editingId === prompt.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editPromptName}
                      onChange={(e) => setEditPromptName(e.target.value)}
                      className={`${inputBaseClasses} ${enabledInputClasses}`}
                    />
                    <textarea
                      value={editPromptText}
                      onChange={(e) => setEditPromptText(e.target.value)}
                      rows={3}
                      className={`${inputBaseClasses} ${enabledInputClasses} resize-y min-h-[60px] custom-scrollbar`}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={handleCancelEdit}
                        className={`${buttonClasses} ${secondaryButtonClasses} flex items-center gap-1.5`}
                      >
                        <X size={14} />
                        {t('cancel') || 'Cancel'}
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className={`${buttonClasses} ${primaryButtonClasses} flex items-center gap-1.5`}
                        disabled={!editPromptName.trim() || !editPromptText.trim()}
                      >
                        <Check size={14} />
                        {t('save') || 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-[var(--theme-text-primary)]">
                          {prompt.name}
                        </h4>
                        {prompt.isDefault && (
                          <span className="px-2 py-0.5 text-xs bg-[var(--theme-bg-accent)] text-[var(--theme-text-on-accent)] rounded">
                            {t('default') || 'Default'}
                          </span>
                        )}
                        {activeSystemPromptId === prompt.id && (
                          <span className="w-2.5 h-2.5 bg-green-400 bg-opacity-70 rounded-full" title="Active" />
                        )}
                      </div>
                      <div className="flex gap-1">
                        {!prompt.isDefault && (
                          <button
                            onClick={() => handleSetDefault(prompt.id)}
                            className={`${buttonClasses} ${secondaryButtonClasses} text-xs`}
                            title={t('setAsDefault') || 'Set as Default'}
                          >
                            {t('setDefault') || 'Set Default'}
                          </button>
                        )}
                        <button
                          onClick={() => handleEditPrompt(prompt)}
                          className={`${buttonClasses} ${secondaryButtonClasses}`}
                          title={t('edit') || 'Edit'}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeletePrompt(prompt.id)}
                          className={`${buttonClasses} ${dangerButtonClasses}`}
                          title={t('delete') || 'Delete'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-[var(--theme-text-secondary)] whitespace-pre-wrap break-words">
                      {prompt.prompt}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

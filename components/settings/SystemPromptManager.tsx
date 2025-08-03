import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Check, X, Copy } from 'lucide-react';
import { persistentStoreService } from '../../services/persistentStoreService';
import { Modal } from '../shared/Modal';
import { SystemPrompt } from '../../types';

interface SystemPromptManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export const SystemPromptManager: React.FC<SystemPromptManagerProps> = ({
  isOpen,
  onClose,
  onSelectPrompt,
}) => {
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSystemPrompts();
    }
  }, [isOpen]);

  const loadSystemPrompts = () => {
    const prompts = persistentStoreService.getSystemPrompts();
    setSystemPrompts(prompts);
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setNewPrompt('');
  };

  const handleSaveNew = () => {
    if (!newPrompt.trim()) {
      alert('请输入提示词内容');
      return;
    }

    persistentStoreService.addSystemPrompt(newPrompt.trim());
    // 重新加载数据而不是手动添加
    loadSystemPrompts();
    setIsAddingNew(false);
    setNewPrompt('');
  };

  const handleCancelNew = () => {
    setIsAddingNew(false);
    setNewPrompt('');
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditingPrompt(systemPrompts[index].prompt);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    
    if (!editingPrompt.trim()) {
      alert('请输入提示词内容');
      return;
    }

    const oldPrompt = systemPrompts[editingIndex];
    const success = persistentStoreService.updateSystemPrompt(oldPrompt.id, editingPrompt.trim());
    
    if (success) {
      // 重新加载数据而不是手动更新
      loadSystemPrompts();
      setEditingIndex(null);
      setEditingPrompt('');
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingPrompt('');
  };

  const handleDelete = (index: number) => {
    const prompt = systemPrompts[index];
    if (confirm('确定要删除这个系统提示词吗？')) {
      const success = persistentStoreService.removeSystemPrompt(prompt.id);
      if (success) {
        loadSystemPrompts();
      }
    }
  };

  const handleSelect = (prompt: SystemPrompt) => {
    onSelectPrompt(prompt.prompt);
    onClose();
  };

  const handleCopy = async (prompt: SystemPrompt) => {
    try {
      await navigator.clipboard.writeText(prompt.prompt);
      // 这里可以添加一个提示，但为了简单起见我们暂时省略
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-[var(--theme-text-primary)]">系统提示词管理</h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* 添加新提示词按钮 */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-[var(--theme-text-primary)]">
              已保存的系统提示词 ({systemPrompts.length})
            </h3>
            <button
              onClick={handleAddNew}
              disabled={isAddingNew}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--theme-text-link)] rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              添加新提示词
            </button>
          </div>

          {/* 添加新提示词表单 */}
          {isAddingNew && (
            <div className="p-4 border border-[var(--theme-border-secondary)] rounded-lg bg-[var(--theme-bg-secondary)]">
              <h4 className="text-md font-medium text-[var(--theme-text-primary)] mb-3">添加新的系统提示词</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">提示词内容</label>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="输入系统提示词内容..."
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-[var(--theme-border-secondary)] rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent resize-vertical"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveNew}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <Check size={16} />
                    保存
                  </button>
                  <button
                    onClick={handleCancelNew}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] rounded-md hover:bg-[var(--theme-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]"
                  >
                    <X size={16} />
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 提示词列表 */}
          <div className="space-y-3">
            {systemPrompts.length === 0 ? (
              <div className="text-center py-8 text-[var(--theme-text-secondary)]">
                <p>还没有保存任何系统提示词</p>
                <p className="text-sm">点击上方按钮添加第一个提示词</p>
              </div>
            ) : (
              systemPrompts.map((prompt, index) => (
                <div
                  key={index}
                  className="p-4 border border-[var(--theme-border-secondary)] rounded-lg bg-[var(--theme-bg-primary)]"
                >
                  {editingIndex === index ? (
                    // 编辑模式
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1">提示词内容</label>
                        <textarea
                          value={editingPrompt}
                          onChange={(e) => setEditingPrompt(e.target.value)}
                          rows={4}
                          className="w-full px-3 py-2 text-sm border border-[var(--theme-border-secondary)] rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent resize-vertical"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleSaveEdit}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                        >
                          <Check size={14} />
                          保存
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] rounded-md hover:bg-[var(--theme-bg-secondary)]"
                        >
                          <X size={14} />
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    // 显示模式
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="mb-1">
                            <span className="text-xs font-medium text-[var(--theme-text-link)]">
                              {prompt.name}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--theme-text-primary)] whitespace-pre-wrap break-words">
                            {prompt.prompt.length > 200 ? `${prompt.prompt.slice(0, 200)}...` : prompt.prompt}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                          <button
                            onClick={() => handleSelect(prompt)}
                            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md"
                            title="使用此提示词"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => handleCopy(prompt)}
                            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md"
                            title="复制"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            onClick={() => handleEdit(index)}
                            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md"
                            title="编辑"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(index)}
                            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-red-600 hover:bg-red-50 rounded-md"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {prompt.prompt.length > 200 && (
                        <button
                          onClick={() => handleEdit(index)}
                          className="text-xs text-[var(--theme-text-link)] hover:underline"
                        >
                          查看完整内容
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 说明文字 */}
          <div className="mt-6 p-3 bg-[var(--theme-bg-secondary)] rounded-lg">
            <h4 className="text-sm font-medium text-[var(--theme-text-primary)] mb-2">使用说明</h4>
            <ul className="text-sm text-[var(--theme-text-secondary)] space-y-1">
              <li>• 系统提示词会被安全保存，不会被"清除历史"删除</li>
              <li>• 点击"使用"按钮可以直接应用到当前聊天设置</li>
              <li>• 点击"复制"按钮可以复制到剪贴板</li>
              <li>• 可以添加多个不同场景的提示词模板</li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, RefreshCw, X, Plus } from 'lucide-react';
import { getResponsiveValue } from '../../utils/appUtils';
import { geminiServiceInstance } from '../../services/geminiService';
import { logService } from '../../services/logService';
import { Part, ChatHistoryItem } from '../../types';

interface ContextualExplanationPopupProps {
  selectedText: string;
  position: { x: number; y: number };
  onClose: () => void;
  onAddToChat: (explanation: string) => void;
  onRegenerate?: (newText: string) => void;
  currentSystemInstruction?: string;
}

export const ContextualExplanationPopup: React.FC<ContextualExplanationPopupProps> = ({
  selectedText,
  position,
  onClose,
  onAddToChat,
  onRegenerate,
  currentSystemInstruction
}) => {
  const [explanation, setExplanation] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'explain' | 'regenerate' | null>(null);
  const [hasStarted, setHasStarted] = useState<boolean>(false);

  const buttonIconSize = getResponsiveValue(14, 16);

  const handleExplain = useCallback(async () => {
    if (!selectedText.trim()) return;

    setIsLoading(true);
    setError(null);
    setMode('explain');
    setHasStarted(true);

    try {
      const prompt = `请解释以下文本的含义，并提供详细的分析：

"${selectedText}"

请用简洁明了的语言解释这段文本，包括：
1. 主要含义
2. 关键概念
3. 可能的上下文或背景
4. 重要性或意义`;

      const history: ChatHistoryItem[] = [{
        role: 'user',
        parts: [{ text: prompt }]
      }];

      const abortController = new AbortController();
      
      await geminiServiceInstance.sendMessageNonStream(
        '', // Use empty key to use default from settings
        'gemini-2.0-flash-thinking-exp', // Use fast model for explanations
        history,
        currentSystemInstruction || '你是一个专业的文本分析助手，善于解释和分析各种文本内容。',
        {
          temperature: 0.7,
          topP: 0.9
        },
        false, // showThoughts
        0, // thinkingBudget
        false, // isGoogleSearchEnabled
        false, // isCodeExecutionEnabled
        false, // isUrlContextEnabled
        abortController.signal,
        (error: Error) => {
          console.error('Explanation generation failed:', error);
          setError('生成解释时出错: ' + (error.message || '未知错误'));
          setIsLoading(false);
        },
        (parts: Part[]) => {
          const text = parts.map(part => part.text || '').join('');
          if (text.trim()) {
            setExplanation(text);
          } else {
            setError('无法生成解释，请稍后重试');
          }
          setIsLoading(false);
        }
      );
    } catch (err: any) {
      console.error('Explanation generation failed:', err);
      setError('生成解释时出错: ' + (err.message || '未知错误'));
      setIsLoading(false);
    }
  }, [selectedText, currentSystemInstruction]);

  const handleRegenerate = useCallback(async () => {
    if (!selectedText.trim()) return;

    setIsLoading(true);
    setError(null);
    setMode('regenerate');
    setHasStarted(true);

    try {
      const prompt = `请重新改写以下文本，使其更加清晰、准确或有趣：

"${selectedText}"

要求：
1. 保持原意不变
2. 改进表达方式
3. 使语言更生动或专业
4. 确保逻辑清晰`;

      const history: ChatHistoryItem[] = [{
        role: 'user',
        parts: [{ text: prompt }]
      }];

      const abortController = new AbortController();
      
      await geminiServiceInstance.sendMessageNonStream(
        '', // Use empty key to use default from settings
        'gemini-2.0-flash-thinking-exp', // Use fast model for regeneration
        history,
        currentSystemInstruction || '你是一个专业的文本改写助手，善于优化和改进各种文本内容。',
        {
          temperature: 0.8,
          topP: 0.9
        },
        false, // showThoughts
        0, // thinkingBudget
        false, // isGoogleSearchEnabled
        false, // isCodeExecutionEnabled
        false, // isUrlContextEnabled
        abortController.signal,
        (error: Error) => {
          console.error('Text regeneration failed:', error);
          setError('重新生成时出错: ' + (error.message || '未知错误'));
          setIsLoading(false);
        },
        (parts: Part[]) => {
          const text = parts.map(part => part.text || '').join('');
          if (text.trim()) {
            setExplanation(text);
          } else {
            setError('无法重新生成，请稍后重试');
          }
          setIsLoading(false);
        }
      );
    } catch (err: any) {
      console.error('Text regeneration failed:', err);
      setError('重新生成时出错: ' + (err.message || '未知错误'));
      setIsLoading(false);
    }
  }, [selectedText, currentSystemInstruction]);

  const handleAddToChat = () => {
    if (explanation.trim()) {
      onAddToChat(explanation);
      onClose();
    }
  };

  const handleReplaceText = () => {
    if (explanation.trim() && onRegenerate) {
      onRegenerate(explanation);
      onClose();
    }
  };

  // Calculate popup position to keep it on screen
  const getPopupStyle = () => {
    const popup = {
      left: position.x,
      top: position.y,
      maxWidth: 400,
      maxHeight: 300
    };

    // Adjust if popup would go off-screen
    if (popup.left + popup.maxWidth > window.innerWidth) {
      popup.left = window.innerWidth - popup.maxWidth - 20;
    }
    if (popup.top + popup.maxHeight > window.innerHeight) {
      popup.top = position.y - popup.maxHeight - 10;
    }

    return popup;
  };

  const popupStyle = getPopupStyle();

  return (
    <div 
      className="fixed z-50 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg shadow-xl"
      data-contextual-popup
      style={{
        left: popupStyle.left,
        top: popupStyle.top,
        width: popupStyle.maxWidth,
        maxHeight: popupStyle.maxHeight
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--theme-border-primary)]">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[var(--theme-text-link)]" />
          <span className="text-sm font-medium text-[var(--theme-text-primary)]">
            {!hasStarted ? '选择操作' : mode === 'explain' ? '文本解释' : '重新生成'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!hasStarted ? (
            // Mode selection buttons when nothing has started
            <>
              <button
                onClick={handleExplain}
                disabled={isLoading}
                className="px-2 py-1 text-xs bg-[var(--theme-text-link)] text-white rounded hover:bg-[var(--theme-text-link-hover)] transition-colors"
                title="解释文本"
              >
                解释
              </button>
              <button
                onClick={handleRegenerate}
                disabled={isLoading}
                className="px-2 py-1 text-xs bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] border border-[var(--theme-border-primary)] rounded hover:bg-[var(--theme-bg-input)] transition-colors"
                title="重新生成"
              >
                重新生成
              </button>
            </>
          ) : (
            // Action buttons when something has started
            <>
              <button
                onClick={handleExplain}
                disabled={isLoading}
                className={`p-1 rounded transition-colors ${
                  mode === 'explain' 
                    ? 'bg-[var(--theme-text-link)] text-white' 
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)]'
                }`}
                title="解释文本"
              >
                <MessageSquare size={buttonIconSize} />
              </button>
              <button
                onClick={handleRegenerate}
                disabled={isLoading}
                className={`p-1 rounded transition-colors ${
                  mode === 'regenerate' 
                    ? 'bg-[var(--theme-text-link)] text-white' 
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)]'
                }`}
                title="重新生成"
              >
                <RefreshCw size={buttonIconSize} />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)] transition-colors"
            title="关闭"
          >
            <X size={buttonIconSize} />
          </button>
        </div>
      </div>

      {/* Selected text */}
      <div className="p-3 border-b border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]">
        <div className="text-xs text-[var(--theme-text-secondary)] mb-1">选中的文本：</div>
        <div className="text-sm text-[var(--theme-text-primary)] italic max-h-16 overflow-y-auto">
          "{selectedText}"
        </div>
      </div>

      {/* Content */}
      <div className="p-3 max-h-48 overflow-y-auto">
        {!hasStarted ? (
          // Show instructions when no action has been started
          <div className="text-sm text-[var(--theme-text-secondary)] text-center py-4">
            <div className="mb-3">请选择要执行的操作：</div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <MessageSquare size={12} className="text-[var(--theme-text-link)]" />
                <span><strong>解释</strong> - 分析和解释选中文本的含义</span>
              </div>
              <div className="flex items-center gap-2">
                <RefreshCw size={12} className="text-[var(--theme-text-secondary)]" />
                <span><strong>重新生成</strong> - 改写文本使其更清晰或生动</span>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--theme-text-link)] border-t-transparent"></div>
            <span className="ml-2 text-sm text-[var(--theme-text-secondary)]">
              {mode === 'explain' ? '正在生成解释...' : '正在重新生成...'}
            </span>
          </div>
        ) : error ? (
          <div className="text-sm text-[var(--theme-text-error)] bg-[var(--theme-bg-secondary)] p-2 rounded">
            {error}
          </div>
        ) : explanation ? (
          <div className="text-sm text-[var(--theme-text-primary)] whitespace-pre-wrap">
            {explanation}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      {hasStarted && explanation && !isLoading && !error && (
        <div className="flex gap-2 p-3 border-t border-[var(--theme-border-primary)]">
          <button
            onClick={handleAddToChat}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[var(--theme-text-link)] text-white rounded hover:bg-[var(--theme-text-link-hover)] transition-colors text-sm"
          >
            <Plus size={buttonIconSize} />
            添加到聊天
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] rounded hover:bg-[var(--theme-bg-input)] transition-colors text-sm"
          >
            取消
          </button>
        </div>
      )}
      {/* Show cancel button when no action has been started */}
      {!hasStarted && (
        <div className="flex justify-end p-3 border-t border-[var(--theme-border-primary)]">
          <button
            onClick={onClose}
            className="px-3 py-2 bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] rounded hover:bg-[var(--theme-bg-input)] transition-colors text-sm"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
};
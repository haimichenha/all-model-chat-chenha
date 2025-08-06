import React, { useState, useEffect } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types';
import { MessageContent } from './message/MessageContent';

interface PipDialogProps {
  isVisible: boolean;
  originalText: string;
  requestType: 'explain' | 'reanswer';
  response?: string;
  isLoading?: boolean;
  onConfirm: (response: string) => void;
  onCancel: () => void;
  onClose: () => void;
}

export const PipDialog: React.FC<PipDialogProps> = ({
  isVisible,
  originalText,
  requestType,
  response,
  isLoading = false,
  onConfirm,
  onCancel,
  onClose
}) => {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  if (!isVisible) return null;

  const title = requestType === 'explain' ? '内容解释' : '重新回答';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-start justify-start">
      <div
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl w-96 max-w-[90vw] max-h-[80vh] flex flex-col"
        style={{ left: position.x, top: position.y, position: 'absolute' }}
      >
        {/* Title Bar - Draggable */}
        <div
          className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 cursor-move flex items-center justify-between"
          onMouseDown={handleMouseDown}
        >
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Original Text */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">原文内容:</p>
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-sm max-h-24 overflow-y-auto">
              {originalText}
            </div>
          </div>

          {/* Response Area */}
          <div className="flex-1 p-4 overflow-y-auto">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {requestType === 'explain' ? 'AI 解释:' : '重新回答:'}
            </p>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin mr-2" size={20} />
                <span className="text-gray-500">正在生成回答...</span>
              </div>
            ) : response ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="text-sm whitespace-pre-wrap">{response}</div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm italic">等待响应...</div>
            )}
          </div>

          {/* Action Buttons */}
          {response && !isLoading && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={() => onConfirm(response)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={16} />
                添加到对话
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
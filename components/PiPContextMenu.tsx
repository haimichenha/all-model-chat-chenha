import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, RotateCw, X, Plus } from 'lucide-react';

interface ContextMenuProps {
  isVisible: boolean;
  position: { x: number; y: number };
  selectedText: string;
  onClose: () => void;
  onExplain: () => void;
  onRegenerate: () => void;
}

interface PiPContextWindowProps {
  isOpen: boolean;
  title: string;
  content: string;
  isLoading: boolean;
  onAdd: () => void;
  onCancel: () => void;
  position?: { x: number; y: number };
}

// Context Menu Component
export const ContextMenu: React.FC<ContextMenuProps> = ({
  isVisible,
  position,
  selectedText,
  onClose,
  onExplain,
  onRegenerate
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  // Ensure menu stays within viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 220),
    y: Math.min(position.y, window.innerHeight - 120)
  };

  const truncatedText = selectedText.length > 50 
    ? selectedText.substring(0, 50) + '...' 
    : selectedText;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-2 min-w-[200px]"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`
      }}
    >
      <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
        对选中文本的操作
      </div>
      <div className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 mx-2 mt-2 rounded overflow-hidden">
        "{truncatedText}"
      </div>
      
      <button
        onClick={onExplain}
        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
      >
        <MessageSquare size={16} />
        让模型解释这段文本
      </button>
      
      <button
        onClick={onRegenerate}
        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
      >
        <RotateCw size={16} />
        重新生成这段回答
      </button>
    </div>
  );
};

// Picture-in-Picture Context Window Component
export const PiPContextWindow: React.FC<PiPContextWindowProps> = ({
  isOpen,
  title,
  content,
  isLoading,
  onAdd,
  onCancel,
  position
}) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [windowPosition, setWindowPosition] = useState(
    position || { x: window.innerWidth - 420, y: 100 }
  );
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === windowRef.current?.querySelector('.drag-handle')) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - windowPosition.x,
        y: e.clientY - windowPosition.y
      };
    }
  }, [windowPosition]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = Math.max(0, Math.min(
        e.clientX - dragStartRef.current.x, 
        window.innerWidth - 400
      ));
      const newY = Math.max(0, Math.min(
        e.clientY - dragStartRef.current.y, 
        window.innerHeight - 300
      ));
      setWindowPosition({ x: newX, y: newY });
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!isOpen) return null;

  return (
    <div
      ref={windowRef}
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-2xl w-96 max-h-[600px] flex flex-col"
      style={{
        left: `${windowPosition.x}px`,
        top: `${windowPosition.y}px`
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="drag-handle flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-move select-none">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {title}
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto min-h-[200px] max-h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-300">正在处理...</span>
          </div>
        ) : (
          <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
            {content}
          </div>
        )}
      </div>

      {/* Footer */}
      {!isLoading && (
        <div className="flex items-center justify-end gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-b-lg border-t border-gray-200 dark:border-gray-600">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          >
            取消
          </button>
          <button
            onClick={onAdd}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded transition-colors flex items-center gap-1"
          >
            <Plus size={14} />
            添加
          </button>
        </div>
      )}
    </div>
  );
};
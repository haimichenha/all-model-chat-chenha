import React, { useState, useEffect } from 'react';
import { MessageSquare, RefreshCw, X } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  selectedText: string;
  onExplain: (text: string) => void;
  onReAnswer: (text: string) => void;
  onClose: () => void;
  isVisible: boolean;
}

export const MessageContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  selectedText,
  onExplain,
  onReAnswer,
  onClose,
  isVisible
}) => {
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    if (!isVisible) return;

    // Adjust position if menu would go off screen
    const menuWidth = 200;
    const menuHeight = 120;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + menuWidth > windowWidth) {
      adjustedX = windowWidth - menuWidth - 10;
    }

    if (y + menuHeight > windowHeight) {
      adjustedY = y - menuHeight - 10;
    }

    setPosition({ x: adjustedX, y: adjustedY });
  }, [x, y, isVisible]);

  if (!isVisible || !selectedText) return null;

  const handleExplain = () => {
    onExplain(selectedText);
    onClose();
  };

  const handleReAnswer = () => {
    onReAnswer(selectedText);
    onClose();
  };

  return (
    <div
      className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-[9999] min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      <div className="py-2">
        <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
          选中内容
        </div>
        <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 max-h-20 overflow-hidden">
          {selectedText.length > 50 ? `${selectedText.substring(0, 50)}...` : selectedText}
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-1">
          <button
            onClick={handleExplain}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <MessageSquare size={14} />
            解释这段内容
          </button>
          <button
            onClick={handleReAnswer}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <RefreshCw size={14} />
            重新回答
          </button>
          <button
            onClick={onClose}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-500"
          >
            <X size={14} />
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
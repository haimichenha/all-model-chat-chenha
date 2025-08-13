import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, RefreshCw, X } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  selectedText: string;
  onExplain: (text: string) => void;
  onReAnswer: (text: string) => void;
  onClose: () => void;
  isVisible: boolean;
  onInteractStart?: () => void;
  onInteractEnd?: () => void;
}

export const MessageContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  selectedText,
  onExplain,
  onReAnswer,
  onClose,
  isVisible,
  onInteractStart,
  onInteractEnd
}) => {
  const [position, setPosition] = useState({ x, y });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isVisible) return;
    // 下一帧测量菜单实际尺寸再定位，优先放在锚点(x,y)下方并水平居中
    const tick = () => {
      const menuEl = menuRef.current;
      const vw = window.innerWidth; const vh = window.innerHeight;
      const margin = 8;
      let mw = 200, mh = 120;
      if (menuEl) {
        const rect = menuEl.getBoundingClientRect();
        mw = Math.ceil(rect.width || mw);
        mh = Math.ceil(rect.height || mh);
      }
      let left = Math.round(x - mw / 2);
      let top = Math.round(y + margin);
      // 如果下方放不下，放到上方
      if (top + mh + margin > vh) top = Math.round(y - mh - margin);
      // 边界修正
      if (left + mw + margin > vw) left = vw - mw - margin;
      if (left < margin) left = margin;
      if (top < margin) top = margin;
      setPosition({ x: left, y: top });
    };
    // 先设置一个初始位置，随后测量矫正
    setPosition({ x: Math.max(8, x - 100), y: Math.max(8, y + 8) });
    const id = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(id);
  }, [x, y, isVisible]);

  if (!isVisible || !selectedText) return null;

  const handleExplain = (e?: React.MouseEvent) => {
    try {
      e?.preventDefault();
      e?.stopPropagation();
      onExplain(selectedText);
      onClose();
    } catch (error) {
      console.error('Error in handleExplain:', error);
      onClose();
    }
  };

  const handleReAnswer = (e?: React.MouseEvent) => {
    try {
      e?.preventDefault();
      e?.stopPropagation();
      onReAnswer(selectedText);
      onClose();
    } catch (error) {
      console.error('Error in handleReAnswer:', error);
      onClose();
    }
  };

  const content = (
    <div
      className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-[9999] min-w-[180px]"
      ref={menuRef}
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="消息选中文本菜单"
      onMouseDown={(e) => { e.stopPropagation(); onInteractStart?.(); }}
      onMouseEnter={() => onInteractStart?.()}
      onMouseLeave={() => onInteractEnd?.()}
      onClick={(e) => { e.stopPropagation(); }}
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
            type="button"
            onClick={handleExplain}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <MessageSquare size={14} />
            解释这段内容
          </button>
          <button
            type="button"
            onClick={handleReAnswer}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <RefreshCw size={14} />
            重新回答
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-500"
          >
            <X size={14} />
            取消
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
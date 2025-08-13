import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Loader2, Send, ClipboardCopy, Check, Volume2, ImageIcon, FileCode2, Expand, Maximize2 } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import html2canvas from 'html2canvas';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
// no-op

interface PipDialogProps {
  isVisible: boolean;
  originalText: string;
  requestType: 'explain' | 'reanswer';
  response?: string;
  isLoading?: boolean;
  onConfirm: (response: string) => void;
  onCancel: () => void;
  onClose: () => void;
  onSendFollowUp?: (message: string) => void; // New prop for follow-up questions
  onRequestTts?: (text: string) => Promise<string | null>;
  onOpenHtmlPreview?: (html: string, options?: { initialTrueFullscreen?: boolean }) => void;
  onInsertToInput?: (text: string) => void;
}

export const PipDialog: React.FC<PipDialogProps> = ({
  isVisible,
  originalText,
  requestType,
  response,
  isLoading = false,
  onConfirm,
  onCancel,
  onClose,
  onSendFollowUp,
  onRequestTts,
  onOpenHtmlPreview,
  onInsertToInput
}) => {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 384, height: 480 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [followUpInput, setFollowUpInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // restore position/size
  useEffect(() => {
    try {
      const p = localStorage.getItem('pipDialog.position');
      const s = localStorage.getItem('pipDialog.size');
      if (p) {
        const parsed = JSON.parse(p);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && isFinite(parsed.x) && isFinite(parsed.y)) {
          setPosition({ x: parsed.x, y: parsed.y });
        }
      }
      if (s) {
        const parsed = JSON.parse(s);
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number' && isFinite(parsed.width) && isFinite(parsed.height)) {
          // 兜底：避免恢复到 0 或过小尺寸
          const w = Math.max(200, parsed.width);
          const h = Math.max(180, parsed.height);
          setSize({ width: w, height: h });
        }
      }
    } catch {}
  }, []);

  // 当对话框可见或尺寸/位置发生变化时，强制钳制到视口内并应用合理的最小尺寸
  useEffect(() => {
    if (!isVisible) return;
    const margin = 8;
    const vw = window.innerWidth; const vh = window.innerHeight;
    const minW = 280; const minH = 220;
    const maxW = Math.max(minW, vw - margin * 2);
    const maxH = Math.max(minH, vh - margin * 2);
    const w = Math.min(Math.max(size.width || minW, minW), maxW);
    const h = Math.min(Math.max(size.height || minH, minH), maxH);
    let x = Number.isFinite(position.x) ? position.x : margin;
    let y = Number.isFinite(position.y) ? position.y : margin;
    if (x + w + margin > vw) x = vw - w - margin;
    if (y + h + margin > vh) y = vh - h - margin;
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    if (x !== position.x || y !== position.y) setPosition({ x, y });
    if (w !== size.width || h !== size.height) setSize({ width: w, height: h });
  }, [isVisible, size.width, size.height, position.x, position.y]);

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
    try { localStorage.setItem('pipDialog.position', JSON.stringify(position)); } catch {}
    // Persist current size if user resized via CSS resizer
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const newSize = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setSize(newSize);
      try { localStorage.setItem('pipDialog.size', JSON.stringify(newSize)); } catch {}
    }

    // Clamp to viewport and optionally snap to edges
    const margin = 8;
    const vw = window.innerWidth; const vh = window.innerHeight;
    let nx = Math.max(margin, Math.min(position.x, vw - (size.width + margin)));
    let ny = Math.max(margin, Math.min(position.y, vh - (size.height + margin)));
    const snap = 12;
    if (Math.abs(nx - margin) < snap) nx = margin;
    if (Math.abs((vw - (nx + size.width)) - margin) < snap) nx = vw - (size.width + margin);
    if (Math.abs(ny - margin) < snap) ny = margin;
    if (Math.abs((vh - (ny + size.height)) - margin) < snap) ny = vh - (size.height + margin);
    if (nx !== position.x || ny !== position.y) {
      setPosition({ x: nx, y: ny });
      try { localStorage.setItem('pipDialog.position', JSON.stringify({ x: nx, y: ny })); } catch {}
    }
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

  const handleFollowUpSend = () => {
    if (followUpInput.trim() && onSendFollowUp) {
      onSendFollowUp(followUpInput.trim());
      setFollowUpInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFollowUpSend();
    }
  };

  // Global shortcuts when visible
  useEffect(() => {
    if (!isVisible) return;
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'enter' && response && !isLoading) {
        e.preventDefault(); onConfirm(response);
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [isVisible, response, isLoading, onClose, onConfirm]);

  if (!isVisible) return null;

  const title = requestType === 'explain' ? '内容解释' : '重新回答';

  const sanitizedHtml = useMemo(() => {
    if (!response) return '';
    try {
      const raw = marked.parse(response);
      return DOMPurify.sanitize(raw as string);
    } catch {
      return '';
    }
  }, [response]);

  const handleCopy = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleExportHtml = () => {
    if (!sanitizedHtml) return;
    const fullHtml = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>PiP Export</title></head><body><div class="markdown-body" style="padding:16px;max-width:900px;margin:auto">${sanitizedHtml}</div></body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pip-export.html';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPng = async () => {
    if (!sanitizedHtml) return;
    const temp = document.createElement('div');
    temp.style.position = 'fixed';
    temp.style.left = '-10000px';
    temp.style.top = '0';
    temp.style.width = '840px';
    temp.style.padding = '20px';
    temp.style.background = '#fff';
    temp.innerHTML = `<div class="markdown-body">${sanitizedHtml}</div>`;
    document.body.appendChild(temp);
    // wait images
    const imgs = Array.from(temp.querySelectorAll('img')) as HTMLImageElement[];
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = img.onerror = () => res(undefined); })));
    const canvas = await html2canvas(temp, { useCORS: true, scale: 2 });
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href = dataUrl; a.download = 'pip-export.png'; a.click();
    document.body.removeChild(temp);
  };

  const handleFitWindow = () => {
    const w = Math.min(Math.floor(window.innerWidth * 0.9), 720);
    const h = Math.min(Math.floor(window.innerHeight * 0.8), 640);
    setSize({ width: w, height: h });
    try { localStorage.setItem('pipDialog.size', JSON.stringify({ width: w, height: h })); } catch {}
  };

  const handleTts = async () => {
    if (!onRequestTts || !response) return;
    setIsTtsLoading(true);
    try {
      const url = await onRequestTts(response);
      if (url) setAudioUrl(url);
    } catch {}
    finally { setIsTtsLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-[9998] flex items-start justify-start" role="dialog" aria-modal="true">
      <div
        ref={containerRef}
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl flex flex-col"
  style={{ left: position.x, top: position.y, position: 'absolute', width: `${size.width}px`, height: `${size.height}px`, minWidth: '280px', minHeight: '220px', maxWidth: '90vw', maxHeight: '80vh', resize: 'both', overflow: 'hidden' }}
        onMouseUp={handleMouseUp}
      >
        {/* Title Bar - Draggable */}
        <div
          className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 cursor-move flex items-center justify-between select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2" onDoubleClick={handleFitWindow}>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button type="button" onClick={handleFitWindow} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="适应窗口">
              <Expand size={16} />
            </button>
            <button type="button" onClick={() => setIsCollapsed(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title={isCollapsed ? '展开' : '折叠'}>
              {isCollapsed ? <Maximize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {response && (
              <>
                <button type="button" onClick={handleCopy} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title={copied ? '已复制' : '复制文本'}>
                  {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
                </button>
                {onRequestTts && (
                  <button type="button" onClick={handleTts} disabled={isTtsLoading} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50" title="朗读">
                    {isTtsLoading ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                  </button>
                )}
                <button type="button" onClick={handleExportPng} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="导出 PNG"><ImageIcon size={16} /></button>
                <button type="button" onClick={handleExportHtml} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="导出 HTML"><FileCode2 size={16} /></button>
                {onOpenHtmlPreview && (
                  <button type="button" onClick={() => onOpenHtmlPreview(`<!DOCTYPE html><html><head><meta charset='utf-8'><title>预览</title></head><body><div class='markdown-body' style='padding:12px'>${sanitizedHtml}</div></body></html>`, { initialTrueFullscreen: false })} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="HTML 预览"><Maximize2 size={16} /></button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

  {/* Content */}
  <div className={`flex-1 overflow-hidden flex flex-col ${isCollapsed ? 'hidden' : ''}`}>
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
                <div className="markdown-body text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}>
                    {response}
                  </ReactMarkdown>
                </div>
                {audioUrl && (
                  <div className="mt-3">
                    <audio src={audioUrl} controls className="w-full h-9" />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm italic">等待响应...</div>
            )}
          </div>

          {/* Action Buttons */}
          {response && !isLoading && !isCollapsed && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
              {/* Follow-up input */}
              {onSendFollowUp && (
                <div className="space-y-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">追问:</label>
                  <div className="flex gap-2">
                    <textarea
                      value={followUpInput}
                      onChange={(e) => setFollowUpInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="继续对话..."
                      className="flex-1 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
                      rows={2}
                    />
                    <button
                      type="button"
                      onClick={handleFollowUpSend}
                      disabled={!followUpInput.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              )}
              
              {/* Original buttons */}
              <div className="flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onInsertToInput && response && onInsertToInput(response)}
                  className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                  title="复制到输入框"
                >复制到输入框</button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => onConfirm(response)}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus size={16} />
                  添加到对话
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Loader2, ChevronDown, Sigma } from 'lucide-react';

import { ChatMessage, UploadedFile } from '../../types';
import { FileDisplay } from './FileDisplay';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';
import { GraphvizBlock } from './GraphvizBlock';
import { translations } from '../../utils/appUtils';
import { GroundedResponse } from './GroundedResponse';
import { MessageContextMenu } from '../MessageContextMenu';

const renderThoughtsMarkdown = (content: string) => {
  const rawMarkup = marked.parse(content || ''); 
  const cleanMarkup = DOMPurify.sanitize(rawMarkup as string);
  return { __html: cleanMarkup };
};

const MessageTimer: React.FC<{ startTime?: Date; endTime?: Date; isLoading?: boolean }> = ({ startTime, endTime, isLoading }) => {
  const [elapsedTime, setElapsedTime] = useState<string>('');
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (isLoading && startTime instanceof Date) {
      const updateTimer = () => setElapsedTime(`${((new Date().getTime() - startTime.getTime()) / 1000).toFixed(1)}s`);
      updateTimer();
      intervalId = setInterval(updateTimer, 200);
    } else if (!isLoading && startTime instanceof Date && endTime instanceof Date) {
      setElapsedTime(`${((endTime.getTime() - startTime.getTime()) / 1000).toFixed(1)}s`);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [startTime, endTime, isLoading]);

  if (!elapsedTime && !(isLoading && startTime)) return null;
  return <span className="text-xs text-[var(--theme-text-tertiary)] font-light tabular-nums pt-0.5 flex items-center">{isLoading && startTime && <Loader2 size={10} className="animate-spin mr-1" />} {elapsedTime || "0.0s"}</span>;
};

const TokenDisplay: React.FC<{ message: ChatMessage; t: (key: keyof typeof translations) => string }> = ({ message, t }) => {
  if (message.role !== 'model' || (!message.promptTokens && !message.completionTokens && !message.cumulativeTotalTokens)) return null;
  const parts = [
    typeof message.promptTokens === 'number' && `Input: ${message.promptTokens}`,
    typeof message.completionTokens === 'number' && `Output: ${message.completionTokens}`,
    typeof message.cumulativeTotalTokens === 'number' && `Total: ${message.cumulativeTotalTokens}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className="text-xs text-[var(--theme-text-tertiary)] font-light tabular-nums pt-0.5 flex items-center" title="Token Usage"><Sigma size={10} className="mr-1.5 opacity-80" />{parts.join(' | ')}<span className="ml-1">{t('tokens_unit')}</span></span>;
};

interface MessageContentProps {
    message: ChatMessage;
    onImageClick: (file: UploadedFile) => void;
    onOpenHtmlPreview: (html: string, options?: { initialTrueFullscreen?: boolean }) => void;
    showThoughts: boolean;
    baseFontSize: number;
    expandCodeBlocksByDefault: boolean;
    t: (key: keyof typeof translations) => string;
    onPipRequest?: (text: string, type: 'explain' | 'reanswer') => void; // New prop for PiP requests
}

export const MessageContent: React.FC<MessageContentProps> = React.memo(({ message, onImageClick, onOpenHtmlPreview, showThoughts, baseFontSize, expandCodeBlocksByDefault, t, onPipRequest }) => {
    const { content, files, isLoading, thoughts, generationStartTime, generationEndTime, audioSrc, groundingMetadata } = message;
    
    // Context menu state
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        selectedText: string;
        isVisible: boolean;
    }>({ x: 0, y: 0, selectedText: '', isVisible: false });
    
    const showPrimaryThinkingIndicator = isLoading && !content && !audioSrc && (!showThoughts || !thoughts);
    const areThoughtsVisible = message.role === 'model' && thoughts && showThoughts;

    const codeBlockCounter = useRef(0);
    useEffect(() => {
      codeBlockCounter.current = 0; // Reset on each render of message content
    });

    // Handle right-click on content to show context menu (only for model messages)
    const handleContextMenu = (e: React.MouseEvent) => {
        // Only show context menu for AI model responses
        if (message.role !== 'model' || !onPipRequest) {
            return;
        }
        
        e.preventDefault();
        
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim() || '';
        
        if (selectedText && selectedText.length > 0) {
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                selectedText,
                isVisible: true
            });
        } else {
            // If no text is selected but right-clicked, try to get text around the click position
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
                const node = range.startContainer;
                if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                    // Select the word or sentence around the cursor
                    const textContent = node.textContent;
                    const offset = range.startOffset;
                    
                    // Find word boundaries
                    let start = offset;
                    let end = offset;
                    
                    // Expand backwards to find start of word/sentence
                    while (start > 0 && !/[\s.,!?;:]/.test(textContent[start - 1])) {
                        start--;
                    }
                    
                    // Expand forwards to find end of word/sentence
                    while (end < textContent.length && !/[\s.,!?;:]/.test(textContent[end])) {
                        end++;
                    }
                    
                    const contextText = textContent.substring(start, end).trim();
                    if (contextText.length > 0) {
                        setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            selectedText: contextText,
                            isVisible: true
                        });
                    }
                }
            }
        }
    };

    const handleContextMenuClose = () => {
        setContextMenu(prev => ({ ...prev, isVisible: false }));
    };

    const handleExplain = (text: string) => {
        onPipRequest?.(text, 'explain');
    };

    const handleReAnswer = (text: string) => {
        onPipRequest?.(text, 'reanswer');
    };

    // Close context menu when clicking elsewhere
    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu.isVisible) {
                handleContextMenuClose();
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [contextMenu.isVisible]);

    const lastThought = useMemo(() => {
        if (!thoughts) return null;

        const lines = thoughts.trim().split('\n');
        let lastHeadingIndex = -1;
        let lastHeading = '';

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            // Check for ## or ### headings
            if (line.startsWith('## ') || line.startsWith('### ')) {
                lastHeadingIndex = i;
                lastHeading = line.replace(/^[#]+\s*/, '').trim();
                break;
            }
            // Check for lines that are entirely bolded (e.g., **Title**)
            if ((line.startsWith('**') && line.endsWith('**') && !line.slice(2, -2).includes('**')) || 
                (line.startsWith('__') && line.endsWith('__') && !line.slice(2, -2).includes('__'))) {
                lastHeadingIndex = i;
                // Remove the bold markers from the start and end
                lastHeading = line.substring(2, line.length - 2).trim();
                break;
            }
        }

        if (lastHeadingIndex === -1) {
             const content = lines.slice(-5).join('\n').trim();
             return { title: 'Latest thought', content };
        }
        
        const contentLines = lines.slice(lastHeadingIndex + 1);
        const content = contentLines.filter(l => l.trim() !== '').join('\n').trim();

        return { title: lastHeading, content };
    }, [thoughts]);

    const components = useMemo(() => ({
      pre: (props: any) => {
        const { node, ...rest } = props;
        const children = (props.children[0] && props.children[0].type === 'code') ? props.children[0] : props.children;
        
        // 检查是否为代码块
        if (children && children.props && children.props.className) {
          const className = children.props.className;
          const code = children.props.children?.[0] || '';
          
          // 检测 Mermaid 图表
          if (className.includes('language-mermaid') && typeof code === 'string') {
            return <MermaidBlock code={code.trim()} />;
          }
          
          // 检测 Graphviz/DOT 图表
          if ((className.includes('language-dot') || className.includes('language-graphviz')) && typeof code === 'string') {
            return <GraphvizBlock code={code.trim()} />;
          }
        }
        
        // 普通代码块
        return <CodeBlock {...rest} onOpenHtmlPreview={onOpenHtmlPreview} expandCodeBlocksByDefault={expandCodeBlocksByDefault}>{children}</CodeBlock>;
      }
    }), [onOpenHtmlPreview, expandCodeBlocksByDefault]);

    return (
        <>
            {files && files.length > 0 && (
                <div className={`space-y-2 ${content || audioSrc ? 'mb-1.5 sm:mb-2' : ''}`}>
                    {files.map((file) => <FileDisplay key={file.id} file={file} onImageClick={onImageClick} isFromMessageList={true} />)}
                </div>
            )}
            
            {areThoughtsVisible && (
                <details className="mb-1.5 p-2 rounded-lg bg-[var(--theme-bg-tertiary)] bg-opacity-50 border border-[var(--theme-border-secondary)] group">
                    <summary className="flex flex-col cursor-pointer text-sm font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] list-none">
                        <div className="flex items-center justify-between w-full">
                            <span className="flex items-center">
                                {message.thinkingTimeMs !== undefined ? (
                                    t('thinking_took_time').replace('{seconds}', Math.round(message.thinkingTimeMs / 1000).toString())
                                ) : isLoading ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin mr-1.5" />
                                        {t('thinking_text')}
                                    </>
                                ) : (
                                    'Thinking finished' // Fallback
                                )}
                            </span>
                            <ChevronDown size={16} className="text-[var(--theme-text-tertiary)] group-open:rotate-180 transition-transform"/>
                        </div>
                        {isLoading && lastThought && (
                            <div className="group-open:hidden mt-2 text-left w-full pr-4">
                               <h4 className="font-semibold text-[var(--theme-bg-model-message-text)] text-sm">
                                   {lastThought.title}
                               </h4>
                               <p className="text-xs text-[var(--theme-text-tertiary)] mt-1 line-clamp-3">
                                   {lastThought.content}
                               </p>
                            </div>
                        )}
                    </summary>
                    <div className="mt-2 pt-2 border-t border-[var(--theme-border-secondary)] text-xs text-[var(--theme-text-secondary)] markdown-body" dangerouslySetInnerHTML={renderThoughtsMarkdown(thoughts)} />
                </details>
            )}

            {showPrimaryThinkingIndicator && (
                <div className="flex items-center text-sm text-[var(--theme-bg-model-message-text)] py-0.5">
                    <Loader2 size={16} className="animate-spin mr-2 text-[var(--theme-bg-accent)]" /> {t('thinking_text')}
                </div>
            )}

            {content && groundingMetadata ? (
              <GroundedResponse text={content} metadata={groundingMetadata} onOpenHtmlPreview={onOpenHtmlPreview} />
            ) : content && (
                <div 
                    className="markdown-body" 
                    style={{ fontSize: `${baseFontSize}px` }}
                    onContextMenu={handleContextMenu}
                    onMouseUp={(e) => {
                        // Don't clear selection on right-click
                        if (e.button === 2) return;
                        
                        // Clear selection when context menu is not shown and it's a normal left-click
                        if (!contextMenu.isVisible) {
                            setTimeout(() => {
                                const selection = window.getSelection();
                                if (selection && selection.rangeCount > 0) {
                                    selection.removeAllRanges();
                                }
                            }, 100);
                        }
                    }}
                > 
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]} components={components}>
                        {content}
                    </ReactMarkdown>
                </div>
            )}
            
            {audioSrc && (
                <div className="mt-2">
                    <audio src={audioSrc} controls autoPlay className="w-full h-10" />
                </div>
            )}
            
            {(message.role === 'model' || (message.role === 'error' && generationStartTime)) && (
                <div className="mt-1 sm:mt-1.5 flex justify-end items-center gap-2 sm:gap-3">
                    <TokenDisplay message={message} t={t} />
                    {(isLoading || (generationStartTime && generationEndTime)) && <MessageTimer startTime={generationStartTime} endTime={generationEndTime} isLoading={isLoading} />}
                </div>
            )}
            
            {/* Context Menu */}
            <MessageContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                selectedText={contextMenu.selectedText}
                onExplain={handleExplain}
                onReAnswer={handleReAnswer}
                onClose={handleContextMenuClose}
                isVisible={contextMenu.isVisible}
            />
        </>
    );
});
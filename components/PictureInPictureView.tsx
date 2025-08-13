import React, { useRef } from 'react';
import { UploadedFile, ChatMessage, ThemeColors } from '../types';
import { MessageList } from './MessageList';

interface PictureInPictureViewProps {
    messages: ChatMessage[];
    t: (key: string) => string;
    themeColors: ThemeColors;
    baseFontSize: number;
    expandCodeBlocksByDefault: boolean;
    showThoughts: boolean;
    language: 'en' | 'zh';
    themeId: string;
}

export const PictureInPictureView: React.FC<PictureInPictureViewProps> = ({
    messages,
    t,
    themeColors,
    baseFontSize,
    expandCodeBlocksByDefault,
    showThoughts,
    language,
    themeId
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    
    return (
        <div className="flex flex-col h-full bg-[var(--theme-bg-primary)]">
            <div className="p-2 border-b border-[var(--theme-border-primary)] shadow-sm">
                <h2 className="text-sm font-medium text-[var(--theme-text-primary)]">
                    画中画模式
                </h2>
            </div>
            <div className="flex-grow overflow-auto" ref={scrollContainerRef}>
                <MessageList
                    messages={messages}
                    messagesEndRef={messagesEndRef}
                    scrollContainerRef={scrollContainerRef}
                    onScrollContainerScroll={() => {}}
                    onEditMessage={() => {}}
                    onDeleteMessage={() => {}}
                    onRetryMessage={() => {}}
                    showThoughts={showThoughts}
                    themeColors={themeColors}
                    baseFontSize={baseFontSize}
                    expandCodeBlocksByDefault={expandCodeBlocksByDefault}
                    onTextToSpeech={() => {}}
                    ttsMessageId={null}
                    t={t}
                    language={language}
                    themeId={themeId}
                    showScrollToBottom={false}
                    onScrollToBottom={() => {}}
                />
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};

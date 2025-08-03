/**
 * 文本处理工具函数
 */

/**
 * 将长文本智能分割成多个块
 * @param text 要分割的文本
 * @param maxChunkSize 每个块的最大字符数
 * @returns 分割后的文本块数组
 */
export function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/);
    
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
        if (paragraph.length > maxChunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            
            const sentences = paragraph.split(/[.!?。！？]\s+/);
            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > maxChunkSize) {
                    if (currentChunk) {
                        chunks.push(currentChunk.trim());
                        currentChunk = sentence;
                    } else {
                        chunks.push(sentence.substring(0, maxChunkSize));
                        currentChunk = sentence.substring(maxChunkSize);
                    }
                } else {
                    currentChunk += (currentChunk ? ' ' : '') + sentence;
                }
            }
        } else {
            if (currentChunk.length + paragraph.length > maxChunkSize) {
                chunks.push(currentChunk.trim());
                currentChunk = paragraph;
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            }
        }
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 0);
}

/**
 * 创建一个用于显示进度的对话框
 * @param title 对话框标题
 * @param onCancel 取消按钮点击处理函数
 * @returns 对话框控制对象
 */
export function createProgressDialog(title: string, onCancel: () => void) {
    const dialog = document.createElement('div');
    dialog.style.position = 'fixed';
    dialog.style.top = '0';
    dialog.style.left = '0';
    dialog.style.width = '100%';
    dialog.style.height = '100%';
    dialog.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    dialog.style.zIndex = '10000';
    dialog.style.display = 'flex';
    dialog.style.justifyContent = 'center';
    dialog.style.alignItems = 'center';
    
    const content = document.createElement('div');
    content.style.backgroundColor = 'var(--theme-bg-primary, #fff)';
    content.style.borderRadius = '8px';
    content.style.padding = '20px';
    content.style.width = '400px';
    content.style.maxWidth = '90%';
    content.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    
    const titleElem = document.createElement('h2');
    titleElem.textContent = title;
    titleElem.style.margin = '0 0 15px 0';
    titleElem.style.fontSize = '18px';
    
    const progress = document.createElement('div');
    progress.id = 'progress-text';
    progress.style.marginBottom = '15px';
    progress.textContent = '准备分析...';
    
    const progressBar = document.createElement('div');
    progressBar.style.height = '8px';
    progressBar.style.backgroundColor = '#eee';
    progressBar.style.borderRadius = '4px';
    progressBar.style.overflow = 'hidden';
    progressBar.style.marginBottom = '20px';
    
    const progressFill = document.createElement('div');
    progressFill.id = 'progress-fill';
    progressFill.style.height = '100%';
    progressFill.style.width = '0%';
    progressFill.style.backgroundColor = 'var(--theme-bg-accent, #007bff)';
    progressFill.style.transition = 'width 0.3s';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.backgroundColor = '#f44336';
    cancelButton.style.color = '#fff';
    cancelButton.style.cursor = 'pointer';
    cancelButton.onclick = () => {
        onCancel();
        document.body.removeChild(dialog);
    };
    
    progressBar.appendChild(progressFill);
    content.appendChild(titleElem);
    content.appendChild(progress);
    content.appendChild(progressBar);
    content.appendChild(cancelButton);
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    
    return {
        dialog,
        updateProgress: (chunkIndex: number, totalChunks: number, summary?: string) => {
            const percent = Math.round((chunkIndex / totalChunks) * 100);
            const progressFill = document.getElementById('progress-fill');
            const progressText = document.getElementById('progress-text');
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressText) progressText.textContent = `正在处理第 ${chunkIndex} 部分，共 ${totalChunks} 部分 (${percent}%)`;
        },
        close: () => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }
    };
}

/**
 * 分析文本内容类型
 * @param text 要分析的文本
 * @returns 判断结果
 */
export function analyzeTextType(text: string) {
    const isChatFormat = text.includes('用户:') || text.includes('User:') || 
                          text.match(/\[\d{2}:\d{2}(:\d{2})?\]/g) !== null ||
                          (text.includes('时间:') && text.includes('发送人:'));
    
    const hasCodeBlocks = text.includes('```');
    const hasLinks = text.includes('http') || text.includes('www.');
    const hasImages = text.includes('![') || text.includes('<img');
    
    return {
        isChatFormat,
        hasCodeBlocks,
        hasLinks,
        hasImages
    };
}

/**
 * 简易文本摘要生成
 * @param text 要摘要的文本块
 * @param isChat 是否为聊天格式
 * @param blockIndex 块索引
 * @param totalBlocks 总块数
 * @returns 生成的摘要
 */
export function generateSimpleSummary(text: string, isChat: boolean, blockIndex: number, totalBlocks: number): string {
    if (text.length < 100) return "内容过短，无法生成有效摘要";
    
    const lines = text.split('\n').filter(line => line.trim());
    const wordFrequency: Record<string, number> = {};
    const speakers = new Set<string>();
    
    // 提取关键词和发言人
    for (const line of lines) {
        // 尝试提取发言人
        if (isChat) {
            const match = line.match(/([^:：]+)[：:]/);
            if (match) {
                speakers.add(match[1].trim());
            }
        }
        
        // 统计词频
        const words = line.split(/[,.!?;:，。！？；：\s]/).filter(w => w.length >= 2);
        for (const word of words) {
            if (word.length > 1) {
                wordFrequency[word] = (wordFrequency[word] || 0) + 1;
            }
        }
    }
    
    // 找出最频繁的词
    const sortedWords = Object.entries(wordFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);
    
    // 构建摘要
    let summary = `## 第 ${blockIndex} 部分摘要 (共 ${totalBlocks} 部分)\n\n`;
    
    if (isChat) {
        summary += `这部分内容是一段聊天记录，`;
        if (speakers.size > 0) {
            summary += `涉及 ${Array.from(speakers).join('、')} ${speakers.size > 1 ? '等人' : ''}的对话。`;
        } else {
            summary += `包含多轮对话。`;
        }
    } else {
        summary += `这部分内容是一段文档文本，长度约 ${text.length} 字符。`;
    }
    
    if (sortedWords.length > 0) {
        summary += `\n\n主要内容涉及：${sortedWords.join('、')}等关键词。`;
    }
    
    // 添加内容特征
    const features = [];
    if (text.includes('```')) features.push('代码块');
    if (text.includes('http')) features.push('链接');
    if (text.includes('![') || text.includes('<img')) features.push('图片引用');
    if (text.match(/\d{1,2}:\d{2}/)) features.push('时间标记');
    
    if (features.length > 0) {
        summary += `\n\n此部分包含${features.join('、')}等特殊内容。`;
    }
    
    return summary;
}

/**
 * 智能文本分析服务
 * 提供对长文本的分块处理和深度分析功能
 */

import { geminiServiceInstance } from './geminiService';
import { ChatHistoryItem, ChatMessage } from '../types';
import { generateUniqueId, logService } from '../utils/appUtils';
import { splitTextIntoChunks, createProgressDialog, analyzeTextType } from '../hooks/textProcessingUtils';

export interface TextAnalysisResult {
    chunks: AnalyzedChunk[];
    overallSummary: string;
    totalWords: number;
    textType: 'chat' | 'document' | 'code' | 'mixed';
    analysis: {
        mainTopics: string[];
        keyInsights: string[];
        recommendations: string[];
    };
}

export interface AnalyzedChunk {
    index: number;
    originalText: string;
    analysis: string;
    summary: string;
    keyPoints: string[];
    wordCount: number;
}

class IntelligentTextAnalysisService {
    /**
     * 对长文本进行智能分块分析
     * @param text 要分析的文本
     * @param filename 文件名
     * @param apiKey API密钥
     * @param onProgress 进度回调函数
     * @param abortSignal 取消信号
     * @returns 分析结果
     */
    async analyzeTextIntelligently(
        text: string,
        filename: string,
        apiKey: string,
        onProgress?: (progress: number, message: string) => void,
        abortSignal?: AbortSignal
    ): Promise<TextAnalysisResult> {
        logService.info(`开始智能分析文本: ${filename}, 长度: ${text.length}`);

        // 1. 分析文本类型
        const textTypeAnalysis = analyzeTextType(text);
        const textType = this.determineTextType(text, textTypeAnalysis);

        // 2. 根据文本长度和类型确定分块策略
        const chunkSize = this.getOptimalChunkSize(text.length, textType);
        const textChunks = splitTextIntoChunks(text, chunkSize);
        
        onProgress?.(10, `文本已分为 ${textChunks.length} 个部分，开始逐段分析...`);

        // 3. 逐块进行深度分析
        const analyzedChunks: AnalyzedChunk[] = [];
        for (let i = 0; i < textChunks.length; i++) {
            if (abortSignal?.aborted) {
                throw new Error('分析被用户取消');
            }

            const chunk = textChunks[i];
            const chunkAnalysis = await this.analyzeTextChunk(
                chunk, 
                i + 1, 
                textChunks.length, 
                textType, 
                apiKey, 
                abortSignal
            );

            analyzedChunks.push(chunkAnalysis);
            
            const progress = 10 + ((i + 1) / textChunks.length) * 70; // 10-80%
            onProgress?.(progress, `完成第 ${i + 1} 部分分析，共 ${textChunks.length} 部分`);
        }

        // 4. 生成整体分析报告
        onProgress?.(85, '正在生成整体分析报告...');
        const overallAnalysis = await this.generateOverallAnalysis(
            analyzedChunks, 
            textType, 
            filename, 
            apiKey, 
            abortSignal
        );

        onProgress?.(100, '分析完成');

        const result: TextAnalysisResult = {
            chunks: analyzedChunks,
            overallSummary: overallAnalysis.summary,
            totalWords: text.length,
            textType,
            analysis: overallAnalysis.analysis
        };

        logService.info(`文本分析完成: ${analyzedChunks.length} 个块，总体类型: ${textType}`);
        return result;
    }

    /**
     * 分析单个文本块
     */
    private async analyzeTextChunk(
        chunk: string,
        index: number,
        totalChunks: number,
        textType: string,
        apiKey: string,
        abortSignal?: AbortSignal
    ): Promise<AnalyzedChunk> {
        const prompt = this.buildChunkAnalysisPrompt(chunk, index, totalChunks, textType);
        
        try {
            let analysisResult = '';
            
            await geminiServiceInstance.sendMessageNonStream(
                apiKey,
                'gemini-1.5-flash', // 使用快速模型进行分析
                [{ role: 'user', parts: [{ text: prompt }] }],
                '你是一个专业的文本分析专家，能够深入理解各种类型的文本内容。',
                { temperature: 0.3, topP: 0.8 },
                false,
                0,
                false,
                false,
                false,
                abortSignal || new AbortController().signal,
                (error) => {
                    logService.error(`分析第 ${index} 块时出错:`, error);
                    throw error;
                },
                (parts) => {
                    analysisResult = parts.map(part => part.text || '').join('');
                }
            );

            return this.parseChunkAnalysisResult(chunk, index, analysisResult);
        } catch (error) {
            logService.error(`分析第 ${index} 块失败:`, error);
            // 返回基础分析结果
            return {
                index,
                originalText: chunk,
                analysis: `第 ${index} 部分分析失败，但包含约 ${chunk.length} 个字符的内容。`,
                summary: this.generateFallbackSummary(chunk),
                keyPoints: this.extractBasicKeyPoints(chunk),
                wordCount: chunk.length
            };
        }
    }

    /**
     * 生成整体分析报告
     */
    private async generateOverallAnalysis(
        chunks: AnalyzedChunk[],
        textType: string,
        filename: string,
        apiKey: string,
        abortSignal?: AbortSignal
    ): Promise<{ summary: string; analysis: { mainTopics: string[]; keyInsights: string[]; recommendations: string[] } }> {
        const prompt = this.buildOverallAnalysisPrompt(chunks, textType, filename);
        
        try {
            let analysisResult = '';
            
            await geminiServiceInstance.sendMessageNonStream(
                apiKey,
                'gemini-1.5-flash',
                [{ role: 'user', parts: [{ text: prompt }] }],
                '你是一个资深的内容分析师，擅长从多个片段中提取整体洞察和价值。',
                { temperature: 0.4, topP: 0.9 },
                false,
                0,
                false,
                false,
                false,
                abortSignal || new AbortController().signal,
                (error) => {
                    logService.error('生成整体分析时出错:', error);
                    throw error;
                },
                (parts) => {
                    analysisResult = parts.map(part => part.text || '').join('');
                }
            );

            return this.parseOverallAnalysisResult(analysisResult, chunks);
        } catch (error) {
            logService.error('生成整体分析失败:', error);
            return this.generateFallbackOverallAnalysis(chunks, textType);
        }
    }

    /**
     * 构建分块分析提示词
     */
    private buildChunkAnalysisPrompt(chunk: string, index: number, totalChunks: number, textType: string): string {
        return `请对以下文本片段进行详细分析。这是第 ${index} 部分，共 ${totalChunks} 部分。文本类型：${textType}

【待分析文本】
${chunk}

请按以下格式提供分析：

## 内容摘要
[简明扼要地概括这部分的主要内容]

## 详细分析
[深入分析这部分的内容，包括：
- 主要观点或信息
- 逻辑结构
- 语言特点
- 关键细节]

## 关键要点
- [要点1]
- [要点2]
- [要点3]
[列出3-5个最重要的要点]

## 连接性
[如果这不是第一部分，分析与前面内容的逻辑连接；如果不是最后部分，预测可能的后续内容发展]

请确保分析深入、准确，并突出这部分内容的价值和意义。`;
    }

    /**
     * 构建整体分析提示词
     */
    private buildOverallAnalysisPrompt(chunks: AnalyzedChunk[], textType: string, filename: string): string {
        const chunkSummaries = chunks.map(chunk => 
            `### 第 ${chunk.index} 部分摘要\n${chunk.summary}\n\n**关键要点：**\n${chunk.keyPoints.map(point => `- ${point}`).join('\n')}`
        ).join('\n\n---\n\n');

        return `基于以下各部分的分析结果，请生成整体分析报告。文件名：${filename}，文本类型：${textType}

【各部分分析摘要】
${chunkSummaries}

请按以下格式提供整体分析：

## 整体概述
[对整个文本的全面概括，包括主题、结构和价值]

## 主要主题
[列出3-5个主要主题，每个主题简要说明]

## 核心洞察
[提供3-5个从整体分析中得出的重要洞察]

## 推荐行动
[基于内容提供3-5个实用的建议或推荐]

## 总结评价
[对整个文本的质量、价值和意义进行总结评价]

请确保分析具有整体性，能够展现各部分之间的关联和整体价值。`;
    }

    /**
     * 解析分块分析结果
     */
    private parseChunkAnalysisResult(originalText: string, index: number, analysisText: string): AnalyzedChunk {
        // 提取摘要
        const summaryMatch = analysisText.match(/## 内容摘要\s*\n([\s\S]*?)(?=\n## |$)/);
        const summary = summaryMatch ? summaryMatch[1].trim() : '无法生成摘要';

        // 提取关键要点
        const keyPointsMatch = analysisText.match(/## 关键要点\s*\n([\s\S]*?)(?=\n## |$)/);
        const keyPointsText = keyPointsMatch ? keyPointsMatch[1] : '';
        const keyPoints = keyPointsText
            .split('\n')
            .filter(line => line.trim().startsWith('- '))
            .map(line => line.replace(/^- /, '').trim())
            .filter(point => point.length > 0);

        return {
            index,
            originalText,
            analysis: analysisText,
            summary,
            keyPoints,
            wordCount: originalText.length
        };
    }

    /**
     * 解析整体分析结果
     */
    private parseOverallAnalysisResult(
        analysisText: string, 
        chunks: AnalyzedChunk[]
    ): { summary: string; analysis: { mainTopics: string[]; keyInsights: string[]; recommendations: string[] } } {
        // 提取整体概述
        const summaryMatch = analysisText.match(/## 整体概述\s*\n([\s\S]*?)(?=\n## |$)/);
        const summary = summaryMatch ? summaryMatch[1].trim() : '整体分析生成失败';

        // 提取主要主题
        const topicsMatch = analysisText.match(/## 主要主题\s*\n([\s\S]*?)(?=\n## |$)/);
        const mainTopics = this.extractListItems(topicsMatch ? topicsMatch[1] : '');

        // 提取核心洞察
        const insightsMatch = analysisText.match(/## 核心洞察\s*\n([\s\S]*?)(?=\n## |$)/);
        const keyInsights = this.extractListItems(insightsMatch ? insightsMatch[1] : '');

        // 提取推荐行动
        const recommendationsMatch = analysisText.match(/## 推荐行动\s*\n([\s\S]*?)(?=\n## |$)/);
        const recommendations = this.extractListItems(recommendationsMatch ? recommendationsMatch[1] : '');

        return {
            summary,
            analysis: {
                mainTopics,
                keyInsights,
                recommendations
            }
        };
    }

    /**
     * 从文本中提取列表项
     */
    private extractListItems(text: string): string[] {
        return text
            .split('\n')
            .filter(line => line.trim().match(/^[-*]\s+/) || line.trim().match(/^\d+\.\s+/))
            .map(line => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
            .filter(item => item.length > 0)
            .slice(0, 5); // 最多5个项目
    }

    /**
     * 确定文本类型
     */
    private determineTextType(text: string, analysis: any): 'chat' | 'document' | 'code' | 'mixed' {
        if (analysis.isChatFormat) return 'chat';
        if (analysis.hasCodeBlocks && text.includes('function') || text.includes('class ')) return 'code';
        if (analysis.hasCodeBlocks || analysis.hasLinks || analysis.hasImages) return 'mixed';
        return 'document';
    }

    /**
     * 获取最佳分块大小
     */
    private getOptimalChunkSize(textLength: number, textType: string): number {
        if (textLength < 5000) return textLength; // 小文本不分块
        
        switch (textType) {
            case 'chat':
                return 6000; // 聊天记录保持对话完整性
            case 'code':
                return 8000; // 代码块可以稍大一些
            case 'document':
                return 7000; // 文档按段落分块
            default:
                return 7500;
        }
    }

    /**
     * 生成备用摘要
     */
    private generateFallbackSummary(text: string): string {
        const words = text.split(/\s+/).filter(w => w.length > 2);
        const uniqueWords = [...new Set(words)].slice(0, 10);
        return `这部分内容包含约 ${text.length} 个字符，主要涉及：${uniqueWords.join('、')}等内容。`;
    }

    /**
     * 提取基本关键点
     */
    private extractBasicKeyPoints(text: string): string[] {
        const sentences = text.split(/[.!?。！？]/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 3).map(s => s.trim().substring(0, 100));
    }

    /**
     * 生成备用整体分析
     */
    private generateFallbackOverallAnalysis(
        chunks: AnalyzedChunk[], 
        textType: string
    ): { summary: string; analysis: { mainTopics: string[]; keyInsights: string[]; recommendations: string[] } } {
        const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
        const allKeyPoints = chunks.flatMap(chunk => chunk.keyPoints);
        
        return {
            summary: `这是一个包含 ${chunks.length} 个部分的${textType}类型文本，总计约 ${totalWords} 个字符。内容已完成分段分析。`,
            analysis: {
                mainTopics: allKeyPoints.slice(0, 5),
                keyInsights: [`文本被分为 ${chunks.length} 个分析段落`, '每个段落都进行了独立分析', '整体内容结构清晰'],
                recommendations: ['建议仔细阅读每个部分的详细分析', '重点关注关键要点', '根据内容类型选择合适的处理方式']
            }
        };
    }
}

export const intelligentTextAnalysisService = new IntelligentTextAnalysisService();

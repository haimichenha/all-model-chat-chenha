// 创建这个临时文件，用于在App.tsx中添加事件监听器代码

import { useEffect } from 'react';

// 设置事件处理器
export const setupIntelligentAnalysisHandler = (addNewChat: Function) => {
  useEffect(() => {
    // 监听智能分析完成事件
    const handleIntelligentAnalysisCompleted = (event: any) => {
      const { result, fileName } = event.detail;
      if (!result) return;
      
      // 创建分析结果会话
      const messages: any[] = [];
      const sessionTimestamp = Date.now();
      
      // 添加系统消息作为总体分析
      messages.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        role: 'model',
        content: `# 📄 智能文本分析报告\n\n**文件名：** ${fileName}\n**文本类型：** ${result.textType}\n**总字符数：** ${result.totalWords}\n**分析片段数：** ${result.chunks.length}\n\n## 整体概述\n\n${result.overallSummary}\n\n## 主要主题\n\n${result.analysis.mainTopics.map((topic: string, index: number) => `${index + 1}. ${topic}`).join('\n')}\n\n## 核心洞察\n\n${result.analysis.keyInsights.map((insight: string) => `• ${insight}`).join('\n')}\n\n## 建议行动\n\n${result.analysis.recommendations.map((rec: string) => `• ${rec}`).join('\n')}`,
        timestamp: new Date(sessionTimestamp),
        files: []
      });
      
      // 添加详细的分段分析结果
      let detailedAnalysis = `# 📋 详细分段分析\n\n以下是对文本各部分的深入分析结果：\n\n`;
      
      result.chunks.forEach((chunk: any, index: number) => {
        detailedAnalysis += `\n### 片段 ${index + 1}\n\n${chunk.summary}\n\n`;
        
        if (chunk.keyPoints && chunk.keyPoints.length > 0) {
          detailedAnalysis += `**关键信息：**\n${chunk.keyPoints.map((point: string) => `• ${point}`).join('\n')}\n\n`;
        }
      });
      
      messages.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        role: 'model',
        content: detailedAnalysis,
        timestamp: new Date(sessionTimestamp + 1),
        files: []
      });

      // 添加到聊天中
      addNewChat({ messages, title: `分析: ${fileName}` });
    };

    window.addEventListener('intelligentAnalysisCompleted', handleIntelligentAnalysisCompleted);
    
    return () => {
      window.removeEventListener('intelligentAnalysisCompleted', handleIntelligentAnalysisCompleted);
    };
  }, [addNewChat]);
};

// hooks/useChatAnalytics.ts
import { useMemo } from 'react';
import { SavedChatSession, ChatMessage } from '../types';

export interface ChatStats {
  totalSessions: number;
  totalMessages: number;
  userMessages: number;
  modelMessages: number;
  averageMessagesPerSession: number;
  totalCharacters: number;
  averageMessageLength: number;
  mostActiveDay: string;
  mostActiveHour: number;
  messagesLastWeek: number;
  messagesLastMonth: number;
  topicsAnalysis: Array<{
    keyword: string;
    frequency: number;
    sessions: number;
  }>;
  usageByModel: Array<{
    modelId: string;
    count: number;
    percentage: number;
  }>;
  sessionLengthDistribution: Array<{
    range: string;
    count: number;
  }>;
  responseTimeAnalysis: {
    averageResponseTime: number;
    fastestResponse: number;
    slowestResponse: number;
  };
  dailyActivity: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
  }>;
  hourlyActivity: Array<{
    hour: number;
    messageCount: number;
  }>;
}

export interface MessageAnalysis {
  messageId: string;
  sessionId: string;
  wordCount: number;
  characterCount: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  topics: string[];
  complexity: 'simple' | 'medium' | 'complex';
  hasCode: boolean;
  hasUrls: boolean;
  languages?: string[];
}

export const useChatAnalytics = (sessions: SavedChatSession[]) => {
  
  // Extract keywords and topics from text
  const extractTopics = (text: string): string[] => {
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word));
    
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });
    
    return Array.from(wordFreq.entries())
      .filter(([_, freq]) => freq > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  };

  // Analyze message complexity
  const analyzeComplexity = (text: string): 'simple' | 'medium' | 'complex' => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = text.length / sentences.length;
    const hasComplexPunctuation = /[;:()[\]{}]/.test(text);
    const hasCodeBlocks = /```/.test(text);
    
    if (hasCodeBlocks || avgSentenceLength > 100 || hasComplexPunctuation) {
      return 'complex';
    } else if (avgSentenceLength > 50 || sentences.length > 5) {
      return 'medium';
    } else {
      return 'simple';
    }
  };

  // Detect programming languages in code
  const detectLanguages = (text: string): string[] => {
    const languages: string[] = [];
    
    // Simple keyword-based detection
    const patterns: Record<string, RegExp> = {
      javascript: /\b(function|const|let|var|=&gt;|console\.log|require|import)\b/gi,
      python: /\b(def|import|from|print|if __name__|class|self)\b/gi,
      java: /\b(public class|private|protected|import java|System\.out)\b/gi,
      cpp: /\b(#include|using namespace|std::|cout|cin)\b/gi,
      html: /<\/?[a-z][\s\S]*>/gi,
      css: /\{[\s\S]*?[a-z-]+\s*:\s*[^}]+\}/gi,
      sql: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE)\b/gi,
    };
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        languages.push(lang);
      }
    }
    
    return languages;
  };

  // Calculate comprehensive chat statistics
  const stats: ChatStats = useMemo(() => {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalMessages: 0,
        userMessages: 0,
        modelMessages: 0,
        averageMessagesPerSession: 0,
        totalCharacters: 0,
        averageMessageLength: 0,
        mostActiveDay: '',
        mostActiveHour: 0,
        messagesLastWeek: 0,
        messagesLastMonth: 0,
        topicsAnalysis: [],
        usageByModel: [],
        sessionLengthDistribution: [],
        responseTimeAnalysis: {
          averageResponseTime: 0,
          fastestResponse: 0,
          slowestResponse: 0,
        },
        dailyActivity: [],
        hourlyActivity: [],
      };
    }

    const allMessages = sessions.flatMap(s => s.messages);
    const userMessages = allMessages.filter(m => m.role === 'user');
    const modelMessages = allMessages.filter(m => m.role === 'model');
    
    const totalCharacters = allMessages.reduce((sum, m) => sum + m.content.length, 0);
    
    // Topic analysis
    const topicFreq = new Map<string, { count: number; sessions: Set<string> }>();
    sessions.forEach(session => {
      const sessionTopics = new Set<string>();
      session.messages.forEach(message => {
        const topics = extractTopics(message.content);
        topics.forEach(topic => {
          if (!topicFreq.has(topic)) {
            topicFreq.set(topic, { count: 0, sessions: new Set() });
          }
          const data = topicFreq.get(topic)!;
          data.count++;
          data.sessions.add(session.id);
          sessionTopics.add(topic);
        });
      });
    });

    const topicsAnalysis = Array.from(topicFreq.entries())
      .map(([keyword, data]) => ({
        keyword,
        frequency: data.count,
        sessions: data.sessions.size,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);

    // Model usage analysis
    const modelUsage = new Map<string, number>();
    sessions.forEach(session => {
      const modelId = session.settings.modelId || 'unknown';
      modelUsage.set(modelId, (modelUsage.get(modelId) || 0) + 1);
    });

    const usageByModel = Array.from(modelUsage.entries())
      .map(([modelId, count]) => ({
        modelId,
        count,
        percentage: (count / sessions.length) * 100,
      }))
      .sort((a, b) => b.count - a.count);

    // Session length distribution
    const sessionLengths = sessions.map(s => s.messages.length);
    const lengthRanges = [
      { range: '1-5 messages', min: 1, max: 5 },
      { range: '6-10 messages', min: 6, max: 10 },
      { range: '11-20 messages', min: 11, max: 20 },
      { range: '21-50 messages', min: 21, max: 50 },
      { range: '50+ messages', min: 51, max: Infinity },
    ];

    const sessionLengthDistribution = lengthRanges.map(range => ({
      range: range.range,
      count: sessionLengths.filter(length => length >= range.min && length <= range.max).length,
    }));

    // Response time analysis (for messages with timestamps)
    const responseTimes: number[] = [];
    sessions.forEach(session => {
      for (let i = 1; i < session.messages.length; i++) {
        const prevMessage = session.messages[i - 1];
        const currentMessage = session.messages[i];
        
        if (prevMessage.role === 'user' && currentMessage.role === 'model') {
          const responseTime = currentMessage.timestamp.getTime() - prevMessage.timestamp.getTime();
          if (responseTime > 0 && responseTime < 300000) { // Filter out unrealistic times (>5 min)
            responseTimes.push(responseTime);
          }
        }
      }
    });

    const responseTimeAnalysis = {
      averageResponseTime: responseTimes.length > 0 ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0,
      fastestResponse: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      slowestResponse: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    };

    // Daily activity analysis
    const dailyActivity = new Map<string, { messages: number; sessions: number }>();
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let messagesLastWeek = 0;
    let messagesLastMonth = 0;

    allMessages.forEach(message => {
      const date = new Date(message.timestamp);
      const dateStr = date.toISOString().split('T')[0];
      
      if (!dailyActivity.has(dateStr)) {
        dailyActivity.set(dateStr, { messages: 0, sessions: 0 });
      }
      dailyActivity.get(dateStr)!.messages++;

      if (date >= oneWeekAgo) messagesLastWeek++;
      if (date >= oneMonthAgo) messagesLastMonth++;
    });

    sessions.forEach(session => {
      if (session.messages.length > 0) {
        const date = new Date(session.timestamp);
        const dateStr = date.toISOString().split('T')[0];
        if (dailyActivity.has(dateStr)) {
          dailyActivity.get(dateStr)!.sessions++;
        }
      }
    });

    // Hourly activity analysis
    const hourlyActivity = new Array(24).fill(0).map((_, hour) => ({ hour, messageCount: 0 }));
    allMessages.forEach(message => {
      const hour = new Date(message.timestamp).getHours();
      hourlyActivity[hour].messageCount++;
    });

    // Find most active day and hour
    const sortedDays = Array.from(dailyActivity.entries()).sort((a, b) => b[1].messages - a[1].messages);
    const mostActiveDay = sortedDays.length > 0 ? sortedDays[0][0] : '';
    
    const mostActiveHour = hourlyActivity.reduce((max, current) => 
      current.messageCount > max.messageCount ? current : max
    ).hour;

    return {
      totalSessions: sessions.length,
      totalMessages: allMessages.length,
      userMessages: userMessages.length,
      modelMessages: modelMessages.length,
      averageMessagesPerSession: sessions.length > 0 ? allMessages.length / sessions.length : 0,
      totalCharacters,
      averageMessageLength: allMessages.length > 0 ? totalCharacters / allMessages.length : 0,
      mostActiveDay,
      mostActiveHour,
      messagesLastWeek,
      messagesLastMonth,
      topicsAnalysis,
      usageByModel,
      sessionLengthDistribution,
      responseTimeAnalysis,
      dailyActivity: Array.from(dailyActivity.entries())
        .map(([date, data]) => ({
          date,
          messageCount: data.messages,
          sessionCount: data.sessions,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      hourlyActivity,
    };
  }, [sessions]);

  // Analyze individual messages
  const analyzeMessage = (message: ChatMessage, sessionId: string): MessageAnalysis => {
    const wordCount = message.content.split(/\s+/).filter(word => word.length > 0).length;
    const characterCount = message.content.length;
    const topics = extractTopics(message.content);
    const complexity = analyzeComplexity(message.content);
    const hasCode = /```[\s\S]*?```|`[^`]+`/.test(message.content);
    const hasUrls = /https?:\/\/[^\s]+/.test(message.content);
    const languages = hasCode ? detectLanguages(message.content) : [];

    return {
      messageId: message.id,
      sessionId,
      wordCount,
      characterCount,
      topics,
      complexity,
      hasCode,
      hasUrls,
      languages,
    };
  };

  // Get session insights
  const getSessionInsights = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return null;

    const messages = session.messages;
    const userMessages = messages.filter(m => m.role === 'user');
    const modelMessages = messages.filter(m => m.role === 'model');
    
    const topics = messages.flatMap(m => extractTopics(m.content));
    const uniqueTopics = [...new Set(topics)];
    
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const hasCodeContent = messages.some(m => /```[\s\S]*?```/.test(m.content));
    
    return {
      messageCount: messages.length,
      userMessageCount: userMessages.length,
      modelMessageCount: modelMessages.length,
      totalCharacters: totalChars,
      averageMessageLength: messages.length > 0 ? totalChars / messages.length : 0,
      topics: uniqueTopics.slice(0, 10),
      hasCodeContent,
      duration: messages.length > 1 ? 
        new Date(messages[messages.length - 1].timestamp).getTime() - new Date(messages[0].timestamp).getTime() : 0,
    };
  };

  return {
    stats,
    analyzeMessage,
    getSessionInsights,
    extractTopics,
    analyzeComplexity,
    detectLanguages,
  };
};

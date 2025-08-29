import { SavedChatSession } from '../types';
import { CHAT_HISTORY_SESSIONS_KEY } from '../constants/appConstants';
import { logService, applyImageCachePolicy } from './appUtils';

/**
 * 智能存储管理器 - 处理localStorage存储上限问题
 * 特性：
 * 1. 自动捕获存储配额超出错误
 * 2. 智能清理最旧的非固定会话
 * 3. 保护固定的重要会话
 * 4. 用户友好的错误提示
 */
export class SmartStorageManager {
  /**
   * 尝试安全地保存会话到localStorage
   * @param sessions 要保存的会话数组
   * @returns 保存后的会话数组（可能已被清理）
   */
  static saveSessionsSafely(sessions: SavedChatSession[]): SavedChatSession[] {
    const attemptToSave = (sessionsToSave: SavedChatSession[]): boolean => {
      try {
        // 应用图片缓存策略以节省空间
        const sessionsForStorage = applyImageCachePolicy(sessionsToSave);
        localStorage.setItem(CHAT_HISTORY_SESSIONS_KEY, JSON.stringify(sessionsForStorage));
        logService.info(`✅ Successfully saved ${sessionsToSave.length} sessions to localStorage.`);
        return true;
      } catch (error: any) {
        // 捕获"超出配额"的错误
        if (error.name === 'QuotaExceededError' || 
            (error.message && error.message.toLowerCase().includes('quota'))) {
          logService.warn('⚠️ LocalStorage quota exceeded. Need to prune sessions.');
          return false;
        }
        // 对于其他未知错误，记录日志但不进行清理
        logService.error('❌ Failed to save sessions due to unexpected error:', error);
        return true; // 返回true以避免无限清理循环
      }
    };

    // 第一次尝试保存
    if (attemptToSave(sessions)) {
      return sessions; // 保存成功
    }

    // --- 启动智能清理逻辑 ---
    logService.info('🧹 Starting intelligent storage cleanup...');
    
    // 用户友好的提示
    const message = `
📱 存储空间优化提醒

您的聊天记录已接近浏览器存储上限(约5MB)。
为确保最新对话正常保存，系统将自动清理最旧的非重要会话。

🔒 已固定的重要会话将被保留
📝 最新的对话内容将优先保存
    `.trim();
    
    alert(message);
    
    let prunedSessions = [...sessions];
    let prunedCount = 0;
    const maxIterations = 100; // 防止无限循环
    let iterations = 0;

    // 循环清理直到能够成功保存
    while (!attemptToSave(prunedSessions) && iterations < maxIterations) {
      iterations++;
      
      // 按时间戳升序排序，最旧的在前
      const sortedByAge = prunedSessions
        .map((session, originalIndex) => ({ session, originalIndex }))
        .sort((a, b) => a.session.timestamp - b.session.timestamp);
      
      // 找到第一个可以删除的会话（非固定）
      const indexToRemove = sortedByAge.findIndex(item => !item.session.isPinned);

      if (indexToRemove === -1) {
        // 所有会话都已固定，无法继续清理
        logService.error('🚫 Cleanup failed: All remaining sessions are pinned');
        alert(`
⚠️ 自动清理受限

所有剩余的会话都已被您标记为"重要"。
建议您：
1. 手动取消一些会话的固定状态
2. 或导出聊天记录后手动清理
3. 或考虑使用外部存储方案
        `.trim());
        break;
      }
      
      const sessionToRemove = sortedByAge[indexToRemove].session;
      prunedSessions = prunedSessions.filter(s => s.id !== sessionToRemove.id);
      prunedCount++;
      
      logService.info(`🗑️ Removed session: "${sessionToRemove.title}" (${new Date(sessionToRemove.timestamp).toLocaleDateString()})`);
    }
    
    if (prunedCount > 0) {
      logService.info(`✨ Storage optimization complete: removed ${prunedCount} session(s)`);
      
      // 成功清理后的友好提示
      const successMessage = `
✅ 存储优化完成

已自动清理 ${prunedCount} 个旧会话，为新对话腾出空间。
您的重要会话和最新对话已全部保留。
      `.trim();
      
      // 延迟显示成功消息，避免与警告消息重叠
      setTimeout(() => alert(successMessage), 500);
    }
    
    return prunedSessions;
  }

  /**
   * 获取当前存储使用情况
   * @returns 存储使用信息
   */
  static getStorageInfo(): { used: number; available: number; percentage: number } {
    let used = 0;
    let available = 5 * 1024 * 1024; // 假设5MB上限

    try {
      // 计算当前使用的存储空间
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }
    } catch (error) {
      logService.warn('Failed to calculate storage usage:', error);
    }

    return {
      used,
      available,
      percentage: Math.round((used / available) * 100)
    };
  }

  /**
   * 检查是否需要预警用户存储空间不足
   * @returns 是否需要预警
   */
  static shouldWarnUser(): boolean {
    const { percentage } = this.getStorageInfo();
    return percentage > 80; // 超过80%时预警
  }

  /**
   * 显示存储空间预警
   */
  static showStorageWarning(): void {
    const { used, available, percentage } = this.getStorageInfo();
    const usedMB = (used / (1024 * 1024)).toFixed(2);
    const availableMB = (available / (1024 * 1024)).toFixed(2);

    const warningMessage = `
⚠️ 存储空间预警

当前使用: ${usedMB}MB / ${availableMB}MB (${percentage}%)

建议您：
• 固定重要的聊天会话（点击📌图标）
• 导出长期保存的对话记录
• 定期清理不需要的会话

系统将在必要时自动清理旧会话以保证正常运行。
    `.trim();

    alert(warningMessage);
  }
}

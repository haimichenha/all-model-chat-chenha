import { PersistentStore, ApiConfig } from '../types';
import { logService } from './logService';
import { firebaseStorageService } from './firebaseStorageService';

const PERSISTENT_STORE_KEY = 'all-model-chat-persistent-store';

// 默认的持久化存储数据
const DEFAULT_PERSISTENT_STORE: PersistentStore = {
  apiConfigs: [],
  systemPrompts: [
    '你作为google最强的大模型kingfall，是一个专业、有用且富有创造性的中文AI助手。',
    '作为编程助手，请提供清晰、准确的代码解释和建议。',
    '作为翻译助手，请提供准确、自然的翻译，并保持原文的语调和风格。',
    '作为写作助手，请帮助改进文本的清晰度、准确性和表达效果。'
  ],
  lastSelectedApiConfigId: null
};

class PersistentStoreService {
  private store: PersistentStore;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.store = await this.loadStore();
  }

  private async loadStore(): Promise<PersistentStore> {
    try {
      // Try loading from hybrid storage (localStorage + Firebase fallback)
      const stored = await firebaseStorageService.loadData(PERSISTENT_STORE_KEY);
      if (stored) {
        // 合并默认数据，确保向后兼容
        return {
          ...DEFAULT_PERSISTENT_STORE,
          ...stored,
          systemPrompts: stored.systemPrompts || DEFAULT_PERSISTENT_STORE.systemPrompts
        };
      }
    } catch (error) {
      logService.error('Failed to load persistent store:', error);
    }
    
    return { ...DEFAULT_PERSISTENT_STORE };
  }

  private async saveStore(): Promise<void> {
    try {
      const result = await firebaseStorageService.saveData(PERSISTENT_STORE_KEY, this.store);
      if (result.success) {
        logService.info(`Persistent store saved successfully${result.usedFirebase ? ' (using Firebase)' : ' (using localStorage)'}`);
        
        // If storage is getting full, we might want to notify the user
        if (result.usedFirebase) {
          logService.warn('localStorage full, data saved to Firebase instead');
        }
      } else {
        logService.error('Failed to save persistent store:', result.error);
      }
    } catch (error) {
      logService.error('Failed to save persistent store:', error);
    }
  }

  // API配置管理
  getApiConfigs(): ApiConfig[] {
    return [...this.store.apiConfigs];
  }

  addApiConfig(config: Omit<ApiConfig, 'id'>): ApiConfig {
    const newConfig: ApiConfig = {
      ...config,
      id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.store.apiConfigs.push(newConfig);
    this.saveStore(); // Note: This is fire-and-forget for backward compatibility
    logService.info(`Added API config: ${newConfig.name}`);
    return newConfig;
  }

  updateApiConfig(id: string, updates: Partial<Omit<ApiConfig, 'id'>>): boolean {
    const index = this.store.apiConfigs.findIndex(config => config.id === id);
    if (index >= 0) {
      this.store.apiConfigs[index] = { ...this.store.apiConfigs[index], ...updates };
      this.saveStore();
      logService.info(`Updated API config: ${id}`);
      return true;
    }
    return false;
  }

  removeApiConfig(id: string): boolean {
    const index = this.store.apiConfigs.findIndex(config => config.id === id);
    if (index >= 0) {
      const removed = this.store.apiConfigs.splice(index, 1)[0];
      
      // 如果删除的是当前选中的配置，清除选择
      if (this.store.lastSelectedApiConfigId === id) {
        this.store.lastSelectedApiConfigId = null;
      }
      
      this.saveStore();
      logService.info(`Removed API config: ${removed.name}`);
      return true;
    }
    return false;
  }
  
  // 为了与 persistentStoreService.ts 兼容添加的别名方法
  deleteApiConfig(id: string): void {
    this.removeApiConfig(id);
  }

  setDefaultApiConfig(id: string): boolean {
    // 先清除所有默认标记
    this.store.apiConfigs.forEach(config => {
      config.isDefault = false;
    });
    
    // 设置新的默认配置
    const config = this.store.apiConfigs.find(c => c.id === id);
    if (config) {
      config.isDefault = true;
      this.store.lastSelectedApiConfigId = id;
      this.saveStore();
      logService.info(`Set default API config: ${config.name}`);
      return true;
    }
    return false;
  }

  getDefaultApiConfig(): ApiConfig | null {
    return this.store.apiConfigs.find(config => config.isDefault) || null;
  }

  getLastSelectedApiConfigId(): string | undefined | null {
    return this.store.lastSelectedApiConfigId;
  }

  setLastSelectedApiConfigId(id: string): void {
    this.store.lastSelectedApiConfigId = id;
    this.saveStore();
  }

  // 系统提示词管理
  getSystemPrompts(): string[] {
    return [...this.store.systemPrompts];
  }

  addSystemPrompt(prompt: string): void {
    if (!this.store.systemPrompts.includes(prompt)) {
      this.store.systemPrompts.push(prompt);
      this.saveStore();
      logService.info('Added system prompt');
    }
  }

  removeSystemPrompt(prompt: string): boolean {
    const index = this.store.systemPrompts.indexOf(prompt);
    if (index >= 0) {
      this.store.systemPrompts.splice(index, 1);
      this.saveStore();
      logService.info('Removed system prompt');
      return true;
    }
    return false;
  }

  updateSystemPrompt(oldPrompt: string, newPrompt: string): boolean {
    const index = this.store.systemPrompts.indexOf(oldPrompt);
    if (index >= 0) {
      this.store.systemPrompts[index] = newPrompt;
      this.saveStore();
      logService.info('Updated system prompt');
      return true;
    }
    return false;
  }

  // 清理方法（用于"清除历史"功能）
  clearAll(): void {
    this.store = { ...DEFAULT_PERSISTENT_STORE };
    this.saveStore();
    logService.info('Cleared all persistent store data');
  }

  // 导出和导入
  exportData(): PersistentStore {
    return { ...this.store };
  }

  exportToJSON(filename: string = 'all-model-chat-settings'): void {
    try {
      const dataStr = JSON.stringify(this.store, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      // 创建用于下载的链接
      const link = document.createElement('a');
      link.setAttribute('href', dataUri);
      link.setAttribute('download', `${filename}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logService.info('导出配置成功');
    } catch (error) {
      logService.error('导出配置失败:', error);
    }
  }

  // 只导出 API 配置
  exportApiConfigsToJSON(filename: string = 'all-model-chat-api-configs'): void {
    try {
      const dataStr = JSON.stringify({
        apiConfigs: this.store.apiConfigs,
        lastSelectedApiConfigId: this.store.lastSelectedApiConfigId
      }, null, 2);
      
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      const link = document.createElement('a');
      link.setAttribute('href', dataUri);
      link.setAttribute('download', `${filename}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logService.info('导出 API 配置成功');
    } catch (error) {
      logService.error('导出 API 配置失败:', error);
    }
  }

  // 只导出系统提示词
  exportSystemPromptsToJSON(filename: string = 'all-model-chat-system-prompts'): void {
    try {
      const dataStr = JSON.stringify({
        systemPrompts: this.store.systemPrompts
      }, null, 2);
      
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      const link = document.createElement('a');
      link.setAttribute('href', dataUri);
      link.setAttribute('download', `${filename}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logService.info('导出系统提示词成功');
    } catch (error) {
      logService.error('导出系统提示词失败:', error);
    }
  }

  importData(data: Partial<PersistentStore>): void {
    this.store = {
      ...DEFAULT_PERSISTENT_STORE,
      ...data,
      systemPrompts: data.systemPrompts || DEFAULT_PERSISTENT_STORE.systemPrompts
    };
    this.saveStore();
    logService.info('导入配置数据成功');
  }
  
  // 从 JSON 文件导入
  async importFromJSON(file: File): Promise<PersistentStore | null> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data) {
        throw new Error('无效的 JSON 文件');
      }
      
      this.importData(data);
      return this.store; // 返回更新后的存储对象
    } catch (error) {
      logService.error('导入配置失败:', error);
      return null;
    }
  }
  
  // 只导入 API 配置
  async importApiConfigsFromJSON(file: File): Promise<PersistentStore | null> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data || !data.apiConfigs) {
        throw new Error('无效的 API 配置文件');
      }
      
      this.store.apiConfigs = data.apiConfigs;
      if (data.lastSelectedApiConfigId) {
        this.store.lastSelectedApiConfigId = data.lastSelectedApiConfigId;
      }
      
      this.saveStore();
      logService.info('导入 API 配置成功');
      return this.store; // 返回更新后的存储对象
    } catch (error) {
      logService.error('导入 API 配置失败:', error);
      return null;
    }
  }
  
  // 只导入系统提示词
  async importSystemPromptsFromJSON(file: File): Promise<PersistentStore | null> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data || !data.systemPrompts) {
        throw new Error('无效的系统提示词文件');
      }
      
      this.store.systemPrompts = data.systemPrompts;
      this.saveStore();
      logService.info('导入系统提示词成功');
      return this.store; // 返回更新后的存储对象
    } catch (error) {
      logService.error('导入系统提示词失败:', error);
      return null;
    }
  }
}

export const persistentStoreService = new PersistentStoreService();

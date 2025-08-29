import { ApiConfig, PersistentStore } from '../types';
import { v4 as uuidv4 } from 'uuid';

// 存储在 localStorage 中的键名
const PERSISTENT_STORE_KEY = 'all-model-chat-persistent-store';

// 初始状态
const DEFAULT_PERSISTENT_STORE: PersistentStore = {
  apiConfigs: [
    {
      id: 'default-api-config',
      name: '官方API (Official API)',
      apiKey: '',
      proxyUrl: '', // 官方API不使用代理
      isDefault: true
    },
    {
      id: 'api-proxy-config',
      name: '第三方代理 (API Proxy)',
      apiKey: '',
      proxyUrl: 'https://api-proxy.me/gemini/',
      isDefault: false
    }
  ],
  systemPrompts: [
    '你作为google最强的大模型kingfall，是一个专业、有用且富有创造性的中文AI助手。',
    '作为编程助手，请提供清晰、准确的代码解释和建议。',
    '作为翻译助手，请提供准确、自然的翻译，并保持原文的语调和风格。',
    '作为写作助手，请帮助改进文本的清晰度、准确性和表达效果。'
  ],
  lastSelectedApiConfigId: 'default-api-config'
};

class PersistentStoreService {
  private store: PersistentStore;

  constructor() {
    this.store = this.loadFromStorage();
    // 初始化完成
  }

  // 从 localStorage 加载存储
  private loadFromStorage(): PersistentStore {
    try {
      const storedData = localStorage.getItem(PERSISTENT_STORE_KEY);
      if (!storedData) {
        return DEFAULT_PERSISTENT_STORE;
      }
      
      const parsedData = JSON.parse(storedData);
      // 确保加载的数据包含所有必要字段，如果缺失则使用默认值
      return {
        apiConfigs: parsedData.apiConfigs || DEFAULT_PERSISTENT_STORE.apiConfigs,
        systemPrompts: parsedData.systemPrompts && parsedData.systemPrompts.length > 0 
          ? parsedData.systemPrompts 
          : DEFAULT_PERSISTENT_STORE.systemPrompts,
        lastSelectedApiConfigId: parsedData.lastSelectedApiConfigId || DEFAULT_PERSISTENT_STORE.lastSelectedApiConfigId
      };
    } catch (error) {
      console.error('Failed to load persistent store:', error);
      return DEFAULT_PERSISTENT_STORE;
    }
  }

  // 保存到 localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(PERSISTENT_STORE_KEY, JSON.stringify(this.store));
    } catch (error) {
      console.error('Failed to save persistent store:', error);
    }
  }

  // 获取完整存储
  public getStore(): PersistentStore {
    return { ...this.store };
  }

  // API 配置管理
  public getApiConfigs(): ApiConfig[] {
    return [...this.store.apiConfigs];
  }

  public getApiConfigById(id: string | null): ApiConfig | undefined {
    if (!id) return undefined;
    return this.store.apiConfigs.find(config => config.id === id);
  }

  public getLastSelectedApiConfigId(): string | null {
    return this.store.lastSelectedApiConfigId;
  }

  public getDefaultApiConfig(): ApiConfig | undefined {
    return this.store.apiConfigs.find(config => config.isDefault);
  }

  public getCurrentOrFirstApiConfig(): ApiConfig | undefined {
    // 尝试获取上次选择的配置
    const lastSelected = this.getApiConfigById(this.store.lastSelectedApiConfigId);
    if (lastSelected) return lastSelected;
    
    // 尝试获取默认配置
    const defaultConfig = this.getDefaultApiConfig();
    if (defaultConfig) return defaultConfig;
    
    // 如果都没有，返回第一个
    return this.store.apiConfigs[0];
  }

  public addApiConfig(config: Omit<ApiConfig, 'id'>): ApiConfig {
    const newConfig: ApiConfig = {
      id: uuidv4(),
      ...config
    };
    
    this.store.apiConfigs.push(newConfig);
    this.saveToStorage();
    return newConfig;
  }

  public updateApiConfig(id: string, updates: Partial<ApiConfig>): void {
    const index = this.store.apiConfigs.findIndex(config => config.id === id);
    if (index === -1) return;
    
    this.store.apiConfigs[index] = { 
      ...this.store.apiConfigs[index], 
      ...updates 
    };
    this.saveToStorage();
  }

  public deleteApiConfig(id: string): void {
    this.store.apiConfigs = this.store.apiConfigs.filter(config => config.id !== id);
    
    // 如果删除的是当前选中的配置，则重置选中项
    if (this.store.lastSelectedApiConfigId === id) {
      this.store.lastSelectedApiConfigId = this.store.apiConfigs.length > 0 ? 
        this.store.apiConfigs[0].id : null;
    }
    
    this.saveToStorage();
  }
  
  // 为了与 persistentStore.ts 兼容添加的别名方法
  public removeApiConfig(id: string): boolean {
    const initialLength = this.store.apiConfigs.length;
    this.deleteApiConfig(id);
    return this.store.apiConfigs.length < initialLength;
  }

  // 添加 setDefaultApiConfig 方法
  public setDefaultApiConfig(id: string): boolean {
    // 先清除所有默认标记
    this.store.apiConfigs.forEach(config => {
      config.isDefault = false;
    });
    
    // 设置新的默认配置
    const config = this.store.apiConfigs.find(c => c.id === id);
    if (config) {
      config.isDefault = true;
      this.store.lastSelectedApiConfigId = id;
      this.saveToStorage();
      console.info(`Set default API config: ${config.name}`);
      return true;
    }
    return false;
  }

  public setLastSelectedApiConfigId(id: string | null): void {
    this.store.lastSelectedApiConfigId = id;
    this.saveToStorage();
  }

  // 系统提示词管理
  public getSystemPrompts(): string[] {
    return [...this.store.systemPrompts];
  }

  public addSystemPrompt(prompt: string): void {
    if (!prompt.trim()) return;
    
    if (!this.store.systemPrompts.includes(prompt)) {
      this.store.systemPrompts.unshift(prompt);
      this.saveToStorage();
    }
  }

  public removeSystemPrompt(prompt: string): boolean {
    const index = this.store.systemPrompts.indexOf(prompt);
    if (index >= 0) {
      this.store.systemPrompts.splice(index, 1);
      this.saveToStorage();
      console.info('Removed system prompt');
      return true;
    }
    return false;
  }

  public updateSystemPrompt(oldPrompt: string, newPrompt: string): boolean {
    const index = this.store.systemPrompts.indexOf(oldPrompt);
    if (index >= 0) {
      this.store.systemPrompts[index] = newPrompt;
      this.saveToStorage();
      console.info('Updated system prompt');
      return true;
    }
    return false;
  }

  public deleteSystemPrompt(prompt: string): void {
    this.store.systemPrompts = this.store.systemPrompts.filter(p => p !== prompt);
    this.saveToStorage();
  }

  // 批量导入/替换持久化数据
  public importApiConfigs(configs: ApiConfig[]): void {
    this.store.apiConfigs = configs;
    this.saveToStorage();
  }

  public importSystemPrompts(prompts: string[]): void {
    this.store.systemPrompts = prompts;
    this.saveToStorage();
  }

  // 完全替换持久化存储
  public replaceStore(newStore: PersistentStore): void {
    this.store = { ...newStore };
    this.saveToStorage();
  }

  // 导出功能
  public exportToJSON(filename: string = 'all-model-chat-settings'): void {
    try {
      // 确保导出完整的数据结构
      const exportData = {
        apiConfigs: this.store.apiConfigs,
        systemPrompts: this.store.systemPrompts,
        lastSelectedApiConfigId: this.store.lastSelectedApiConfigId
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      // 创建用于下载的链接
      const link = document.createElement('a');
      link.setAttribute('href', dataUri);
      link.setAttribute('download', `${filename}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.info('导出配置成功，包含:', {
        apiConfigs: exportData.apiConfigs.length,
        systemPrompts: exportData.systemPrompts.length,
        lastSelected: exportData.lastSelectedApiConfigId
      });
    } catch (error) {
      console.error('导出配置失败:', error);
    }
  }

  // 只导出 API 配置
  public exportApiConfigsToJSON(filename: string = 'all-model-chat-api-configs'): void {
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
      
      console.info('导出 API 配置成功');
    } catch (error) {
      console.error('导出 API 配置失败:', error);
    }
  }

  // 只导出系统提示词
  public exportSystemPromptsToJSON(filename: string = 'all-model-chat-system-prompts'): void {
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
      
      console.info('导出系统提示词成功');
    } catch (error) {
      console.error('导出系统提示词失败:', error);
    }
  }

  // 导入
  public async importFromJSON(file: File): Promise<PersistentStore | null> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data) {
        throw new Error('无效的 JSON 文件');
      }
      
      // 验证并规范化导入的数据
      const normalizedData: PersistentStore = {
        apiConfigs: Array.isArray(data.apiConfigs) ? data.apiConfigs : [],
        systemPrompts: Array.isArray(data.systemPrompts) ? data.systemPrompts : [],
        lastSelectedApiConfigId: data.lastSelectedApiConfigId || null
      };
      
      this.replaceStore(normalizedData);
      console.info('导入配置成功，包含:', {
        apiConfigs: normalizedData.apiConfigs.length,
        systemPrompts: normalizedData.systemPrompts.length,
        lastSelected: normalizedData.lastSelectedApiConfigId
      });
      return this.store;
    } catch (error) {
      console.error('导入配置失败:', error);
      return null;
    }
  }
  
  // 只导入 API 配置
  public async importApiConfigsFromJSON(file: File): Promise<PersistentStore | null> {
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
      
      this.saveToStorage();
      console.info('导入 API 配置成功');
      return this.store;
    } catch (error) {
      console.error('导入 API 配置失败:', error);
      return null;
    }
  }
  
  // 只导入系统提示词
  public async importSystemPromptsFromJSON(file: File): Promise<PersistentStore | null> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data || !data.systemPrompts) {
        throw new Error('无效的系统提示词文件');
      }
      
      this.store.systemPrompts = data.systemPrompts;
      this.saveToStorage();
      console.info('导入系统提示词成功');
      return this.store;
    } catch (error) {
      console.error('导入系统提示词失败:', error);
      return null;
    }
  }
}

export const persistentStoreService = new PersistentStoreService();

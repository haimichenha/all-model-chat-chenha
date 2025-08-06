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
    this.store = this.loadStore();
  }

  private loadStore(): PersistentStore {
    try {
      const stored = localStorage.getItem(PERSISTENT_STORE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // 合并默认数据，确保向后兼容
        const store = {
          ...DEFAULT_PERSISTENT_STORE,
          ...parsed,
          systemPrompts: parsed.systemPrompts || DEFAULT_PERSISTENT_STORE.systemPrompts
        };
        
        // [新增] 异步检查 Firebase 备份是否更新
        this.checkFirebaseBackupAsync();
        
        return store;
      }
    } catch (error) {
      logService.error('Failed to load persistent store:', error);
    }
    
    // [新增] 如果 localStorage 为空，尝试从 Firebase 恢复
    this.tryRestoreFromFirebase();
    
    return { ...DEFAULT_PERSISTENT_STORE };
  }

  private async checkFirebaseBackupAsync(): Promise<void> {
    try {
      const timestamp = await firebaseStorageService.getFirebaseBackupTimestamp();
      if (timestamp) {
        const localTimestamp = localStorage.getItem(PERSISTENT_STORE_KEY + '_timestamp');
        const localTime = localTimestamp ? parseInt(localTimestamp) : 0;
        
        if (timestamp > localTime) {
          logService.info('Firebase backup is newer than local data');
          // 可以在这里提示用户是否要恢复较新的云端数据
        }
      }
    } catch (error) {
      logService.warn('Failed to check Firebase backup timestamp:', error);
    }
  }

  private async tryRestoreFromFirebase(): Promise<void> {
    try {
      const restored = await firebaseStorageService.restoreFromFirebase();
      if (restored && restored.persistentStore) {
        this.store = restored.persistentStore;
        this.saveStore(); // 保存到本地
        logService.info('Successfully restored persistent store from Firebase');
      }
    } catch (error) {
      logService.error('Failed to restore from Firebase:', error);
    }
  }

  private saveStore(): void {
    try {
      localStorage.setItem(PERSISTENT_STORE_KEY, JSON.stringify(this.store));
      logService.info('Persistent store saved successfully');
      
      // [新增] 异步备份到 Firebase (不阻塞主要流程)
      this.backupToFirebaseAsync();
    } catch (error) {
      logService.error('Failed to save persistent store:', error);
      
      // [新增] 如果 localStorage 失败，尝试提示用户并检查是否能备份到 Firebase
      this.handleStorageFullError();
    }
  }

  private async backupToFirebaseAsync(): Promise<void> {
    try {
      await firebaseStorageService.backupToFirebase([], this.store);
    } catch (error) {
      logService.warn('Firebase backup failed (non-critical):', error);
    }
  }

  private async handleStorageFullError(): Promise<void> {
    // 检查是否是存储空间不足的错误
    try {
      // 尝试检测可用的存储空间
      const testKey = '_storage_test_';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (testError) {
      // localStorage 确实不可用，显示存储已满对话框
      this.showStorageFullDialog();
    }
  }

  private showStorageFullDialog(): void {
    // 创建存储已满对话框，包含导出功能
    const dialog = document.createElement('div');
    dialog.id = 'storage-full-dialog';
    dialog.innerHTML = `
      <div style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.5); z-index: 10000; 
        display: flex; align-items: center; justify-content: center;
      ">
        <div style="
          background: white; padding: 24px; border-radius: 8px; 
          max-width: 500px; margin: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">
          <h2 style="color: #333; margin: 0 0 16px 0; font-size: 18px;">存储空间已满</h2>
          <p style="color: #666; margin: 0 0 20px 0; line-height: 1.5;">
            浏览器存储空间不足。建议导出聊天记录后清理部分数据，或开启 Firebase 云端备份。
          </p>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="export-data-btn" style="
              background: #2563eb; color: white; border: none; 
              padding: 8px 16px; border-radius: 4px; cursor: pointer;
            ">导出数据</button>
            <button id="enable-firebase-btn" style="
              background: #059669; color: white; border: none; 
              padding: 8px 16px; border-radius: 4px; cursor: pointer;
            ">开启云备份</button>
            <button id="close-dialog-btn" style="
              background: #6b7280; color: white; border: none; 
              padding: 8px 16px; border-radius: 4px; cursor: pointer;
            ">确定</button>
          </div>
        </div>
      </div>
    `;

    // 添加事件监听器
    dialog.querySelector('#export-data-btn')?.addEventListener('click', () => {
      this.exportToJSON();
      dialog.remove();
    });

    dialog.querySelector('#enable-firebase-btn')?.addEventListener('click', async () => {
      try {
        if (await firebaseStorageService.isFirebaseAvailable()) {
          await firebaseStorageService.backupToFirebase([], this.store);
          alert('云端备份已启用！数据已备份到 Firebase。');
        } else {
          alert('Firebase 服务暂不可用，请稍后重试。');
        }
      } catch (error) {
        alert('启用云备份失败，请检查网络连接。');
      }
      dialog.remove();
    });

    dialog.querySelector('#close-dialog-btn')?.addEventListener('click', () => {
      dialog.remove();
    });

    document.body.appendChild(dialog);
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
    this.saveStore();
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

  // [新增] Firebase 备份管理方法
  async createFirebaseBackup(): Promise<boolean> {
    try {
      return await firebaseStorageService.backupToFirebase([], this.store);
    } catch (error) {
      logService.error('Failed to create Firebase backup:', error);
      return false;
    }
  }

  async restoreFromFirebaseBackup(): Promise<boolean> {
    try {
      const restored = await firebaseStorageService.restoreFromFirebase();
      if (restored && restored.persistentStore) {
        this.store = restored.persistentStore;
        this.saveStore();
        logService.info('Successfully restored from Firebase backup');
        return true;
      }
      return false;
    } catch (error) {
      logService.error('Failed to restore from Firebase backup:', error);
      return false;
    }
  }

  async hasFirebaseBackup(): Promise<boolean> {
    try {
      return await firebaseStorageService.hasFirebaseBackup();
    } catch (error) {
      logService.error('Failed to check Firebase backup:', error);
      return false;
    }
  }

  async clearFirebaseBackup(): Promise<boolean> {
    try {
      return await firebaseStorageService.clearFirebaseStorage();
    } catch (error) {
      logService.error('Failed to clear Firebase backup:', error);
      return false;
    }
  }

  async isFirebaseEnabled(): Promise<boolean> {
    try {
      return await firebaseStorageService.isFirebaseAvailable();
    } catch (error) {
      return false;
    }
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

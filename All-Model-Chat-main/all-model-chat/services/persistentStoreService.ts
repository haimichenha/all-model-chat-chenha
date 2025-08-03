import { PersistentStore, ApiConfig, SystemPrompt } from '../types';

// 扩展存储类型以支持版本信息
interface ExtendedPersistentStore extends PersistentStore {
  version?: string;
}

// 存储在 localStorage 中的键名
const PERSISTENT_STORE_KEY = 'all-model-chat-persistent-store';

class PersistentStoreService {
  private readonly STORE_KEY = PERSISTENT_STORE_KEY;

  // 默认持久化存储
  private readonly DEFAULT_PERSISTENT_STORE: PersistentStore = {
    apiConfigs: [
      {
        id: 'default-api-config',
        name: '官方API (Official API)',
        apiKey: '',
        // [核心修正] 对于官方直连，此值必须为空，以触发geminiService中的回退逻辑
        apiProxyUrl: '', 
        isDefault: true
      },
      {
        id: 'api-proxy-config',
        name: '第三方代理 (API Proxy)',
        apiKey: '',
        apiProxyUrl: 'https://api-proxy.me/gemini/',
        isDefault: false
      }
    ],
    systemPrompts: [
      {
        id: 'prompt-1',
        name: '通用助手',
        prompt: '你作为google最强的大模型，代号kingfall，是一个专业、有用且富有创造性的中文AI助手。',
        isDefault: true
      },
      {
        id: 'prompt-2',
        name: '编程助手',
        prompt: '作为google最优秀的编程助手kingfall，请提供清晰、准确的代码解释和建议。',
        isDefault: false
      },
      {
        id: 'prompt-3',
        name: '翻译助手',
        prompt: '作为翻译助手，请提供准确、自然的翻译，并保持原文的语调和风格。',
        isDefault: false
      },
      {
        id: 'prompt-4',
        name: '写作助手',
        prompt: '作为写作助手，请帮助改进文本的清晰度、准确性和表达效果。',
        isDefault: false
      }
    ],
    lastSelectedApiConfigId: 'default-api-config'
  };

  private store: PersistentStore;

  constructor() {
    this.store = this.loadFromStorage();
  }

  // 从 localStorage 加载存储
  private loadFromStorage(): PersistentStore {
    try {
      const storedData = localStorage.getItem(this.STORE_KEY);
      if (!storedData) {
        return { ...this.DEFAULT_PERSISTENT_STORE };
      }
      
      const parsedData = JSON.parse(storedData);
      // 确保加载的数据包含所有必要字段，如果缺失则使用默认值
      const normalizedStore: PersistentStore = {
        apiConfigs: parsedData.apiConfigs || this.DEFAULT_PERSISTENT_STORE.apiConfigs,
        systemPrompts: parsedData.systemPrompts && parsedData.systemPrompts.length > 0 
          ? parsedData.systemPrompts 
          : this.DEFAULT_PERSISTENT_STORE.systemPrompts,
        lastSelectedApiConfigId: parsedData.lastSelectedApiConfigId || this.DEFAULT_PERSISTENT_STORE.lastSelectedApiConfigId
      };
      
      return normalizedStore;
    } catch (error) {
      console.error('Failed to load persistent store:', error);
      return { ...this.DEFAULT_PERSISTENT_STORE };
    }
  }

  // 保存到 localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORE_KEY, JSON.stringify(this.store));
    } catch (error) {
      console.error('Failed to save persistent store:', error);
    }
  }

  // 获取持久化存储 - 向后兼容方法
  getStore(): PersistentStore {
    return { ...this.store };
  }

  // 保存持久化存储 - 向后兼容方法
  saveStore(store: PersistentStore): void {
    this.store = { ...store };
    this.saveToStorage();
  }

  // ========== API配置管理方法 ==========
  
  // 获取所有API配置
  getApiConfigs(): ApiConfig[] {
    return [...this.store.apiConfigs];
  }

  // 根据ID获取API配置
  getApiConfigById(id: string | null): ApiConfig | undefined {
    if (!id) return undefined;
    return this.store.apiConfigs.find(config => config.id === id);
  }

  // 获取最后选择的API配置ID
  getLastSelectedApiConfigId(): string | null {
    return this.store.lastSelectedApiConfigId;
  }

  // 获取默认API配置
  getDefaultApiConfig(): ApiConfig | undefined {
    return this.store.apiConfigs.find(config => config.isDefault);
  }

  // 获取当前使用的API配置
  getCurrentOrFirstApiConfig(): ApiConfig | undefined {
    // 尝试获取上次选择的配置
    const lastSelected = this.getApiConfigById(this.store.lastSelectedApiConfigId);
    if (lastSelected) return lastSelected;
    
    // 尝试获取默认配置
    const defaultConfig = this.getDefaultApiConfig();
    if (defaultConfig) return defaultConfig;
    
    // 如果都没有，返回第一个
    return this.store.apiConfigs[0];
  }

  // 从指定存储中获取当前或第一个API配置
  getCurrentOrFirstApiConfigFromStore(store: PersistentStore): ApiConfig | undefined {
    // 尝试获取默认配置
    const defaultConfig = store.apiConfigs.find(config => config.isDefault);
    if (defaultConfig) return defaultConfig;
    
    // 如果都没有，返回第一个
    return store.apiConfigs[0];
  }

  // 添加API配置
  addApiConfig(config: Omit<ApiConfig, 'id'>): ApiConfig {
    // 检查配置名称是否已存在
    const nameExists = this.store.apiConfigs.some(c => 
      c.name.trim().toLowerCase() === config.name.trim().toLowerCase()
    );
    
    if (nameExists) {
      // 抛出明确的错误，让UI层可以捕获并提示用户
      throw new Error(`配置名称 "${config.name}" 已存在，请使用其他名称。`);
    }
    
    // 检查是否已存在完全相同的配置（不考虑ID、名称和isDefault属性）
    const exactConfigExists = this.store.apiConfigs.some(c => 
      c.apiKey === config.apiKey &&
      c.apiProxyUrl === config.apiProxyUrl &&
      c.apiKey.trim() !== '' // 只检查非空的配置
    );
    
    if (exactConfigExists) {
      // 提醒用户已存在相同的API配置
      throw new Error(`已存在完全相同的API配置（相同的API密钥和代理地址）。请使用不同的API密钥或代理地址。`);
    }
    
    const newConfig: ApiConfig = {
      ...config,
      name: config.name.trim(),
      id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isDefault: this.store.apiConfigs.length === 0 // 如果是第一个配置，设为默认
    };
    
    this.store.apiConfigs.push(newConfig);
    this.saveToStorage();
    console.info(`Added API config: ${newConfig.name}`);
    return newConfig;
  }

  // 更新API配置
  updateApiConfig(id: string, updates: Partial<Omit<ApiConfig, 'id'>>): boolean {
    const index = this.store.apiConfigs.findIndex(config => config.id === id);
    if (index >= 0) {
      this.store.apiConfigs[index] = { ...this.store.apiConfigs[index], ...updates };
      this.saveToStorage();
      console.info(`Updated API config: ${id}`);
      return true;
    }
    return false;
  }

  // 删除API配置
  deleteApiConfig(id: string): boolean {
    const index = this.store.apiConfigs.findIndex(config => config.id === id);
    if (index >= 0) {
      const removed = this.store.apiConfigs.splice(index, 1)[0];
      
      // 如果删除的是当前选中的配置，清除选择
      if (this.store.lastSelectedApiConfigId === id) {
        this.store.lastSelectedApiConfigId = null;
      }
      
      this.saveToStorage();
      console.info(`Removed API config: ${removed.name}`);
      return true;
    }
    return false;
  }
  
  // 为了与旧版本兼容添加的别名方法
  removeApiConfig(id: string): boolean {
    return this.deleteApiConfig(id);
  }

  // 设置默认API配置
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
      this.saveToStorage();
      console.info(`Set default API config: ${config.name}`);
      return true;
    }
    return false;
  }

  // 设置最后选择的API配置ID
  setLastSelectedApiConfigId(id: string | null): void {
    this.store.lastSelectedApiConfigId = id;
    this.saveToStorage();
  }

  // ========== 系统提示词管理方法 ==========

  // 获取所有系统提示词（对象格式）
  getSystemPrompts(): SystemPrompt[] {
    return [...this.store.systemPrompts];
  }

  // 获取系统提示词（字符串数组格式，向后兼容）
  getSystemPromptsAsStrings(): string[] {
    return this.store.systemPrompts.map(p => p.prompt);
  }

  // 添加系统提示词（对象格式）
  addSystemPrompt(prompt: Omit<SystemPrompt, 'id'>): SystemPrompt {
    const newPrompt: SystemPrompt = { 
      ...prompt, 
      id: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
    };
    this.store.systemPrompts.push(newPrompt);
    this.saveToStorage();
    return newPrompt;
  }

  // 添加系统提示词（字符串格式，向后兼容）
  addSystemPromptString(prompt: string): void {
    if (!prompt.trim()) return;
    
    // 检查是否已存在
    const exists = this.store.systemPrompts.some(p => p.prompt === prompt);
    if (!exists) {
      const newPrompt: SystemPrompt = {
        id: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `自定义提示词 ${this.store.systemPrompts.length + 1}`,
        prompt: prompt.trim(),
        isDefault: false
      };
      this.store.systemPrompts.unshift(newPrompt);
      this.saveToStorage();
    }
  }

  // 删除系统提示词
  removeSystemPrompt(promptId: string): boolean {
    const initialLength = this.store.systemPrompts.length;
    this.store.systemPrompts = this.store.systemPrompts.filter(p => p.id !== promptId);
    if (this.store.systemPrompts.length < initialLength) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // 删除系统提示词（字符串格式，向后兼容）
  removeSystemPromptString(prompt: string): boolean {
    const index = this.store.systemPrompts.findIndex(p => p.prompt === prompt);
    if (index >= 0) {
      this.store.systemPrompts.splice(index, 1);
      this.saveToStorage();
      console.info('Removed system prompt');
      return true;
    }
    return false;
  }

  // 更新系统提示词
  updateSystemPrompt(promptId: string, updates: Partial<Omit<SystemPrompt, 'id'>>): boolean {
    const index = this.store.systemPrompts.findIndex(p => p.id === promptId);
    if (index >= 0) {
      this.store.systemPrompts[index] = { ...this.store.systemPrompts[index], ...updates };
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // 更新系统提示词（字符串格式，向后兼容）
  updateSystemPromptString(oldPrompt: string, newPrompt: string): boolean {
    const index = this.store.systemPrompts.findIndex(p => p.prompt === oldPrompt);
    if (index >= 0) {
      this.store.systemPrompts[index].prompt = newPrompt;
      this.saveToStorage();
      console.info('Updated system prompt');
      return true;
    }
    return false;
  }

  // 设置默认系统提示词
  setDefaultSystemPrompt(promptId: string): boolean {
    let found = false;
    this.store.systemPrompts = this.store.systemPrompts.map(prompt => {
      if (prompt.id === promptId) {
        found = true;
        return { ...prompt, isDefault: true };
      } else {
        return { ...prompt, isDefault: false };
      }
    });
    
    if (found) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // 获取默认系统提示词
  getDefaultSystemPrompt(): SystemPrompt | null {
    return this.store.systemPrompts.find(p => p.isDefault) || null;
  }
  
  // 对系统提示词进行自动分类
  categorizeSystemPrompts(): { category: string; prompts: SystemPrompt[] }[] {
    // 定义预设分类
    const categories: { name: string; keywords: string[]; prompts: SystemPrompt[] }[] = [
      {
        name: '创意与写作',
        keywords: ['写作', '创意', '创作', '文章', '小说', '故事', '诗歌'],
        prompts: []
      },
      {
        name: '编程开发',
        keywords: ['编程', '代码', '开发', 'code', 'programming', '程序', '软件', '调试'],
        prompts: []
      },
      {
        name: '翻译与语言',
        keywords: ['翻译', '语言', 'translation', '英语', '中文', '日语', '法语'],
        prompts: []
      },
      {
        name: '学术研究',
        keywords: ['学术', '研究', '论文', '科学', '学习', '教育'],
        prompts: []
      },
      {
        name: '角色扮演',
        keywords: ['角色', '扮演', 'RPG', '游戏', '模拟', '人物'],
        prompts: []
      }
    ];
    
    const uncategorized: SystemPrompt[] = [];
    
    // 对每个提示词进行分类
    this.store.systemPrompts.forEach(prompt => {
      let matched = false;
      
      // 尝试根据关键词匹配分类
      for (const category of categories) {
        if (category.keywords.some(keyword => 
          prompt.name.includes(keyword) || prompt.prompt.includes(keyword)
        )) {
          category.prompts.push(prompt);
          matched = true;
          break;
        }
      }
      
      // 如果没有匹配任何类别，加入未分类组
      if (!matched) {
        uncategorized.push(prompt);
      }
    });
    
    // 添加未分类组
    if (uncategorized.length > 0) {
      categories.push({
        name: '未分类',
        keywords: [],
        prompts: uncategorized
      });
    }
    
    // 过滤掉空类别并返回结果
    return categories
      .filter(category => category.prompts.length > 0)
      .map(({ name, prompts }) => ({ category: name, prompts }));
  }

  // ========== 兼容性方法 ==========

  // 更新API配置（批量，向后兼容）
  updateApiConfigs(apiConfigs: ApiConfig[]): void {
    // 先去重，避免重复配置
    const uniqueConfigMap = new Map<string, ApiConfig>();
    
    apiConfigs.forEach(config => {
      const configKey = `${config.name}|${config.apiKey}|${config.apiProxyUrl}`;
      if (!uniqueConfigMap.has(configKey)) {
        uniqueConfigMap.set(configKey, config);
      }
    });
    
    this.store.apiConfigs = Array.from(uniqueConfigMap.values());
    this.saveToStorage();
    console.info(`批量更新API配置: ${this.store.apiConfigs.length} 个配置保存`);
  }

  // 更新系统提示词（批量，向后兼容）
  updateSystemPrompts(systemPrompts: SystemPrompt[]): void {
    this.store.systemPrompts = systemPrompts;
    this.saveToStorage();
  }

  // 更新最后选择的API配置ID（向后兼容）
  updateLastSelectedApiConfigId(id: string | null): void {
    this.setLastSelectedApiConfigId(id);
  }

  // 批量导入/替换持久化数据
  importApiConfigs(configs: ApiConfig[]): void {
    this.store.apiConfigs = configs;
    this.saveToStorage();
  }

  importSystemPrompts(prompts: SystemPrompt[]): void {
    this.store.systemPrompts = prompts;
    this.saveToStorage();
  }

  // 完全替换持久化存储
  replaceStore(newStore: PersistentStore): void {
    this.store = { ...newStore };
    this.saveToStorage();
  }

  // 导出数据
  exportData(): PersistentStore {
    return { ...this.store };
  }

  // ========== 导出功能 ==========

  // 导出所有设置为JSON文件
  exportToJSON(filename: string = 'all-model-chat-settings'): void {
    try {
      // 确保导出完整的数据结构
      const exportData = {
        apiConfigs: this.store.apiConfigs,
        systemPrompts: this.store.systemPrompts,
        lastSelectedApiConfigId: this.store.lastSelectedApiConfigId
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      this.downloadJSON(dataStr, `${filename}.json`);
      
      console.info('导出配置成功，包含:', {
        apiConfigs: exportData.apiConfigs.length,
        systemPrompts: exportData.systemPrompts.length,
        lastSelected: exportData.lastSelectedApiConfigId
      });
    } catch (error) {
      console.error('导出配置失败:', error);
    }
  }

  // 导出API配置为JSON文件
  exportApiConfigsToJSON(filename: string = 'all-model-chat-api-configs'): void {
    try {
      const apiConfigsData = {
        apiConfigs: this.store.apiConfigs,
        lastSelectedApiConfigId: this.store.lastSelectedApiConfigId
      };
      const dataStr = JSON.stringify(apiConfigsData, null, 2);
      this.downloadJSON(dataStr, `${filename}.json`);
      console.info('导出 API 配置成功');
    } catch (error) {
      console.error('导出 API 配置失败:', error);
    }
  }

  // 导出系统提示词为JSON文件
  exportSystemPromptsToJSON(filename: string = 'all-model-chat-system-prompts'): void {
    try {
      const systemPromptsData = {
        version: '2.1.0',
        exportDate: new Date().toISOString(),
        systemPrompts: this.store.systemPrompts
      };
      const dataStr = JSON.stringify(systemPromptsData, null, 2);
      this.downloadJSON(dataStr, `${filename}.json`);
      console.info('导出系统提示词成功');
    } catch (error) {
      console.error('导出系统提示词失败:', error);
    }
  }
  
  // 批量管理提示词（增强版）
  batchManagePrompts(options: {
    action: 'add' | 'delete' | 'update' | 'sort';
    promptIds?: string[];
    newPrompts?: Omit<SystemPrompt, 'id'>[];
    sortBy?: 'name' | 'creationDate' | 'default';
  }): boolean {
    try {
      const { action, promptIds, newPrompts, sortBy } = options;
      
      switch (action) {
        case 'add':
          if (newPrompts && newPrompts.length > 0) {
            const addedPrompts = newPrompts.map(prompt => this.addSystemPrompt(prompt));
            console.info(`批量添加了 ${addedPrompts.length} 个提示词`);
            return true;
          }
          return false;
          
        case 'delete':
          if (promptIds && promptIds.length > 0) {
            let deletedCount = 0;
            promptIds.forEach(id => {
              if (this.removeSystemPrompt(id)) {
                deletedCount++;
              }
            });
            console.info(`批量删除了 ${deletedCount} 个提示词`);
            return deletedCount > 0;
            console.info(`批量删除了 ${deletedCount} 个提示词`);
            return deletedCount > 0;
          }
          return false;
          
        case 'update':
          // 此功能需要额外的参数，暂不实现
          return false;
          
        case 'sort':
          if (!sortBy) return false;
          
          switch (sortBy) {
            case 'name':
              this.store.systemPrompts.sort((a, b) => a.name.localeCompare(b.name));
              break;
            case 'default':
              this.store.systemPrompts.sort((a, b) => (a.isDefault === b.isDefault) ? 0 : a.isDefault ? -1 : 1);
              break;
            case 'creationDate':
              // 假设ID中包含时间戳信息
              this.store.systemPrompts.sort((a, b) => {
                const getTimestamp = (id: string) => {
                  const match = id.match(/prompt_(\d+)_/);
                  return match ? parseInt(match[1]) : 0;
                };
                return getTimestamp(b.id) - getTimestamp(a.id);
              });
              break;
            default:
              return false;
          }
          
          this.saveToStorage();
          console.info(`提示词已按 ${sortBy} 排序`);
          return true;
      }
      
      return false;
    } catch (error) {
      console.error('批量管理提示词失败:', error);
      return false;
    }
  }

  // ========== 导入功能 ==========

  // 从JSON文件导入所有设置
  async importFromJSON(file: File): Promise<PersistentStore | null> {
    try {
      const text = await file.text();
      const importedData = JSON.parse(text);
      
      if (!importedData) {
        throw new Error('无效的 JSON 文件');
      }
      
      // 验证并规范化导入的数据
      const normalizedData: PersistentStore = {
        apiConfigs: Array.isArray(importedData.apiConfigs) ? importedData.apiConfigs : [],
        systemPrompts: Array.isArray(importedData.systemPrompts) ? importedData.systemPrompts : [],
        lastSelectedApiConfigId: importedData.lastSelectedApiConfigId || null
      };
      
      // 验证数据结构
      if (this.isValidPersistentStore(normalizedData)) {
        this.replaceStore(normalizedData);
        console.info('导入配置成功，包含:', {
          apiConfigs: normalizedData.apiConfigs.length,
          systemPrompts: normalizedData.systemPrompts.length,
          lastSelected: normalizedData.lastSelectedApiConfigId
        });
        return this.store;
      } else {
        throw new Error('Invalid data format');
      }
    } catch (error) {
      console.error('导入配置失败:', error);
      return null;
    }
  }

  // 从JSON文件导入API配置
  async importApiConfigsFromJSON(file: File): Promise<PersistentStore | null> {
    try {
      const text = await file.text();
      const importedData = JSON.parse(text);
      
      if (!importedData || !importedData.apiConfigs) {
        throw new Error('无效的 API 配置文件');
      }
      
      // 合并配置而不是直接替换，避免重复配置
      const existingIds = new Set(this.store.apiConfigs.map(c => c.id));
      const uniqueConfigMap = new Map<string, ApiConfig>();
      
      // 先添加现有配置到映射
      this.store.apiConfigs.forEach(config => {
        const configKey = `${config.name}|${config.apiKey}|${config.apiProxyUrl}`;
        uniqueConfigMap.set(configKey, config);
      });
      
      // 合并导入的配置，避免重复
      let addedCount = 0;
      let updatedCount = 0;
      importedData.apiConfigs.forEach((importedConfig: ApiConfig) => {
        const configKey = `${importedConfig.name}|${importedConfig.apiKey}|${importedConfig.apiProxyUrl}`;
        
        // 如果配置完全相同，跳过
        if (uniqueConfigMap.has(configKey)) {
          return;
        }
        
        // 检查是否有相同ID的配置
        if (existingIds.has(importedConfig.id)) {
          // 生成新ID避免冲突
          importedConfig.id = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // 检查名称是否重复，添加后缀区分
        let baseName = importedConfig.name;
        let counter = 1;
        let finalName = baseName;
        
        while (Array.from(uniqueConfigMap.values()).some(c => c.name === finalName)) {
          finalName = `${baseName} (${++counter})`;
        }
        
        if (finalName !== importedConfig.name) {
          importedConfig.name = finalName;
        }
        
        // 添加到映射
        const newKey = `${importedConfig.name}|${importedConfig.apiKey}|${importedConfig.apiProxyUrl}`;
        uniqueConfigMap.set(newKey, importedConfig);
        addedCount++;
      });
      
      // 更新存储
      this.store.apiConfigs = Array.from(uniqueConfigMap.values());
      
      // 更新最后选择的ID（如果存在）
      if (importedData.lastSelectedApiConfigId) {
        // 检查选择的ID是否在合并后的配置列表中
        const selectedConfigExists = this.store.apiConfigs.some(
          c => c.id === importedData.lastSelectedApiConfigId
        );
        
        if (selectedConfigExists) {
          this.store.lastSelectedApiConfigId = importedData.lastSelectedApiConfigId;
        }
      }
      
      this.saveToStorage();
      console.info(`导入 API 配置成功 (新增: ${addedCount}, 更新: ${updatedCount})`);
      return this.store;
    } catch (error) {
      console.error('导入 API 配置失败:', error);
      return null;
    }
  }

  // 从JSON文件导入系统提示词
  async importSystemPromptsFromJSON(file: File): Promise<PersistentStore | null> {
    try {
      const text = await file.text();
      const importedData = JSON.parse(text);
      
      if (!importedData || !importedData.systemPrompts) {
        throw new Error('无效的系统提示词文件');
      }
      
      this.store.systemPrompts = importedData.systemPrompts;
      this.saveToStorage();
      console.info('导入系统提示词成功');
      return this.store;
    } catch (error) {
      console.error('导入系统提示词失败:', error);
      return null;
    }
  }

  // 批量导入数据（向后兼容）
  importData(data: Partial<PersistentStore> & { version?: string }): void {
    // 检查版本和兼容性
    const version = data.version || '1.0';
    const isCompatible = this.checkVersionCompatibility(version);
    
    if (!isCompatible) {
      console.warn(`导入数据版本 ${version} 可能与当前应用不兼容，尝试继续导入...`);
    }
    
    this.store = {
      ...this.DEFAULT_PERSISTENT_STORE,
      ...this.store,
      ...data,
      systemPrompts: data.systemPrompts || this.store.systemPrompts
    };
    this.saveToStorage();
    console.info('导入配置数据成功');
  }
  
  // 检查版本兼容性
  checkVersionCompatibility(version: string): boolean {
    // 当前支持的最低版本
    const minSupportedVersion = '1.0';
    // 当前应用版本
    const currentVersion = '2.1.0';
    
    try {
      // 简单版本比较
      const vParts = version.split('.').map(Number);
      const minParts = minSupportedVersion.split('.').map(Number);
      
      for (let i = 0; i < Math.min(vParts.length, minParts.length); i++) {
        if (vParts[i] < minParts[i]) {
          return false;
        }
        if (vParts[i] > minParts[i]) {
          return true;
        }
      }
      
      return vParts.length >= minParts.length;
    } catch (e) {
      console.error('版本比较失败:', e);
      return false;
    }
  }

  // ========== 辅助方法 ==========

  // 验证持久化存储数据结构
  private isValidPersistentStore(data: any): data is PersistentStore {
    return (
      data &&
      typeof data === 'object' &&
      Array.isArray(data.apiConfigs) &&
      Array.isArray(data.systemPrompts) &&
      (data.lastSelectedApiConfigId === null || typeof data.lastSelectedApiConfigId === 'string')
    );
  }

  // 下载JSON文件
  private downloadJSON(dataStr: string, filename: string): void {
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // 清除所有数据
  clearStore(): void {
    localStorage.removeItem(this.STORE_KEY);
    this.store = { ...this.DEFAULT_PERSISTENT_STORE };
  }

  // 清理方法（用于"清除历史"功能）
  clearAll(): void {
    this.clearStore();
    console.info('Cleared all persistent store data');
  }
  
  // 分析API配置使用情况
  analyzeApiUsage(): { 
    totalConfigs: number;
    activeConfigs: number;
    usageStats: {configId: string; name: string; usageCount: number}[];
  } {
    const configs = this.getApiConfigs();
    
    // 这个功能需要与用户历史记录整合
    // 目前只返回基本配置信息
    return {
      totalConfigs: configs.length,
      activeConfigs: configs.filter(c => c.apiKey && c.apiKey.trim() !== '').length,
      usageStats: configs.map(c => ({
        configId: c.id,
        name: c.name,
        usageCount: c.isDefault ? 1 : 0 // 默认值
      }))
    };
  }
  
  // 检查API配置可用性
  async checkApiConfigAvailability(configId: string): Promise<{
    available: boolean;
    latency?: number;
    error?: string;
  }> {
    try {
      const config = this.getApiConfigById(configId);
      if (!config) {
        return { available: false, error: 'API配置不存在' };
      }
      
      // 简单的延迟测试，实际应用中需要替换为真正的API调用
      const start = Date.now();
      await new Promise(resolve => setTimeout(resolve, 300)); // 模拟网络请求
      const latency = Date.now() - start;
      
      // 判断是否可用的逻辑（示例）
      const available = !!config.apiKey || 
                       (config.apiProxyUrl && config.apiProxyUrl !== '');
      
      return {
        available,
        latency,
        error: available ? undefined : 'API密钥为空或代理URL无效'
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }
}

export const persistentStoreService = new PersistentStoreService();

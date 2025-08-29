import { ChatMessage, ContentPart, UploadedFile, ChatHistoryItem, AppSettings, ChatSettings, SavedChatSession } from '../types';
import { ThemeColors } from '../constants/themeConstants';
import { SUPPORTED_IMAGE_MIME_TYPES, SUPPORTED_TEXT_MIME_TYPES } from '../constants/fileConstants';
import { logService } from '../services/logService';

export { logService };

export const getResponsiveValue = <T>(mobileValue: T, desktopValue: T, breakpoint: number = 640): T => {
    if (typeof window !== 'undefined' && window.innerWidth < breakpoint) {
        return mobileValue;
    }
    return desktopValue;
};

export const translations = {
    // App.tsx
    appLoadingModels: { en: 'Loading models...', zh: '加载模型中...' },
    appVerifyingModel: { en: 'Verifying model...', zh: '验证模型中...' },
    appSwitchingModel: { en: 'Switching model...', zh: '切换模型中...' },
    appNoModelsAvailable: { en: 'No models available', zh: '无可用模型' },
    appNoModelSelected: { en: 'No model selected', zh: '未选择模型' },
    appDragDropRelease: { en: 'Release to upload supported files', zh: '释放以上传支持的文件' },
    appDragDropHelpText: { en: 'Images, Audio, PDFs & Text files', zh: '支持图片、音频、PDF和文本文件' },

    // Header.tsx
    historySidebarClose: { en: 'Close history sidebar', zh: '关闭历史记录侧边栏' },
    historySidebarOpen: { en: 'Open history sidebar', zh: '打开历史记录侧边栏' },
    historySidebarClose_short: { en: 'Close History', zh: '关闭历史' },
    historySidebarOpen_short: { en: 'Open History', zh: '打开历史' },
    headerModelSelectorNoModels: { en: 'No models available.', zh: '无可用模型。' },
    canvasHelperActive_aria: { en: 'Canvas Helper system prompt is active. Click to remove.', zh: 'Canvas 助手系统提示已激活。点击移除。' },
    canvasHelperInactive_aria: { en: 'Load Canvas Helper system prompt and save settings', zh: '加载 Canvas 助手系统提示并保存设置' },
    canvasHelperActive_title: { en: 'Canvas Helper prompt is active. Click to remove.', zh: 'Canvas 助手提示已激活。点击移除。' },
    canvasHelperInactive_title: { en: 'Load Canvas Helper Prompt and save', zh: '加载 Canvas 助手提示并保存' },
    scenariosManage_aria: { en: 'Manage Preloaded Scenarios', zh: '管理预加载场景' },
    scenariosManage_title: { en: 'Manage Scenarios', zh: '管理场景' },
    settingsOpen_aria: { en: 'Open Chat Settings', zh: '打开聊天设置' },
    settingsOpen_title: { en: 'Chat Settings', zh: '聊天设置' },
    headerNewChat_aria: { en: 'Start a new chat session', zh: '开始新聊天会话' },

    // ChatInput.tsx
    aspectRatio_title: { en: 'Aspect Ratio', zh: '宽高比' },
    addById_placeholder: { en: 'Paste File ID (e.g., files/xyz123)', zh: '粘贴文件 ID (例如 files/xyz123)' },
    addById_aria: { en: 'File ID input', zh: '文件 ID 输入框' },
    add_button: { en: 'Add', zh: '添加' },
    addById_button_aria: { en: 'Add file by ID', zh: '通过 ID 添加文件' },
    cancel_button: { en: 'Cancel', zh: '取消' },
    cancelAddById_button_aria: { en: 'Cancel adding file by ID', zh: '取消通过 ID 添加文件' },
    attachMenu_title: { en: 'Attach file', zh: '附加文件' },
    attachMenu_aria: { en: 'Attach file menu', zh: '附加文件菜单' },
    attachMenu_upload: { en: 'Upload from Device', zh: '从设备上传' },
    attachMenu_gallery: { en: 'Gallery', zh: '图库' },
    attachMenu_uploadVideo: { en: 'Upload Video', zh: '上传视频' },
    attachMenu_takePhoto: { en: 'Take Photo', zh: '拍照' },
    attachMenu_recordAudio: { en: 'Record Audio', zh: '录音' },
    attachMenu_addById: { en: 'Add by File ID', zh: '通过文件 ID 添加' },
    attachMenu_createText: { en: 'Create Text File', zh: '创建文本文件' },
    voiceInput_stop_aria: { en: 'Stop recording', zh: '停止录音' },
    cancelRecording_aria: { en: 'Cancel recording', zh: '取消录音' },
    voiceInput_transcribing_aria: { en: 'Transcribing...', zh: '转录中...' },
    voiceInput_start_aria: { en: 'Start voice input', zh: '开始语音输入' },
    stopGenerating_aria: { en: 'Stop generating response', zh: '停止生成回应' },
    stopGenerating_title: { en: 'Stop Generating', zh: '停止生成' },
    cancelEdit_aria: { en: 'Cancel editing', zh: '取消编辑' },
    cancelEdit_title: { en: 'Cancel Edit', zh: '取消编辑' },
    updateMessage_aria: { en: 'Update message', zh: '更新消息' },
    updateMessage_title: { en: 'Update & Send', zh: '更新并发送' },
    sendMessage_aria: { en: 'Send message', zh: '发送消息' },
    sendMessage_title: { en: 'Send', zh: '发送' },
    tools_button: { en: 'Tools', zh: '工具' },
    web_search_label: { en: 'Web Search', zh: '搜索' },
    code_execution_label: { en: 'Code Execution', zh: '代码执行' },

    // MessageList.tsx and sub-components
    imageZoom_title: { en: 'Zoomed Image: {filename}', zh: '图片缩放: {filename}' },
    imageZoom_close_aria: { en: 'Close image zoom view', zh: '关闭图片缩放视图' },
    imageZoom_close_title: { en: 'Close (Esc)', zh: '关闭 (Esc)' },
    welcome_greeting: { en: 'How can I help you today?', zh: '今天有什么可以帮您？' },
    welcome_suggestion_title: { en: 'Suggested', zh: '建议' },
    suggestion_summarize_title: { en: 'Summarize article', zh: '总结文章' },
    suggestion_summarize_desc: { en: 'Summarize the following article', zh: '总结下面文章' },
    suggestion_explain_title: { en: 'Explain concept', zh: '解释概念' },
    suggestion_explain_desc: { en: 'Explain this concept to a beginner', zh: '向初学者解释这个概念' },
    suggestion_translate_title: { en: 'Translate', zh: '翻译' },
    suggestion_translate_desc: { en: 'Translate the following to Chinese', zh: '将以下内容翻译成中文' },
    suggestion_ocr_title: { en: 'Extract from image', zh: '从图片提取' },
    suggestion_ocr_desc: { en: 'Extract text from the attached image', zh: '从附加的图片中提取文字' },
    suggestion_prompt_label: { en: 'Prompt', zh: '提示' },
    welcome_title: { en: 'Welcome to All Model Chat', zh: '欢迎使用 All Model Chat' },
    welcome_p1: { en: 'Start a conversation by typing below. You can also attach files, load scenarios via the', zh: '在下方输入文字开始对话。您也可以附加文件，或通过' },
    welcome_p2: { en: 'Manage Scenarios', zh: '管理场景' },
    welcome_p3: { en: 'button, or configure settings.', zh: '按钮加载场景，或进行设置。' },
    edit_button_title: { en: 'Edit', zh: '编辑' },
    retry_button_title: { en: 'Retry', zh: '重试' },
    delete_button_title: { en: 'Delete', zh: '删除' },
    copy_button_title: { en: 'Copy content', zh: '复制内容' },
    copied_button_title: { en: 'Copied!', zh: '已复制！' },
    export_as_title: { en: 'Export as {type}', zh: '导出为 {type}' },
    exporting_title: { en: 'Exporting {type}...', zh: '正在导出 {type}...' },
    exported_title: { en: '{type} Exported!', zh: '{type} 已导出！' },
    export_failed_title: { en: 'Export failed.', zh: '导出失败。' },
    tokens_unit: { en: 'tokens', zh: '个令牌' },
    thinking_text: { en: 'Thinking...', zh: '思考中...' },
    thinking_took_time: { en: 'Thought for {seconds} seconds', zh: '思考了 {seconds} 秒' },
    cancelled_by_user: { en: '[Cancelled by user]', zh: '[用户已取消]' },
    stopped_by_user: { en: '[Stopped by user]', zh: '[用户已停止]' },

    // Settings Modal and subcomponents
    settingsTitle: { en: 'App Settings', zh: '应用设置' },
    settingsDataManagement: { en: 'Data Management', zh: '数据管理' },
    settingsApiConfig: { en: 'API Configuration', zh: 'API 配置' },
    settingsUseCustomApi: { en: 'Use Custom API Configuration', zh: '使用自定义 API 配置' },
    settingsApiKey: { en: 'Gemini API Key(s)', zh: 'Gemini API 密钥' },
    settingsApiKeyHelpText: { en: 'You can enter multiple keys, one per line. A random key will be used for each new chat session.', zh: '您可以输入多个密钥，每行一个。每个新聊天会话将随机使用一个密钥。' },
    settingsAppearance: { en: 'Appearance', zh: '外观' },
    settingsTheme: { en: 'Theme (Global)', zh: '主题 (全局)' },
    settingsFontSize: { en: 'Base Font Size', zh: '基础字号' },
    settingsLanguage: { en: 'Language', zh: '语言' },
    settingsLanguageSystem: { en: 'System Default', zh: '跟随系统' },
    settingsLanguageEn: { en: 'English', zh: 'English' },
    settingsLanguageZh: { en: 'Chinese', zh: '中文' },
    settingsChatBehavior: { en: 'Chat Behavior (for New Chats)', zh: '聊天行为 (用于新对话)' },
    settingsModel: { en: 'AI Model', zh: 'AI 模型' },
    settingsTtsVoice: { en: 'TTS Voice', zh: 'TTS 语音' },
    settingsSystemPrompt: { en: 'System Prompt', zh: '系统提示' },
    settingsTemperature: { en: 'Temperature', zh: '温度' },
    settingsTopP: { en: 'Top P', zh: 'Top P' },
    settingsShowThoughts: { en: "Assistant's Thinking", zh: '助手思考模式' },
    settingsThinkingBudget: { en: 'Thinking Budget', zh: '思考预算' },
    settingsThinkingBudget_tooltip: { en: 'Set token budget for thinking. -1 for auto/unlimited, 0 to disable (like toggle off), >0 for specific token limit.', zh: '设置思考的令牌预算。-1 为自动/无限制，0 为禁用（与关闭开关效果相同），大于 0 为指定的令牌限制。' },
    settingsThinkingBudget_placeholder: { en: 'e.g., -1 for auto', zh: '例如：-1 代表自动' },
    settingsTranscriptionThinking: { en: 'Enable Thinking for Voice Input', zh: '启用语音输入思考功能' },
    settingsReset: { en: 'Reset', zh: '重置' },
    settingsClearHistory: { en: 'Clear History', zh: '清空历史' },
    settingsClearHistory_aria: { en: 'Clear all chat history', zh: '清空所有聊天记录' },
    settingsClearHistory_confirm: { en: 'Are you sure you want to clear ALL chat history?\n\nThis action cannot be undone.', zh: '您确定要清除所有聊天记录吗？\n\n此操作无法撤销。' },
    settingsClearCache: { en: 'Clear Cache', zh: '清除缓存' },
    settingsClearCache_aria: { en: 'Clear all cached application data', zh: '清除所有缓存的应用数据' },
    settingsClearCache_confirm: { en: "Are you sure you want to clear all cached application data?\n\nThis will remove:\n- Saved settings\n- Chat history\n- Preloaded scenarios\n\nThis action cannot be undone.", zh: '您确定要清除所有缓存的应用程序数据吗？\n\n这将删除：\n- 已保存的设置\n- 聊天记录\n- 预加载的场景\n\n此操作无法撤销。'},
    settingsCancel: { en: 'Cancel', zh: '取消' },
    settingsSave: { en: 'Save', zh: '保存' },
    apiConfig_default_info: { en: 'Using default API setup from environment. Enable for custom settings.', zh: '正在使用环境中的默认 API 配置。启用以进行自定义设置。' },
    apiConfig_key_placeholder: { en: 'Enter your Gemini API Key(s)', zh: '输入您的 Gemini API 密钥' },
    apiConfig_key_placeholder_disabled: { en: 'Using default', zh: '使用默认值' },
    chatBehavior_voiceModel_label: { en: 'Voice Input Model', zh: '语音输入模型' },
    chatBehavior_voiceModel_tooltip: { en: 'Selects the model used for transcribing voice input to text.', zh: '选择用于将语音输入转录为文本的模型。' },
    chatBehavior_transcriptionThinking_tooltip: { en: "When enabled, the model dynamically decides how much to 'think' for optimal accuracy (budget: -1). When disabled, thinking is turned off to prioritize speed (budget: 0).", zh: "启用时，模型会动态决定“思考”量以获得最佳准确性（预算：-1）。禁用时，将关闭思考以优先考虑速度（预算：0）。" },
    chatBehavior_temp_tooltip: { en: "Controls randomness. Lower values (~0.2) make the model more deterministic and focused. Higher values (~1.0) make it more creative and diverse.", zh: "控制随机性。较低的值（~0.2）使模型更具确定性和专注性。较高的值（~1.0）使其更具创造性和多样性。" },
    chatBehavior_topP_tooltip: { en: "Controls diversity by sampling from a probability mass. Lower values (~0.1) keep the model's choices very focused, while higher values (~0.95) allow for more variety.", zh: "通过从概率质量中采样来控制多样性。较低的值（~0.1）使模型的选择非常集中，而较高的值（~0.95）则允许更多变化。" },
    chatBehavior_enableThoughts_tooltip: { en: "Controls the model's thinking process. 'Off' prioritizes speed. 'Auto' lets the model decide for best quality. 'Manual' allows setting a specific token budget for thinking. Affects models like Gemini 2.5 Pro/Flash.", zh: "控制模型的思考过程。“关闭”优先考虑速度。“自动”让模型自行决定以获得最佳质量。“手动”允许为思考设置特定的令牌预算。影响 Gemini 2.5 Pro/Flash 等模型。" },
    chatBehavior_systemPrompt_placeholder: { en: 'e.g., You are a helpful AI assistant.', zh: '例如：你是一个乐于助人的 AI 助手。' },
    chatBehavior_model_loading: { en: 'Loading models...', zh: '加载模型中...' },
    chatBehavior_model_noModels: { en: 'No models available', zh: '无可用模型' },
    settings_useFilesApiForImages_label: { en: 'Upload Images via File API', zh: '通过 File API 上传图片' },
    settings_useFilesApiForImages_tooltip: { en: 'When enabled, images are uploaded and referenced via the File API instead of being sent inline. This is required for some models and can help with very large images.', zh: '启用后，图片将通过 File API 上传和引用，而不是内联发送。某些模型需要此功能，并且有助于处理非常大的图片。' },
    settings_expandCodeBlocksByDefault_label: { en: 'Expand Code Blocks by Default', zh: '默认展开代码块' },
    
    // PreloadedMessagesModal.tsx
    scenarios_title: { en: 'Manage Preloaded Scenarios', zh: '管理预加载场景' },
    scenarios_close_aria: { en: 'Close scenarios manager', zh: '关闭场景管理器' },
    scenarios_feedback_emptyContent: { en: 'Message content cannot be empty.', zh: '消息内容不能为空。' },
    scenarios_feedback_updated: { en: 'Message updated.', zh: '消息已更新。' },
    scenarios_feedback_added: { en: 'Message added.', zh: '消息已添加。' },
    scenarios_feedback_saved: { en: 'Scenario saved!', zh: '场景已保存！' },
    scenarios_feedback_empty: { en: 'Scenario is empty. Add some messages first.', zh: '场景为空。请先添加一些消息。' },
    scenarios_feedback_loaded: { en: 'Current scenario loaded into chat!', zh: '当前场景已加载到聊天中！' },
    scenarios_feedback_liberatorLoaded: { en: 'Liberator scenario loaded!', zh: '解放者场景已加载！' },
    scenarios_feedback_cleared: { en: 'Scenario cleared.', zh: '场景已清除。' },
    scenarios_feedback_emptyExport: { en: 'Scenario is empty. Nothing to export.', zh: '场景为空，无可导出内容。' },
    scenarios_feedback_exported: { en: 'Scenario exported!', zh: '场景已导出！' },
    scenarios_feedback_imported: { en: 'Scenario imported successfully!', zh: '场景导入成功！' },
    scenarios_feedback_importFailed: { en: 'Failed to import scenario. Invalid file format or content.', zh: '场景导入失败。文件格式或内容无效。' },
    scenarios_feedback_importError: { en: 'Import error: {error}', zh: '导入错误：{error}' },
    scenarios_editor_edit_title: { en: 'Edit Message', zh: '编辑消息' },
    scenarios_editor_add_title: { en: 'Add New Message', zh: '添加新消息' },
    scenarios_editor_role_aria: { en: 'Select message role', zh: '选择消息角色' },
    scenarios_editor_role_user: { en: 'User', zh: '用户' },
    scenarios_editor_role_model: { en: 'Model', zh: '模型' },
    scenarios_editor_content_placeholder: { en: 'Enter message content...', zh: '输入消息内容...' },
    scenarios_editor_cancel_button: { en: 'Cancel Edit', zh: '取消编辑' },
    scenarios_editor_update_button: { en: 'Update Message', zh: '更新消息' },
    scenarios_editor_add_button: { en: 'Add Message', zh: '添加消息' },
    scenarios_empty_list: { en: 'No messages in this scenario yet. Add some above!', zh: '此场景中尚无消息。请在上方添加！' },
    scenarios_import_button: { en: 'Import', zh: '导入' },
    scenarios_import_title: { en: 'Import scenario from JSON file', zh: '从 JSON 文件导入场景' },
    scenarios_export_button: { en: 'Export', zh: '导出' },
    scenarios_export_title: { en: 'Export current scenario to JSON file', zh: '将当前场景导出为 JSON 文件' },
    scenarios_liberator_button: { en: 'Load Liberator Scenario', zh: '加载解放者场景' },
    scenarios_liberator_title: { en: 'Load the predefined \'Liberator\' scenario', zh: '加载预定义的“解放者”场景' },
    scenarios_clear_button: { en: 'Clear', zh: '清除' },
    scenarios_clear_title: { en: 'Clear scenario editor', zh: '清除场景编辑器' },
    scenarios_close_button: { en: 'Close', zh: '关闭' },
    scenarios_close_title: { en: 'Close editor', zh: '关闭编辑器' },
    scenarios_load_button: { en: 'Load', zh: '加载' },
    scenarios_load_title: { en: 'Load scenario into chat', zh: '将场景加载到聊天中' },
    scenarios_save_button: { en: 'Save', zh: '保存' },
    scenarios_save_title: { en: 'Save scenario & close', zh: '保存并关闭' },
    scenarios_moveUp_title: { en: 'Move up', zh: '上移' },
    scenarios_moveDown_title: { en: 'Move down', zh: '下移' },
    scenarios_edit_title: { en: 'Edit message', zh: '编辑消息' },
    scenarios_delete_title: { en: 'Delete message', zh: '删除消息' },

    // HistorySidebar.tsx
    history_title: { en: 'History', zh: '历史记录' },
    history_recent_chats: { en: 'Recent Chats', zh: '近期对话' },
    history_empty: { en: 'No chat history yet.', zh: '暂无聊天记录。' },
    history_delete_aria: { en: 'Delete chat: {title}', zh: '删除对话：{title}' },
    history_delete_title: { en: 'Delete Chat', zh: '删除对话' },
    history_search_placeholder: { en: 'Search history...', zh: '搜索历史...' },
    history_search_aria: { en: 'Search chat history', zh: '搜索聊天记录' },
    history_search_clear_aria: { en: 'Clear search', zh: '清除搜索' },
    history_search_no_results: { en: 'No results found.', zh: '未找到结果。' },
    
    // ChatInputPlaceholder
    chatInputPlaceholder: { en: 'Ask anything...', zh: '询问任何问题' },
    
    // Header
    headerTitle: { en: 'All Model Chat', zh: 'All Model Chat' },
    headerNewChat: { en: 'New Chat', zh: '发起新对话' },
    headerStream: { en: 'Stream', zh: '流式' },
    headerModelSelectorTooltip_current: { en: 'Current Model', zh: '当前模型' },
    headerModelSelectorTooltip_action: { en: `Click to change, or press 'Tab' to cycle`, zh: `点击更改，或按 'Tab' 键循环切换` },
    headerModelAriaLabel_current: { en: 'Current AI Model', zh: '当前 AI 模型' },
    headerModelAriaLabel_action: { en: `Click to change model`, zh: `点击更改模型` },
    
    // HelpModal.tsx
    helpModal_title: { en: 'Help & Commands', zh: '帮助和命令' },
    helpModal_close_aria: { en: 'Close help modal', zh: '关闭帮助模态框' },
};

export const getActiveApiConfig = (appSettings: AppSettings): { apiKeysString: string | null } => {
    if (appSettings.useCustomApiConfig) {
        return {
            apiKeysString: appSettings.apiKey,
        };
    }
    return {
        apiKeysString: process.env.API_KEY || null,
    };
};

export const getKeyForRequest = (
    appSettings: AppSettings,
    currentChatSettings: ChatSettings
): { key: string; isNewKey: boolean } | { error: string } => {
    const logUsage = (key: string) => {
        if (appSettings.useCustomApiConfig) {
            logService.recordApiKeyUsage(key);
        }
    };

    if (currentChatSettings.lockedApiKey) {
        logUsage(currentChatSettings.lockedApiKey);
        return { key: currentChatSettings.lockedApiKey, isNewKey: false };
    }

    const { apiKeysString } = getActiveApiConfig(appSettings);
    if (!apiKeysString) {
        return { error: "API Key not configured." };
    }
    const availableKeys = apiKeysString.split('\n').map(k => k.trim()).filter(Boolean);
    if (availableKeys.length === 0) {
        return { error: "No valid API keys found." };
    }

    const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    logUsage(randomKey);
    return { key: randomKey, isNewKey: true };
};

export const getTranslator = (lang: 'en' | 'zh') => (key: keyof typeof translations | string, fallback?: string): string => {
    if (key in translations) {
        return translations[key as keyof typeof translations]?.[lang] ?? fallback ?? translations[key as keyof typeof translations]?.['en'] ?? key;
    }
    return fallback ?? key;
};

export const generateUniqueId = () => `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export const generateSessionTitle = (messages: ChatMessage[]): string => {
    const firstUserMessage = messages.find(msg => msg.role === 'user' && msg.content.trim() !== '');
    if (firstUserMessage) {
      return firstUserMessage.content.split(/\s+/).slice(0, 7).join(' ') + (firstUserMessage.content.split(/\s+/).length > 7 ? '...' : '');
    }
    const firstModelMessage = messages.find(msg => msg.role === 'model' && msg.content.trim() !== '');
     if (firstModelMessage) {
      return "Model: " + firstModelMessage.content.split(/\s+/).slice(0, 5).join(' ') + (firstModelMessage.content.split(/\s+/).length > 5 ? '...' : '');
    }
    const firstFile = messages.find(msg => msg.files && msg.files.length > 0)?.files?.[0];
    if (firstFile) {
        return `Chat with ${firstFile.name}`;
    }
    return 'New Chat';
};

export const generateThemeCssVariables = (colors: ThemeColors): string => {
  let css = ':root {\n';
  for (const [key, value] of Object.entries(colors)) {
    const cssVarName = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    css += `  ${cssVarName}: ${value};\n`;
  }
  css += `  --markdown-code-bg: ${colors.bgCodeBlock || colors.bgInput };\n`;
  css += `  --markdown-code-text: ${colors.textCode};\n`;
  css += `  --markdown-pre-bg: ${colors.bgCodeBlock || colors.bgSecondary};\n`;
  css += `  --markdown-link-text: ${colors.textLink};\n`;
  css += `  --markdown-blockquote-text: ${colors.textTertiary};\n`;
  css += `  --markdown-blockquote-border: ${colors.borderSecondary};\n`;
  css += `  --markdown-hr-bg: ${colors.borderSecondary};\n`;
  css += `  --markdown-table-border: ${colors.borderSecondary};\n`;
  css += '}';
  return css;
};

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            if (base64Data) {
                resolve(base64Data);
            } else {
                reject(new Error("Failed to extract base64 data from file."));
            }
        };
        reader.onerror = error => reject(error);
    });
};

export const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

export const fileToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file, 'utf-8');
    });
};

export const buildContentParts = async (text: string, files: UploadedFile[] | undefined): Promise<ContentPart[]> => {
  const dataParts: ContentPart[] = [];

  if (files) {
    for (const file of files) {
      if (file.isProcessing || file.error || file.uploadState !== 'active') {
        continue;
      }
      
      // Handle images (existing logic)
      if (file.type && SUPPORTED_IMAGE_MIME_TYPES.includes(file.type) && !file.fileUri) {
        let base64Data = file.base64Data;
        
        // This is the new on-demand conversion logic
        if (!base64Data && file.rawFile) {
          try {
            base64Data = await fileToBase64(file.rawFile);
          } catch (error) {
            logService.error(`Failed to convert rawFile to base64 for ${file.name}`, { error });
            continue;
          }
        } else if (!base64Data && file.dataUrl?.startsWith('blob:')) {
          // This handles retries where we only have the blob URL
          try {
            const response = await fetch(file.dataUrl);
            const blob = await response.blob();
            const tempFile = new File([blob], file.name, { type: file.type });
            base64Data = await fileToBase64(tempFile);
          } catch (error) {
            logService.error(`Failed to fetch blob and convert to base64 for ${file.name}`, { error });
            continue;
          }
        }
        
        if (base64Data && file.type) {
          dataParts.push({ inlineData: { mimeType: file.type, data: base64Data } });
        }
      } 
      // Handle files uploaded to API (existing logic)
      else if (file.fileUri && file.type) {
        dataParts.push({ fileData: { mimeType: file.type, fileUri: file.fileUri } });
      } 
      // Enhanced text file handling (optimized logic)
      else if (file.rawFile && file.type && SUPPORTED_TEXT_MIME_TYPES.includes(file.type)) {
        try {
          const textContent = await fileToText(file.rawFile);
          const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'txt';
          
          // Create structured content with file context
          const structuredContent = `**📄 文件内容 [${file.name}]**\n\n` +
            `文件类型: ${file.type}\n` +
            `文件大小: ${(file.size / 1024).toFixed(1)}KB\n` +
            `文件格式: .${fileExtension}\n\n` +
            `内容:\n${'```' + (fileExtension === 'json' ? 'json' : fileExtension === 'js' ? 'javascript' : fileExtension)}\n${textContent}\n${'```'}`;
          
          dataParts.push({ text: structuredContent });
          logService.info(`Included enhanced text file content: ${file.name} (${file.type})`);
        } catch (error) {
          logService.error(`Failed to read text file: ${file.name}`, { error });
          continue;
        }
      }
      // Fallback for local text files with basic type (legacy support)
      else if (file.rawFile && file.type === 'text/plain') {
        try {
          const textContent = await fileToText(file.rawFile);
          dataParts.push({ text: `[文件: ${file.name}]\n\n${textContent}` });
          logService.info(`Included local text file content: ${file.name}`);
        } catch (error) {
          logService.error(`Failed to read local text file: ${file.name}`, { error });
          continue;
        }
      }
    }
  }

  const userTypedText = text.trim();
  const contentPartsResult: ContentPart[] = [];

  if (userTypedText) {
    contentPartsResult.push({ text: userTypedText });
  }
  contentPartsResult.push(...dataParts);

  return contentPartsResult;
};

export const createChatHistoryForApi = async (msgs: ChatMessage[]): Promise<ChatHistoryItem[]> => {
    const historyItemsPromises = msgs
      .filter(msg => msg.role === 'user' || msg.role === 'model')
      .map(async (msg) => {
        let apiParts: ContentPart[];
        if (msg.role === 'user') {
          apiParts = await buildContentParts(msg.content, msg.files);
        } else {
          apiParts = [{ text: msg.content || "" }];
        }
        return { role: msg.role as 'user' | 'model', parts: apiParts };
      });
      
    return Promise.all(historyItemsPromises);
  };

export function pcmBase64ToWavUrl(
  base64: string,
  sampleRate = 24_000,
  numChannels = 1,
): string {
  const pcm = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  // Write WAV header
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const wav = new ArrayBuffer(44 + pcm.length);
  const dv = new DataView(wav);

  let p = 0;
  const writeStr = (s: string) => [...s].forEach(ch => dv.setUint8(p++, ch.charCodeAt(0)));

  writeStr('RIFF');
  dv.setUint32(p, 36 + pcm.length, true); p += 4;
  writeStr('WAVEfmt ');
  dv.setUint32(p, 16, true); p += 4;        // fmt length
  dv.setUint16(p, 1, true);  p += 2;        // PCM
  dv.setUint16(p, numChannels, true); p += 2;
  dv.setUint32(p, sampleRate, true); p += 4;
  dv.setUint32(p, sampleRate * blockAlign, true); p += 4;
  dv.setUint16(p, blockAlign, true); p += 2;
  dv.setUint16(p, bytesPerSample * 8, true); p += 2;
  writeStr('data');
  dv.setUint32(p, pcm.length, true); p += 4;

  new Uint8Array(wav, 44).set(pcm);
  return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
}

export const formatTimestamp = (timestamp: number, lang: 'en' | 'zh'): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

  // Intl.RelativeTimeFormat expects a non-zero value.
  if (Math.abs(diffSeconds) < 1) {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(0, 'second');
  }

  if (Math.abs(diffSeconds) < 60) {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-diffSeconds, 'second');
  }
  
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
     return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-diffDays, 'day');
  }
  
  return date.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
};

export const applyImageCachePolicy = (sessions: SavedChatSession[]): SavedChatSession[] => {
    // 创建一个深拷贝，以避免直接修改原始状态
    const sessionsCopy = JSON.parse(JSON.stringify(sessions));
    
    // 计算出24小时前的时间点
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    logService.debug('Applying time-based image cache policy: Pruning image data older than 24 hours.');

    sessionsCopy.forEach((session: SavedChatSession) => {
        if (session.messages && Array.isArray(session.messages)) {
            session.messages.forEach((message: ChatMessage) => {
                // 将消息的时间戳安全地转换为数字格式
                const messageTime = new Date(message.timestamp).getTime();

                if (messageTime < twentyFourHoursAgo) {
                    if (message.files && Array.isArray(message.files)) {
                        message.files.forEach((file: UploadedFile) => {
                            // Enhanced robustness: check if file.type exists before comparing
                            if (file.type && SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
                                if (file.dataUrl) delete file.dataUrl;
                                if (file.base64Data) delete file.base64Data;
                                logService.debug(`Pruned image data for ${file.name} (older than 24h)`);
                            }
                        });
                    }
                }
            });
        }
    });

    return sessionsCopy;
};
  
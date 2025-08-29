import { useState, useRef } from 'react';
import { AttachmentAction } from '../components/chat/input/AttachmentMenu';

interface UseChatInputModalsProps {
  onProcessFiles: (files: File[]) => Promise<void>;
  // TODO: 未来版本可添加智能分析回调接口
  justInitiatedFileOpRef: React.MutableRefObject<boolean>;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

export const useChatInputModals = ({
  onProcessFiles,
  justInitiatedFileOpRef,
  textareaRef,
}: UseChatInputModalsProps) => {
  const [showCreateTextFileEditor, setShowCreateTextFileEditor] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showAddByIdInput, setShowAddByIdInput] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleAttachmentAction = (action: AttachmentAction) => {
    switch (action) {
      case 'upload': fileInputRef.current?.click(); break;
      case 'gallery': imageInputRef.current?.click(); break;
      case 'video': videoInputRef.current?.click(); break;
      case 'camera': setShowCamera(true); break;
      case 'recorder': setShowRecorder(true); break;
      case 'id': setShowAddByIdInput(true); break;
      case 'text': setShowCreateTextFileEditor(true); break;
    }
  };

  const handleConfirmCreateTextFile = async (content: string, filename: string) => {
    justInitiatedFileOpRef.current = true;
    const sanitizeFilename = (name: string): string => {
      let saneName = name.trim().replace(/[<>:"/\\|?*]+/g, '_');
      if (!saneName.toLowerCase().endsWith('.txt')) saneName += '.txt';
      return saneName;
    };
    const finalFilename = filename.trim() ? sanitizeFilename(filename) : `custom-text-${Date.now()}.txt`;
    
    // 检查内容长度，如果较长则询问用户是否要智能分析
    if (content.trim().length > 3000) {
      const shouldAnalyze = confirm(
        `检测到文本内容较长（${content.length} 字符）。\n\n` +
        `您希望如何处理这个文本？\n\n` +
        `• 点击"确定" - 进行智能分段分析（推荐）\n` +
        `• 点击"取消" - 作为普通文件上传\n\n` +
        `智能分析将对文本进行深度理解，提取关键信息和洞察。`
      );
      
      if (shouldAnalyze) {
        // 使用全局智能分析处理函数（后续版本将改进此处设计）
        if (typeof (window as any).triggerIntelligentAnalysis === 'function') {
          (window as any).triggerIntelligentAnalysis(content, finalFilename);
          setShowCreateTextFileEditor(false);
          return;
        }
      }
    }
    
    try {
      // 普通文件处理流程
      const newFile = new File([content], finalFilename, { type: "text/plain" });
      
      // 对于本地处理的简单文本文件，不需要API验证
      // 创建一个特殊标记，用于标识这是一个本地处理的文本文件
      Object.defineProperty(newFile, 'isLocalTextFile', {
        value: true,
        writable: false
      });
      
      // 打印日志确认文件属性设置成功
      console.log('创建本地文本文件:', finalFilename, '标记isLocalTextFile =', (newFile as any).isLocalTextFile);
      
      await onProcessFiles([newFile]);
      setShowCreateTextFileEditor(false);
    } catch (error) {
      console.error('创建文本文件失败:', error);
      alert('创建文本文件失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handlePhotoCapture = (file: File) => {
    justInitiatedFileOpRef.current = true;
    onProcessFiles([file]);
    setShowCamera(false);
    textareaRef.current?.focus();
  };

  const handleAudioRecord = async (file: File) => {
    justInitiatedFileOpRef.current = true;
    await onProcessFiles([file]);
    setShowRecorder(false);
    textareaRef.current?.focus();
  };

  return {
    showCreateTextFileEditor,
    setShowCreateTextFileEditor,
    showCamera,
    setShowCamera,
    showRecorder,
    setShowRecorder,
    showAddByIdInput,
    setShowAddByIdInput,
    isHelpModalOpen,
    setIsHelpModalOpen,
    fileInputRef,
    imageInputRef,
    videoInputRef,
    handleAttachmentAction,
    handleConfirmCreateTextFile,
    handlePhotoCapture,
    handleAudioRecord,
  };
};
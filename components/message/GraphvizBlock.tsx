import React, { useEffect, useState, useRef } from 'react';
import { Download, Maximize2, RotateCw } from 'lucide-react';

interface GraphvizBlockProps {
  code: string;
}

declare global {
  interface Window {
    Viz: any;
    Panzoom: any;
  }
}

export const GraphvizBlock: React.FC<GraphvizBlockProps> = ({ code }) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRenderingLayout, setIsRenderingLayout] = useState(false);
  const [layout, setLayout] = useState<'LR' | 'TB'>('LR');
  const [isDownloading, setIsDownloading] = useState<'none' | 'png'>('none');
  const diagramContainerRef = useRef<HTMLDivElement>(null);
  const vizInstanceRef = useRef<any>(null);

  const renderGraph = React.useCallback(async (currentLayout: 'LR' | 'TB') => {
    if (!vizInstanceRef.current) return;
    
    try {
      setIsRenderingLayout(true);
      setError('');

      // Modify the DOT code to set the layout direction
      let modifiedCode = code.replace(/rankdir\s*=\s*"\w+"\s*,?/gi, '');
      const graphMatch = modifiedCode.match(/(\s*graph\s*\[)([^\]]*?)(\s*\])/);
      if (graphMatch) {
        let attrs = graphMatch[2].trim();
        if (attrs.length > 0 && !attrs.endsWith(',')) {
          attrs += ',';
        }
        modifiedCode = modifiedCode.replace(/(\s*graph\s*\[)[^\]]*?(\s*\])/, `$1 ${attrs} rankdir="${currentLayout}" $2`);
      }

      const svgElement = await vizInstanceRef.current.renderSVGElement(modifiedCode);
      setSvgContent(svgElement.outerHTML);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to render Graphviz diagram.';
      setError(errorMessage.replace(/.*error:\s*/, ''));
      setSvgContent('');
    } finally {
      setIsRenderingLayout(false);
      setIsLoading(false);
    }
  }, [code]);

  useEffect(() => {
    let intervalId: number;
    if (typeof window.Viz === 'undefined') {
        intervalId = window.setInterval(() => {
            if (typeof window.Viz !== 'undefined') {
                clearInterval(intervalId);
                vizInstanceRef.current = new window.Viz({ worker: undefined });
                renderGraph(layout);
            }
        }, 100);
    } else {
        vizInstanceRef.current = new window.Viz({ worker: undefined });
        renderGraph(layout);
    }
    return () => clearInterval(intervalId);
  }, [renderGraph, layout]);

  const handleToggleLayout = () => {
    const newLayout = layout === 'LR' ? 'TB' : 'LR';
    setLayout(newLayout);
  };

  const handleDownloadPng = () => {
    if (!svgContent || isDownloading !== 'none' || !diagramContainerRef.current) return;
    setIsDownloading('png');
    
    const svgElement = diagramContainerRef.current.querySelector('svg');
    if (!svgElement) {
        setError("Could not find the rendered diagram to export.");
        setIsDownloading('none');
        return;
    }

    const rect = svgElement.getBoundingClientRect();
    const imgWidth = rect.width;
    const imgHeight = rect.height;

    if (imgWidth === 0 || imgHeight === 0) {
        setError("Diagram has zero dimensions, cannot export.");
        setIsDownloading('none');
        return;
    }

    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
    const img = new Image();

    img.onload = () => {
        const canvas = document.createElement('canvas');
        const padding = 20;
        const scale = 3;
        canvas.width = (imgWidth + padding * 2) * scale;
        canvas.height = (imgHeight + padding * 2) * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, padding * scale, padding * scale, imgWidth * scale, imgHeight * scale);
            const pngUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = `graphviz-diagram-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        setIsDownloading('none');
    };

    img.onerror = () => {
        setError("Failed to load SVG for PNG conversion.");
        setIsDownloading('none');
    };

    img.src = svgDataUrl;
  };

  const handleZoom = () => {
    if (!svgContent) return;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;
    
    const container = document.createElement('div');
    container.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      overflow: auto;
      background: white;
      border-radius: 8px;
      padding: 20px;
      position: relative;
    `;
    
    container.innerHTML = svgContent;
    
    // Add panzoom functionality if available
    if (typeof window.Panzoom !== 'undefined') {
      const svgElement = container.querySelector('svg');
      if (svgElement) {
        const panzoom = window.Panzoom(svgElement, {
          maxZoom: 15,
          minZoom: 0.05,
          contain: 'outside',
          canvas: true
        });
        
        container.addEventListener('wheel', (e: WheelEvent) => {
          if (panzoom && panzoom.zoomWithWheel) {
            e.preventDefault();
            panzoom.zoomWithWheel(e);
          }
        }, { passive: false });
      }
    }
    
    modal.appendChild(container);
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
      position: absolute;
      top: 20px;
      right: 30px;
      font-size: 30px;
      color: white;
      background: none;
      border: none;
      cursor: pointer;
    `;
    
    closeButton.onclick = () => document.body.removeChild(modal);
    modal.onclick = (e) => {
      if (e.target === modal) document.body.removeChild(modal);
    };
    
    modal.appendChild(closeButton);
    document.body.appendChild(modal);
  };

  if (isLoading) {
    return (
      <div className="border border-[var(--theme-border-secondary)] rounded-lg p-4 bg-[var(--theme-bg-secondary)]">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm font-medium text-[var(--theme-text-primary)]">Graphviz 图表</div>
        </div>
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--theme-text-secondary)]"></div>
          <p className="text-sm text-[var(--theme-text-secondary)] mt-2">正在渲染图表...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-300 rounded-lg p-4 bg-red-50">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm font-medium text-red-800">Graphviz 渲染错误</div>
        </div>
        <p className="text-sm text-red-600">{error}</p>
        <details className="mt-2">
          <summary className="text-xs text-red-500 cursor-pointer">显示原始代码</summary>
          <pre className="text-xs bg-red-100 p-2 rounded mt-1 overflow-auto"><code>{code}</code></pre>
        </details>
      </div>
    );
  }

  return (
    <div className="border border-[var(--theme-border-secondary)] rounded-lg p-4 bg-[var(--theme-bg-secondary)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-[var(--theme-text-primary)]">Graphviz 图表</div>
        <div className="flex gap-2">
          <button
            onClick={handleToggleLayout}
            disabled={isRenderingLayout}
            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded transition-colors disabled:opacity-50"
            title={`切换到 ${layout === 'LR' ? 'TB' : 'LR'} 布局`}
          >
            <RotateCw size={16} />
          </button>
          <button
            onClick={handleZoom}
            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded transition-colors"
            title="全屏查看"
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={handleDownloadPng}
            disabled={isDownloading !== 'none'}
            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded transition-colors disabled:opacity-50"
            title="下载 PNG"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      <div 
        ref={diagramContainerRef} 
        className="graphviz-diagram overflow-auto"
        dangerouslySetInnerHTML={{ __html: svgContent }} 
      />
    </div>
  );
};

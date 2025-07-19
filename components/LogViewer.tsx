// components/LogViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel, logService } from '../services/logService';
import { AppSettings, ChatSettings } from '../types';
import { X, Trash2, ChevronDown, CheckCircle, Download, Eye, EyeOff } from 'lucide-react';
import { Modal } from './shared/Modal';

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  INFO: 'text-blue-400',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
  DEBUG: 'text-gray-500',
};

const ObfuscatedApiKey: React.FC<{ apiKey: string }> = ({ apiKey }) => {
  const [isRevealed, setIsRevealed] = useState(false);

  if (!apiKey) return null;

  return (
    <div className="flex items-center gap-2">
      <code className={`font-mono text-[var(--theme-text-secondary)] break-all transition-all duration-200 ${isRevealed ? 'blur-none' : 'blur-sm select-none'}`}>
        {apiKey}
      </code>
      <button
        onClick={() => setIsRevealed(!isRevealed)}
        className="p-1 flex-shrink-0 rounded-full text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors focus:outline-none"
        title={isRevealed ? "Hide API Key" : "Show API Key"}
      >
        {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
};


const LogRow: React.FC<{ log: LogEntry }> = React.memo(({ log }) => {
  const [isDataExpanded, setIsDataExpanded] = useState(false);
  const hasData = log.data !== undefined;

  const timeString = log.timestamp.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const milliseconds = log.timestamp.getMilliseconds().toString().padStart(3, '0');
  const fullTimeString = `${timeString}.${milliseconds}`;

  return (
    <div className="border-b border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)] font-mono text-xs">
      <div 
        className={`flex items-start p-1.5 ${hasData ? 'cursor-pointer' : ''}`}
        onClick={hasData ? () => setIsDataExpanded(!isDataExpanded) : undefined}
      >
        <span className="w-24 text-[var(--theme-text-tertiary)] flex-shrink-0">
          {fullTimeString}
        </span>
        <span className={`w-16 font-semibold flex-shrink-0 ${LOG_LEVEL_COLORS[log.level]}`}>
          {log.level}
        </span>
        <span className="flex-grow break-words whitespace-pre-wrap text-[var(--theme-text-primary)]">
          {log.message}
        </span>
        {hasData && <ChevronDown size={16} className={`ml-2 text-[var(--theme-text-tertiary)] transition-transform ${isDataExpanded ? 'rotate-180' : ''}`} />}
      </div>
      {hasData && isDataExpanded && (
        <div className="bg-[var(--theme-bg-code-block)] p-2 mx-2 mb-2 rounded-md overflow-x-auto custom-scrollbar">
          <pre className="text-xs text-[var(--theme-text-secondary)]">
            {JSON.stringify(log.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
});

interface LogViewerProps {
  isOpen: boolean;
  onClose: () => void;
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
}

export const LogViewer: React.FC<LogViewerProps> = ({ isOpen, onClose, appSettings, currentChatSettings }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [apiKeyUsage, setApiKeyUsage] = useState<Map<string, number>>(new Map());
  const [filterText, setFilterText] = useState('');
  const [visibleLevels, setVisibleLevels] = useState<Record<LogLevel, boolean>>({
    INFO: true,
    WARN: true,
    ERROR: true,
    DEBUG: true,
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => closeButtonRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = logService.subscribe(setLogs);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen && appSettings.useCustomApiConfig) {
        const unsubscribe = logService.subscribeToApiKeys(setApiKeyUsage);
        return () => unsubscribe();
    } else if (!isOpen) {
        setApiKeyUsage(new Map());
    }
  }, [isOpen, appSettings.useCustomApiConfig]);

  useEffect(() => {
    if (autoScroll) {
      logContainerRef.current?.scrollTo({ top: logContainerRef.current.scrollHeight });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const container = logContainerRef.current;
    if (container) {
      const isScrolledToBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 20;
      if (!isScrolledToBottom && autoScroll) {
        setAutoScroll(false);
      } else if (isScrolledToBottom && !autoScroll) {
        setAutoScroll(true);
      }
    }
  };

  const handleClose = () => {
    if (isOpen) onClose();
  };
  
  const handleClear = () => {
    logService.clearLogs();
  };

  const toggleLevel = (level: LogLevel) => {
    setVisibleLevels(prev => ({ ...prev, [level]: !prev[level] }));
  };
  
  const filteredLogs = logs.filter(log => {
    if (!visibleLevels[log.level]) return false;
    if (filterText.trim() === '') return true;
    const lowerFilter = filterText.toLowerCase();
    return log.message.toLowerCase().includes(lowerFilter) || 
           (log.data && JSON.stringify(log.data).toLowerCase().includes(lowerFilter));
  });

  const handleExport = () => {
    const logsToExport = filteredLogs.map(log => {
      const timeString = log.timestamp.toISOString();
      const dataString = log.data ? `\n${JSON.stringify(log.data, null, 2)}` : '';
      return `[${timeString}] [${log.level}] ${log.message}${dataString}`;
    }).join('\n\n');

    const blob = new Blob([logsToExport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const date = new Date();
    const dateStamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    link.download = `all-model-chat-logs-${dateStamp}.txt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const allApiKeys = (appSettings.apiKey || '')
    .split('\n')
    .map(k => k.trim())
    .filter(Boolean);

  const displayApiKeyUsage = new Map<string, number>();
  // Add all keys from settings, with usage from the service or 0
  allApiKeys.forEach(key => {
    displayApiKeyUsage.set(key, apiKeyUsage.get(key) || 0);
  });
  // Also include keys that have usage but might not be in settings anymore
  apiKeyUsage.forEach((count, key) => {
    if (!displayApiKeyUsage.has(key)) {
      displayApiKeyUsage.set(key, count);
    }
  });

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      backdropClassName="bg-black bg-opacity-70 backdrop-blur-md"
    >
      <div
        className="bg-[var(--theme-bg-primary)] w-full h-full max-w-4xl shadow-2xl flex flex-col overflow-hidden rounded-xl border border-[var(--theme-border-primary)]"
      >
        <header className="py-2 px-4 border-b border-[var(--theme-border-secondary)] flex justify-between items-center flex-shrink-0 bg-[var(--theme-bg-secondary)]">
          <h2 id="log-viewer-title" className="text-lg font-semibold text-[var(--theme-text-link)]">
            Application Logs
          </h2>
          <button ref={closeButtonRef} onClick={handleClose} className="p-1.5 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] rounded-full transition-colors">
            <X size={22} />
          </button>
        </header>
        
        <div className="flex flex-row flex-grow min-h-0">
          {/* Left Column: API Key Usage */}
          {appSettings.useCustomApiConfig && displayApiKeyUsage.size > 0 && (
            <div className="w-64 flex-shrink-0 border-r border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] flex flex-col">
              <h4 className="p-3 font-semibold text-sm text-[var(--theme-text-primary)] border-b border-[var(--theme-border-secondary)] flex-shrink-0">
                API Key Usage
              </h4>
              <div className="overflow-y-auto custom-scrollbar">
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 bg-[var(--theme-bg-secondary)] z-10">
                    <tr className="text-[var(--theme-text-tertiary)]">
                      <th className="font-semibold p-2 w-8">No.</th>
                      <th className="font-semibold p-2">API Key</th>
                      <th className="font-semibold p-2 w-12 text-center">Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(displayApiKeyUsage.entries())
                      .sort(([, a], [, b]) => b - a)
                      .map(([key, count], index) => (
                      <tr 
                        key={key} 
                        className={`border-t border-[var(--theme-border-primary)] ${currentChatSettings.lockedApiKey === key ? 'bg-[var(--theme-bg-accent)] bg-opacity-15' : 'hover:bg-[var(--theme-bg-input)]'} transition-colors`}
                      >
                        <td className="p-2 text-center text-[var(--theme-text-tertiary)]">{index + 1}</td>
                        <td className="p-2">
                          <ObfuscatedApiKey apiKey={key} />
                          {currentChatSettings.lockedApiKey === key && 
                            <span className="text-xs font-bold text-[var(--theme-text-success)] flex items-center gap-1 mt-1">
                              <CheckCircle size={12}/>
                              Active
                            </span>
                          }
                        </td>
                        <td className="p-2 font-semibold text-sm text-[var(--theme-text-primary)] text-center">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Right Column: Filters & Logs */}
          <div className="flex flex-col flex-grow min-w-0">
            <div className="p-2 sm:p-3 border-b border-[var(--theme-border-secondary)] flex flex-wrap items-center gap-x-4 gap-y-2 flex-shrink-0">
              <input
                type="text"
                placeholder="Filter logs..."
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                className="flex-grow p-1.5 text-sm bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-md focus:ring-1 focus:ring-[var(--theme-border-focus)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)]"
              />
              <div className="flex items-center gap-x-3 text-xs">
                {Object.keys(visibleLevels).map(level => (
                  <label key={level} className="flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleLevels[level as LogLevel]}
                      onChange={() => toggleLevel(level as LogLevel)}
                      className={`mr-1.5 h-4 w-4 rounded border-gray-600 focus:ring-blue-500 text-blue-500 bg-gray-700`}
                    />
                    <span className={LOG_LEVEL_COLORS[level as LogLevel]}>{level}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-x-4">
                <label className="flex items-center cursor-pointer text-xs text-[var(--theme-text-secondary)] select-none">
                  <input type="checkbox" checked={autoScroll} onChange={() => setAutoScroll(!autoScroll)} className="mr-1.5 h-4 w-4 rounded border-gray-600 focus:ring-blue-500 text-blue-500 bg-gray-700" />
                  Auto-scroll
                </label>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 text-xs text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-link)] transition-colors p-1 rounded-md"
                  title="Export visible logs"
                >
                  <Download size={14} /> Export
                </button>
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 text-xs text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-danger)] transition-colors p-1 rounded-md"
                  title="Clear all logs"
                >
                  <Trash2 size={14} /> Clear
                </button>
              </div>
            </div>
            <div
              ref={logContainerRef}
              onScroll={handleScroll}
              className="flex-grow overflow-y-auto overflow-x-hidden custom-scrollbar bg-[var(--theme-bg-secondary)]"
            >
              {filteredLogs.map(log => <LogRow key={log.id} log={log} />)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

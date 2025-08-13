import React, { useEffect, useMemo, useState } from 'react';
import { Shuffle, Repeat, Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { AppSettings, ApiConfig } from '../../types';
import { persistentStoreService } from '../../services/persistentStoreService';
import { apiTestingService, ApiConfiguration } from '../../services/apiTestingService';
import { apiRotationService } from '../../services/apiRotationService';

interface ApiRotationSectionProps {
  settings: AppSettings;
  onChange: (partial: Partial<AppSettings>) => void;
}

export const ApiRotationSection: React.FC<ApiRotationSectionProps> = ({ settings, onChange }) => {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const rotation = settings.apiRotation || { enabled: false, mode: 'round-robin', enableFailover: true, maxRetries: 3, healthCheckInterval: 5, selectedConfigIds: [] };
  const [results, setResults] = useState<Map<string, { success: boolean; responseTime?: number; error?: string }>>(new Map());

  useEffect(() => {
    setConfigs(persistentStoreService.getApiConfigs());
  }, [settings.activeApiConfigId, settings.useCustomApiConfig]);

  // 初始化/同步到轮询服务（仅内存，不持久化）
  useEffect(() => {
    apiRotationService.resetHealthStatus();
    const list = persistentStoreService.getApiConfigs();
    list.forEach(c => {
      apiRotationService.addApiConfiguration({ id: c.id, name: c.name, apiKey: c.apiKey, endpoint: c.apiProxyUrl || undefined, modelId: settings.modelId, isSelected: rotation.selectedConfigIds.includes(c.id) });
    });
    apiRotationService.updateSettings({
      mode: rotation.mode,
      enableFailover: rotation.enableFailover,
      maxRetries: rotation.maxRetries,
      healthCheckInterval: rotation.healthCheckInterval,
    });
  }, [settings.modelId, rotation.mode, rotation.enableFailover, rotation.maxRetries, rotation.healthCheckInterval, rotation.selectedConfigIds.join('|')]);

  const toggleSelect = (id: string) => {
    const next = rotation.selectedConfigIds.includes(id)
      ? rotation.selectedConfigIds.filter(x => x !== id)
      : [...rotation.selectedConfigIds, id];
    onChange({ apiRotation: { ...rotation, selectedConfigIds: next } });
  };

  const handleModeChange = (mode: 'round-robin' | 'random' | 'priority') => {
    onChange({ apiRotation: { ...rotation, mode } });
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const selected = configs.filter(c => rotation.selectedConfigIds.includes(c.id));
      const payload: ApiConfiguration[] = selected.map(c => ({ id: c.id, name: c.name, apiKey: c.apiKey, endpoint: c.apiProxyUrl || undefined, modelId: settings.modelId, isSelected: true }));
      const map = await apiTestingService.testMultipleApis(payload);
      setResults(map);
    } finally {
      setIsTesting(false);
    }
  };

  const stat = useMemo(() => apiRotationService.getStatistics(), [rotation.selectedConfigIds.join('|'), results.size]);

  return (
    <div className="space-y-3 p-3 sm:p-4 border border-[var(--theme-border-secondary)] rounded-lg bg-[var(--theme-bg-secondary)]">
      <h3 className="text-sm font-semibold text-[var(--theme-text-primary)] flex items-center mb-1">
        <Activity size={16} className="mr-2 text-[var(--theme-text-link)] opacity-80" /> 多 API 轮询与测试
      </h3>

      <div className="flex items-center justify-between">
        <label className="text-sm text-[var(--theme-text-secondary)] flex items-center gap-2">
          <input type="checkbox" checked={rotation.enabled} onChange={e => onChange({ apiRotation: { ...rotation, enabled: e.target.checked } })} />
          启用多 API 轮询/随机/优先模式
        </label>
        <div className="flex items-center gap-2">
          <button className={`px-2 py-1 text-xs rounded-md border ${rotation.mode==='round-robin'?'bg-[var(--theme-bg-accent-soft)] border-[var(--theme-border-focus)]':'border-[var(--theme-border-secondary)]'}`} onClick={() => handleModeChange('round-robin')}><Repeat size={12} className="inline mr-1"/>轮询</button>
          <button className={`px-2 py-1 text-xs rounded-md border ${rotation.mode==='random'?'bg-[var(--theme-bg-accent-soft)] border-[var(--theme-border-focus)]':'border-[var(--theme-border-secondary)]'}`} onClick={() => handleModeChange('random')}><Shuffle size={12} className="inline mr-1"/>随机</button>
          <button className={`px-2 py-1 text-xs rounded-md border ${rotation.mode==='priority'?'bg-[var(--theme-bg-accent-soft)] border-[var(--theme-border-focus)]':'border-[var(--theme-border-secondary)]'}`} onClick={() => handleModeChange('priority')}>优先</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">最大重试</label>
          <input type="number" min={1} max={10} value={rotation.maxRetries} onChange={e => onChange({ apiRotation: { ...rotation, maxRetries: Math.max(1, Math.min(10, Number(e.target.value)||1)) } })} className="w-full p-2 text-sm border rounded-md bg-[var(--theme-bg-input)] border-[var(--theme-border-secondary)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">健康检查间隔（分钟）</label>
          <input type="number" min={1} max={60} value={rotation.healthCheckInterval} onChange={e => onChange({ apiRotation: { ...rotation, healthCheckInterval: Math.max(1, Math.min(60, Number(e.target.value)||5)) } })} className="w-full p-2 text-sm border rounded-md bg-[var(--theme-bg-input)] border-[var(--theme-border-secondary)]" />
        </div>
        <div className="flex items-center gap-2">
          <input id="failover-toggle" type="checkbox" checked={rotation.enableFailover} onChange={e => onChange({ apiRotation: { ...rotation, enableFailover: e.target.checked } })} />
          <label htmlFor="failover-toggle" className="text-xs font-medium text-[var(--theme-text-secondary)]">失败自动切换</label>
        </div>
      </div>

      <div className="mt-2">
        <div className="text-xs font-medium text-[var(--theme-text-secondary)] mb-1">选择参与轮询的配置</div>
        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
          {configs.map(c => (
            <label key={c.id} className="flex items-center justify-between p-2 rounded border border-[var(--theme-border-secondary)]">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={rotation.selectedConfigIds.includes(c.id)} onChange={() => toggleSelect(c.id)} />
                <span className="text-sm text-[var(--theme-text-primary)]">{c.name}</span>
              </div>
              <span className="text-xs text-[var(--theme-text-tertiary)]">{c.apiProxyUrl ? '代理' : '直连'}</span>
            </label>
          ))}
          {configs.length === 0 && (
            <div className="text-xs text-[var(--theme-text-tertiary)] p-2">尚未添加任何 API 配置</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="text-xs text-[var(--theme-text-secondary)] flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500"/>健康: {stat.healthyApis}/{stat.selectedApis}</span>
          <span className="inline-flex items-center gap-1"><Clock size={12}/>平均响应: {stat.averageResponseTime}ms</span>
        </div>
        <button onClick={handleTest} disabled={isTesting || rotation.selectedConfigIds.length===0} className="px-3 py-1.5 text-xs font-medium bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] text-white rounded-md disabled:opacity-50">{isTesting?'测试中...':'测试连通性'}</button>
      </div>

      {results.size>0 && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {configs.filter(c=>rotation.selectedConfigIds.includes(c.id)).map(c => {
            const r = results.get(c.id);
            return (
              <div key={c.id} className="p-2 border rounded-md border-[var(--theme-border-secondary)] text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  {r?.success ? <CheckCircle2 size={14} className="text-emerald-500"/> : <XCircle size={14} className="text-red-500"/>}
                </div>
                <div className="text-[var(--theme-text-tertiary)] mt-1">
                  {r?.success ? `响应 ${r.responseTime}ms` : (r?.error || '未知错误')}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApiRotationSection;

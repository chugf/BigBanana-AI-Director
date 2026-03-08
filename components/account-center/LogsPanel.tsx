import React from 'react';
import { Loader2, Search } from 'lucide-react';
import { NewApiLog, NewApiLogStats, NewApiStatus } from '../../services/newApiService';
import { formatDateTime, formatQuota } from './utils';
import { EmptyState, SectionCard, StatCard } from './ui';

interface LogsPanelProps {
  status: NewApiStatus | null;
  logs: NewApiLog[];
  logsLoading: boolean;
  logStats: NewApiLogStats | null;
  logType: number;
  setLogType: React.Dispatch<React.SetStateAction<number>>;
  logStart: string;
  setLogStart: React.Dispatch<React.SetStateAction<string>>;
  logEnd: string;
  setLogEnd: React.Dispatch<React.SetStateAction<string>>;
  logChannelId: string;
  setLogChannelId: React.Dispatch<React.SetStateAction<string>>;
  logTokenName: string;
  setLogTokenName: React.Dispatch<React.SetStateAction<string>>;
  logModelName: string;
  setLogModelName: React.Dispatch<React.SetStateAction<string>>;
  logPage: number;
  logPageSize: number;
  logTotal: number;
  onSearch: () => Promise<void>;
  onPageChange: (page: number) => Promise<void>;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({
  status,
  logs,
  logsLoading,
  logStats,
  logType,
  setLogType,
  logStart,
  setLogStart,
  logEnd,
  setLogEnd,
  logChannelId,
  setLogChannelId,
  logTokenName,
  setLogTokenName,
  logModelName,
  setLogModelName,
  logPage,
  logPageSize,
  logTotal,
  onSearch,
  onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(logTotal / logPageSize));

  return (
    <div className="space-y-6">
      <SectionCard
        title="使用日志"
        description="把筛选条件、统计摘要和明细列表按操作顺序拆开，用户先筛选，再看统计，最后看明细。"
        action={(
          <button
            onClick={() => void onSearch()}
            disabled={logsLoading}
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:opacity-60"
          >
            {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            查询日志
          </button>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <select value={logType} onChange={(event) => setLogType(Number(event.target.value))} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]">
            <option value={2}>消费日志</option>
            <option value={4}>错误日志</option>
            <option value={5}>系统日志</option>
            <option value={1}>充值日志</option>
          </select>
          <input type="datetime-local" value={logStart} onChange={(event) => setLogStart(event.target.value)} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]" />
          <input type="datetime-local" value={logEnd} onChange={(event) => setLogEnd(event.target.value)} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]" />
          <input value={logChannelId} onChange={(event) => setLogChannelId(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="按平台 ID 筛选" className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]" />
          <input value={logTokenName} onChange={(event) => setLogTokenName(event.target.value)} placeholder="按令牌名称筛选" className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]" />
          <input value={logModelName} onChange={(event) => setLogModelName(event.target.value)} placeholder="按模型名称筛选" className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]" />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="消耗额度" value={formatQuota(logStats?.quota, status)} hint="当前筛选条件下的总额度" />
        <StatCard label="RPM" value={logStats?.rpm ?? 0} hint="每分钟请求速率" />
        <StatCard label="TPM" value={logStats?.tpm ?? 0} hint="每分钟 Token 消耗量" />
      </div>

      <SectionCard title="日志明细" description="补上平台列后，优先帮助你判断是哪一个平台、哪一个令牌、哪一个模型产生了消耗。">
        {logsLoading ? (
          <div className="flex min-h-[240px] items-center justify-center text-[var(--text-tertiary)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title="暂无日志" description="你可以先调整时间范围、令牌名称或模型名称，再重新查询。" />
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-2xl border border-[var(--border-primary)]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">时间</th>
                  <th className="px-4 py-3 text-left font-medium">平台</th>
                  <th className="px-4 py-3 text-left font-medium">令牌</th>
                  <th className="px-4 py-3 text-left font-medium">模型</th>
                  <th className="px-4 py-3 text-left font-medium">输入 / 输出</th>
                  <th className="px-4 py-3 text-left font-medium">花费</th>
                  <th className="px-4 py-3 text-left font-medium">详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-[var(--border-primary)] align-top">
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(log.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{log.channel_name ? `${log.channel_name}${log.channel ? ` · #${log.channel}` : ''}` : log.channel ? `渠道 #${log.channel}` : '—'}</td>
                    <td className="px-4 py-3">{log.token_name || '—'}</td>
                    <td className="px-4 py-3">{log.model_name || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3">{log.prompt_tokens ?? 0} / {log.completion_tokens ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatQuota(log.quota, status)}</td>
                    <td className="max-w-[420px] break-words px-4 py-3 text-[var(--text-secondary)]">{log.content || log.request_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {logTotal > logPageSize && (
          <div className="mt-5 flex items-center justify-between text-sm text-[var(--text-secondary)]">
            <span>第 {logPage} / {totalPages} 页，共 {logTotal} 条</span>
            <div className="flex gap-2">
              <button onClick={() => void onPageChange(Math.max(1, logPage - 1))} disabled={logPage <= 1} className="rounded-xl border border-[var(--border-primary)] px-3 py-2 disabled:opacity-40">上一页</button>
              <button onClick={() => void onPageChange(Math.min(totalPages, logPage + 1))} disabled={logPage >= totalPages} className="rounded-xl border border-[var(--border-primary)] px-3 py-2 disabled:opacity-40">下一页</button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

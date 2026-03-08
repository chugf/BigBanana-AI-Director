import React from 'react';
import { Copy, Key, Loader2, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { NewApiStatus, NewApiToken } from '../../services/newApiService';
import { TokenFormState } from './types';
import { formatDateTime, formatQuota, getTokenStatusMeta, maskTokenKey } from './utils';
import { EmptyState, SectionCard } from './ui';

interface TokensPanelProps {
  status: NewApiStatus | null;
  tokens: NewApiToken[];
  tokensLoading: boolean;
  tokenPage: number;
  tokenTotal: number;
  tokenPageSize: number;
  createTokenLoading: boolean;
  tokenForm: TokenFormState;
  setTokenForm: React.Dispatch<React.SetStateAction<TokenFormState>>;
  onCreateToken: () => Promise<void>;
  onRefreshTokens: () => Promise<void>;
  onPageChange: (page: number) => Promise<void>;
  onToggleToken: (token: NewApiToken) => Promise<void>;
  onDeleteToken: (token: NewApiToken) => Promise<void>;
  onCopyToken: (token: NewApiToken) => Promise<void>;
  onUseTokenInProject: (token: NewApiToken) => void;
}

export const TokensPanel: React.FC<TokensPanelProps> = ({
  status,
  tokens,
  tokensLoading,
  tokenPage,
  tokenTotal,
  tokenPageSize,
  createTokenLoading,
  tokenForm,
  setTokenForm,
  onCreateToken,
  onRefreshTokens,
  onPageChange,
  onToggleToken,
  onDeleteToken,
  onCopyToken,
  onUseTokenInProject,
}) => {
  const totalPages = Math.max(1, Math.ceil(tokenTotal / tokenPageSize));

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <SectionCard title="创建新令牌" description="先把当前项目最需要的创作密钥创建出来，再决定是否限额或设置到期时间。">
          <div className="space-y-4">
            <input
              value={tokenForm.name}
              onChange={(event) => setTokenForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="令牌名称"
              className="w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={tokenForm.creditsLimit}
                onChange={(event) => setTokenForm((current) => ({ ...current, creditsLimit: event.target.value }))}
                disabled={tokenForm.unlimitedQuota}
                placeholder="额度上限（例如 5）"
                className="w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              />
              <input
                type="datetime-local"
                value={tokenForm.expiredAt}
                onChange={(event) => setTokenForm((current) => ({ ...current, expiredAt: event.target.value }))}
                className="w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]"
              />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={tokenForm.unlimitedQuota}
                onChange={(event) => setTokenForm((current) => ({ ...current, unlimitedQuota: event.target.checked }))}
                className="h-4 w-4"
              />
              创建无限额度令牌
            </label>

            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-4 text-sm leading-6 text-[var(--text-tertiary)]">
              如果你准备把它直接用于当前项目，建议先创建一个名字明确、便于回填的令牌，例如 “BigBanana-创作主 Key”。
            </div>

            <button
              onClick={() => void onCreateToken()}
              disabled={createTokenLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-3 text-sm font-medium text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:opacity-60"
            >
              {createTokenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              创建令牌
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="令牌列表"
          description="把复制、启停、删除和回填当前项目这几件事收敛到一个列表操作区。"
          action={(
            <button
              onClick={() => void onRefreshTokens()}
              disabled={tokensLoading}
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
            >
              {tokensLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              刷新令牌
            </button>
          )}
        >
          <div className="space-y-4">
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {tokensLoading ? (
                <div className="flex min-h-[220px] items-center justify-center text-[var(--text-tertiary)]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : tokens.length === 0 ? (
                <EmptyState title="还没有令牌" description="先创建一个新的令牌，再把它一键设为当前项目的全局 API Key。" />
              ) : (
                tokens.map((token) => {
                  const statusMeta = getTokenStatusMeta(token.status);
                  return (
                    <div key={token.id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="font-semibold text-[var(--text-primary)]">{token.name}</div>
                            <span className={`rounded-full px-2.5 py-1 text-xs ${statusMeta.className}`}>{statusMeta.label}</span>
                          </div>
                          <div className="mt-2 break-all font-mono text-sm text-[var(--text-tertiary)]">{maskTokenKey(token.key)}</div>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <button onClick={() => void onCopyToken(token)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-3 py-2 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
                            <Copy className="h-4 w-4" /> 复制
                          </button>
                          <button onClick={() => onUseTokenInProject(token)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-3 py-2 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
                            <Key className="h-4 w-4" /> 设为项目 Key
                          </button>
                          {(token.status === 1 || token.status === 2) && (
                            <button onClick={() => void onToggleToken(token)} className="rounded-xl border border-[var(--border-primary)] px-3 py-2 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
                              {token.status === 1 ? '禁用' : '启用'}
                            </button>
                          )}
                          <button onClick={() => void onDeleteToken(token)} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 px-3 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/10">
                            <Trash2 className="h-4 w-4" /> 删除
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <div className="text-[var(--text-tertiary)]">剩余额度</div>
                          <div className="mt-1 font-semibold">{token.unlimited_quota ? '无限额度' : formatQuota(token.remain_quota, status)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-tertiary)]">累计消耗</div>
                          <div className="mt-1 font-semibold">{formatQuota(token.used_quota, status)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-tertiary)]">创建时间</div>
                          <div className="mt-1 font-semibold">{formatDateTime(token.created_time)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-tertiary)]">到期时间</div>
                          <div className="mt-1 font-semibold">{token.expired_time === -1 ? '永不过期' : formatDateTime(token.expired_time)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {tokenTotal > tokenPageSize && (
              <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
                <span>第 {tokenPage} / {totalPages} 页，共 {tokenTotal} 条</span>
                <div className="flex gap-2">
                  <button onClick={() => void onPageChange(Math.max(1, tokenPage - 1))} disabled={tokenPage <= 1} className="rounded-xl border border-[var(--border-primary)] px-3 py-2 disabled:opacity-40">上一页</button>
                  <button onClick={() => void onPageChange(Math.min(totalPages, tokenPage + 1))} disabled={tokenPage >= totalPages} className="rounded-xl border border-[var(--border-primary)] px-3 py-2 disabled:opacity-40">下一页</button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

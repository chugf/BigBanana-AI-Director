import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, CreditCard, Key, Loader2, Power, RefreshCcw, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAlert } from './GlobalAlert';
import { setGlobalApiKey } from '../services/aiService';
import {
  NewApiLog,
  NewApiLogStats,
  NewApiSession,
  NewApiSubscriptionSelf,
  NewApiStatus,
  NewApiSubscriptionPlanItem,
  NewApiToken,
  NewApiTopupInfo,
  bootstrapNewApiSession,
  clearNewApiSession,
  createNewApiToken,
  deleteNewApiToken,
  fetchNewApiStatus,
  getNewApiEndpoint,
  getNewApiLogs,
  getNewApiLogsStat,
  getNewApiSession,
  getNewApiSelf,
  getNewApiSubscriptionPlans,
  getNewApiSubscriptionSelf,
  getNewApiTokens,
  getNewApiTopupInfo,
  loginNewApiUser,
  logoutNewApiUser,
  redeemNewApiCode,
  registerNewApiUser,
  requestNewApiAmount,
  requestNewApiPay,
  requestNewApiSubscriptionCreemPay,
  requestNewApiSubscriptionEpayPay,
  requestNewApiSubscriptionStripePay,
  sendNewApiVerificationCode,
  updateNewApiTokenStatus,
  verifyNewApiTwoFactor,
} from '../services/newApiService';
import { AuthView } from './account-center/AuthView';
import { BillingPanel } from './account-center/BillingPanel';
import { AuthTab } from './account-center/internal';
import { LogsPanel } from './account-center/LogsPanel';
import { OverviewPanel } from './account-center/OverviewPanel';
import { AccountTab, LoginFormState, RegisterFormState, TokenFormState } from './account-center/types';
import {
  creditsToQuota,
  formatDateTimeInput,
  formatQuota,
  normalizePayMethods,
  submitPaymentForm,
  toUnixTimestamp,
  TOKEN_STATUS_DISABLED,
  TOKEN_STATUS_ENABLED,
} from './account-center/utils';
import { cardClassName, SectionCard } from './account-center/ui';
import { TokensPanel } from './account-center/TokensPanel';

const createDefaultTokenForm = (): TokenFormState => ({
  name: 'BigBanana',
  unlimitedQuota: true,
  creditsLimit: '5',
  expiredAt: '',
});

const ACCOUNT_TABS = [
  { key: 'overview' as AccountTab, label: '总览', description: '看余额、状态和下一步动作', icon: User },
  { key: 'billing' as AccountTab, label: '充值', description: '充值、预估金额、兑换码', icon: CreditCard },
  { key: 'tokens' as AccountTab, label: '令牌', description: '创建和管理项目密钥', icon: Key },
  { key: 'logs' as AccountTab, label: '日志', description: '查看消费、错误与模型调用', icon: Activity },
];

const NewApiConsole: React.FC = () => {
  const navigate = useNavigate();
  const { showAlert } = useAlert();
  const activeEndpoint = getNewApiEndpoint();

  const [status, setStatus] = useState<NewApiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [session, setSession] = useState<NewApiSession | null>(() => getNewApiSession());
  const [authTab, setAuthTab] = useState<AuthTab>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [activeTab, setActiveTab] = useState<AccountTab>('overview');

  const [loginForm, setLoginForm] = useState<LoginFormState>({ username: '', password: '', twoFactorCode: '' });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({ username: '', email: '', verificationCode: '', password: '', confirmPassword: '', affCode: '' });

  const [verificationLoading, setVerificationLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);

  const [topupInfo, setTopupInfo] = useState<NewApiTopupInfo | null>(null);
  const [topupInfoLoading, setTopupInfoLoading] = useState(false);
  const [payableAmount, setPayableAmount] = useState<number | null>(null);
  const [topupAmount, setTopupAmount] = useState('10');
  const [redeemCode, setRedeemCode] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState<NewApiSubscriptionPlanItem[]>([]);
  const [subscriptionSelf, setSubscriptionSelf] = useState<NewApiSubscriptionSelf | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const [tokens, setTokens] = useState<NewApiToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenPage, setTokenPage] = useState(1);
  const [tokenTotal, setTokenTotal] = useState(0);
  const [tokenPageSize] = useState(10);
  const [createTokenLoading, setCreateTokenLoading] = useState(false);
  const [tokenForm, setTokenForm] = useState<TokenFormState>(createDefaultTokenForm());

  const defaultStart = useMemo(() => formatDateTimeInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), []);
  const defaultEnd = useMemo(() => formatDateTimeInput(new Date()), []);
  const [logType, setLogType] = useState(2);
  const [logStart, setLogStart] = useState(defaultStart);
  const [logEnd, setLogEnd] = useState(defaultEnd);
  const [logChannelId, setLogChannelId] = useState('');
  const [logTokenName, setLogTokenName] = useState('');
  const [logModelName, setLogModelName] = useState('');
  const [logs, setLogs] = useState<NewApiLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize] = useState(20);
  const [logTotal, setLogTotal] = useState(0);
  const [logStats, setLogStats] = useState<NewApiLogStats | null>(null);

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [topupLoaded, setTopupLoaded] = useState(false);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const estimateRequestIdRef = useRef(0);

  const sessionUserId = session?.userId ?? null;
  const topupMethods = useMemo(() => normalizePayMethods(topupInfo?.pay_methods).filter((item) => item?.name && item?.type), [topupInfo]);
  const activeSubscriptions = subscriptionSelf?.subscriptions ?? [];
  const allSubscriptions = subscriptionSelf?.all_subscriptions ?? [];
  const billingPreference = subscriptionSelf?.billing_preference ?? 'wallet_first';

  const resetWorkspaceState = useCallback(() => {
    estimateRequestIdRef.current += 1;
    setTopupInfo(null);
    setPayableAmount(null);
    setTopupAmount('10');
    setRedeemCode('');
    setSelectedPaymentMethod('');
    setEstimateLoading(false);
    setEstimateError(null);
    setSubscriptionPlans([]);
    setSubscriptionSelf(null);
    setSubscriptionLoading(false);
    setTokens([]);
    setTokenPage(1);
    setTokenTotal(0);
    setTokenForm(createDefaultTokenForm());
    setLogs([]);
    setLogPage(1);
    setLogTotal(0);
    setLogStats(null);
    setLogChannelId('');
    setProfileLoaded(false);
    setTopupLoaded(false);
    setTokensLoaded(false);
    setLogsLoaded(false);
    setActiveTab('overview');
  }, []);

  const loadStatusAndSession = useCallback(async (endpoint: string, silent = false) => {
    setStatusLoading(true);
    try {
      setStatus(await fetchNewApiStatus(endpoint));
    } catch (error) {
      setStatus(null);
      if (!silent) {
        showAlert(error instanceof Error ? error.message : '获取 new-api 状态失败', { type: 'error' });
      }
    }

    try {
      setSession(await bootstrapNewApiSession(endpoint));
    } catch {
      setSession(null);
    } finally {
      setStatusLoading(false);
    }
  }, [showAlert]);

  const refreshProfile = useCallback(async () => {
    setWalletLoading(true);
    try {
      const user = await getNewApiSelf(activeEndpoint);
      setSession((current) => current ? { ...current, user, username: user.username } : current);
      setProfileLoaded(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '刷新账户信息失败', { type: 'error' });
      throw error;
    } finally {
      setWalletLoading(false);
    }
  }, [activeEndpoint, showAlert]);

  const refreshSubscriptionSelf = useCallback(async () => {
    setSubscriptionLoading(true);
    try {
      const payload = await getNewApiSubscriptionSelf();
      setSubscriptionSelf(payload);
      return payload;
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取订阅信息失败', { type: 'error' });
      throw error;
    } finally {
      setSubscriptionLoading(false);
    }
  }, [showAlert]);

  const loadTopupInfo = useCallback(async () => {
    setTopupInfoLoading(true);
    setSubscriptionLoading(true);
    try {
      const [topupInfoResult, subscriptionPlansResult, subscriptionSelfResult] = await Promise.allSettled([
        getNewApiTopupInfo(),
        getNewApiSubscriptionPlans(),
        getNewApiSubscriptionSelf(),
      ]);

      if (topupInfoResult.status === 'rejected') {
        throw topupInfoResult.reason;
      }

      const info = topupInfoResult.value;
      const methods = normalizePayMethods(info.pay_methods).filter((item) => item?.name && item?.type);
      const defaultTopupMethod = methods.find((item) => !['stripe', 'creem'].includes(item.type))?.type || methods[0]?.type || '';
      setTopupInfo(info);
      setSubscriptionPlans(subscriptionPlansResult.status === 'fulfilled' ? (subscriptionPlansResult.value || []).filter((item) => item?.plan?.id) : []);
      setSubscriptionSelf(subscriptionSelfResult.status === 'fulfilled' ? subscriptionSelfResult.value : null);
      setSelectedPaymentMethod((current) => current || defaultTopupMethod);
      if ((info.amount_options?.length || 0) > 0) {
        setTopupAmount((current) => current || String(info.amount_options?.[0] ?? '10'));
      }
      setTopupLoaded(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取充值配置失败', { type: 'error' });
      throw error;
    } finally {
      setTopupInfoLoading(false);
      setSubscriptionLoading(false);
    }
  }, [showAlert]);

  const loadTokens = useCallback(async (page = 1) => {
    setTokensLoading(true);
    try {
      const payload = await getNewApiTokens(page, tokenPageSize);
      setTokens(payload.items || []);
      setTokenPage(payload.page || page);
      setTokenTotal(payload.total || 0);
      setTokensLoaded(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取令牌列表失败', { type: 'error' });
      throw error;
    } finally {
      setTokensLoading(false);
    }
  }, [showAlert, tokenPageSize]);

  const loadLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const startTimestamp = toUnixTimestamp(logStart);
      const endTimestamp = toUnixTimestamp(logEnd);
      const [pageData, statsData] = await Promise.all([
        getNewApiLogs({ page, pageSize: logPageSize, type: logType, channelId: logChannelId, tokenName: logTokenName, modelName: logModelName, startTimestamp, endTimestamp }),
        getNewApiLogsStat({ type: logType, channelId: logChannelId, tokenName: logTokenName, modelName: logModelName, startTimestamp, endTimestamp }),
      ]);
      setLogs(pageData.items || []);
      setLogPage(pageData.page || page);
      setLogTotal(pageData.total || 0);
      setLogStats(statsData);
      setLogsLoaded(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取使用日志失败', { type: 'error' });
      throw error;
    } finally {
      setLogsLoading(false);
    }
  }, [logChannelId, logEnd, logModelName, logPageSize, logStart, logTokenName, logType, showAlert]);

  useEffect(() => {
    loadStatusAndSession(activeEndpoint, true).catch(() => undefined);
  }, [activeEndpoint, loadStatusAndSession]);

  useEffect(() => {
    if (!sessionUserId) {
      resetWorkspaceState();
      return;
    }
    if (!profileLoaded) {
      refreshProfile().catch(() => undefined);
      return;
    }
    if (activeTab === 'billing' && !topupLoaded) {
      loadTopupInfo().catch(() => undefined);
      return;
    }
    if (activeTab === 'tokens' && !tokensLoaded) {
      loadTokens(1).catch(() => undefined);
      return;
    }
    if (activeTab === 'logs' && !logsLoaded) {
      loadLogs(1).catch(() => undefined);
    }
  }, [sessionUserId, activeTab, profileLoaded, topupLoaded, tokensLoaded, logsLoaded, refreshProfile, loadTopupInfo, loadTokens, loadLogs, resetWorkspaceState]);

  useEffect(() => {
    if (!sessionUserId || activeTab !== 'billing' || !topupLoaded) {
      estimateRequestIdRef.current += 1;
      setEstimateLoading(false);
      return;
    }

    const amountValue = Number(topupAmount);
    const requestId = estimateRequestIdRef.current + 1;
    estimateRequestIdRef.current = requestId;

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setEstimateLoading(false);
      setEstimateError(null);
      setPayableAmount(null);
      return;
    }

    setEstimateLoading(true);
    setEstimateError(null);
    setPayableAmount(null);

    const timer = window.setTimeout(async () => {
      try {
        const estimatedAmount = await requestNewApiAmount(amountValue);
        if (estimateRequestIdRef.current !== requestId) {
          return;
        }
        setPayableAmount(estimatedAmount);
      } catch {
        if (estimateRequestIdRef.current !== requestId) {
          return;
        }
        setPayableAmount(null);
        setEstimateError('暂时无法获取预估金额，请以支付页显示为准。');
      } finally {
        if (estimateRequestIdRef.current === requestId) {
          setEstimateLoading(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activeTab, sessionUserId, topupAmount, topupLoaded]);

  const handleLogin = async () => {
    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      showAlert('请输入用户名和密码。', { type: 'warning' });
      return;
    }
    if (status?.turnstile_check) {
      showAlert('当前账号系统启用了额外安全验证，本页暂不支持，请联系管理员处理。', { type: 'warning' });
      return;
    }
    setAuthLoading(true);
    try {
      const result = await loginNewApiUser({ username: loginForm.username.trim(), password: loginForm.password }, activeEndpoint);
      if (result.requireTwoFactor) {
        setNeedsTwoFactor(true);
        showAlert('该账号开启了 2FA，请继续输入一次性验证码。', { type: 'info' });
        return;
      }
      resetWorkspaceState();
      setNeedsTwoFactor(false);
      setSession(result.session || null);
      showAlert('登录成功。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '登录失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!loginForm.twoFactorCode.trim()) {
      showAlert('请输入 2FA 验证码。', { type: 'warning' });
      return;
    }
    setAuthLoading(true);
    try {
      const result = await verifyNewApiTwoFactor(loginForm.twoFactorCode.trim(), activeEndpoint);
      resetWorkspaceState();
      setNeedsTwoFactor(false);
      setSession(result.session || null);
      showAlert('登录成功。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '2FA 校验失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerForm.username.trim()) {
      showAlert('请输入用户名。', { type: 'warning' });
      return;
    }
    if (registerForm.password.length < 8) {
      showAlert('密码长度至少 8 位。', { type: 'warning' });
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      showAlert('两次输入的密码不一致。', { type: 'warning' });
      return;
    }
    if (status?.email_verification && (!registerForm.email.trim() || !registerForm.verificationCode.trim())) {
      showAlert('当前注册流程需要邮箱验证，请填写邮箱和验证码。', { type: 'warning' });
      return;
    }
    if (status?.turnstile_check) {
      showAlert('当前账号系统启用了额外安全验证，本页暂不支持，请联系管理员处理。', { type: 'warning' });
      return;
    }
    setAuthLoading(true);
    try {
      await registerNewApiUser({
        username: registerForm.username.trim(),
        password: registerForm.password,
        email: registerForm.email.trim() || undefined,
        verification_code: registerForm.verificationCode.trim() || undefined,
        aff_code: registerForm.affCode.trim() || undefined,
      }, activeEndpoint);
      setAuthTab('login');
      setLoginForm((current) => ({ ...current, username: registerForm.username.trim(), password: '' }));
      showAlert('注册成功，请直接登录。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '注册失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendVerificationCode = async () => {
    if (!registerForm.email.trim()) {
      showAlert('请先填写邮箱地址。', { type: 'warning' });
      return;
    }
    if (status?.turnstile_check) {
      showAlert('当前账号系统启用了额外安全验证，本页暂不支持发送验证码，请联系管理员处理。', { type: 'warning' });
      return;
    }
    setVerificationLoading(true);
    try {
      await sendNewApiVerificationCode(registerForm.email.trim(), activeEndpoint);
      showAlert('验证码已发送，请检查邮箱。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '验证码发送失败', { type: 'error' });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await logoutNewApiUser();
      clearNewApiSession();
      resetWorkspaceState();
      setNeedsTwoFactor(false);
      setSession(null);
      showAlert('已退出登录。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '退出登录失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOnlinePay = async () => {
    const amountValue = Number(topupAmount);
    if (!selectedPaymentMethod) {
      showAlert('请选择支付方式。', { type: 'warning' });
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showAlert('请输入正确的充值数量。', { type: 'warning' });
      return;
    }
    setPaymentLoading(true);
    try {
      const { url, params } = await requestNewApiPay(amountValue, selectedPaymentMethod);
      if (!url) throw new Error('支付链接为空');
      submitPaymentForm(url, params);
      showAlert('支付页面已在新窗口中拉起。支付完成后可点击刷新余额。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '拉起支付失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleSubscriptionPay = async (planId: number, paymentMethod: string) => {
    if (!planId) {
      showAlert('订阅套餐配置不完整。', { type: 'warning' });
      return;
    }

    setPaymentLoading(true);
    try {
      if (paymentMethod === 'stripe') {
        const { pay_link } = await requestNewApiSubscriptionStripePay(planId);
        if (!pay_link) throw new Error('Stripe 支付链接为空');
        window.open(pay_link, '_blank', 'noopener,noreferrer');
      } else if (paymentMethod === 'creem') {
        const { checkout_url } = await requestNewApiSubscriptionCreemPay(planId);
        if (!checkout_url) throw new Error('Creem 支付链接为空');
        window.open(checkout_url, '_blank', 'noopener,noreferrer');
      } else {
        const { url, params } = await requestNewApiSubscriptionEpayPay(planId, paymentMethod);
        if (!url) throw new Error('支付链接为空');
        submitPaymentForm(url, params);
      }

      showAlert('订阅支付页面已在新窗口中拉起。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '拉起订阅支付失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleRedeemCode = async () => {
    if (!redeemCode.trim()) {
      showAlert('请输入兑换码。', { type: 'warning' });
      return;
    }
    setPaymentLoading(true);
    try {
      const quota = await redeemNewApiCode(redeemCode.trim());
      setRedeemCode('');
      await refreshProfile();
      showAlert(`兑换成功，到账额度：${formatQuota(quota, status)}。`, { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '兑换失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCreateToken = async () => {
    if (!tokenForm.name.trim()) {
      showAlert('请输入令牌名称。', { type: 'warning' });
      return;
    }
    const creditsLimit = Number(tokenForm.creditsLimit || '0');
    if (!tokenForm.unlimitedQuota && (!Number.isFinite(creditsLimit) || creditsLimit < 0)) {
      showAlert('请输入正确的额度上限。', { type: 'warning' });
      return;
    }
    setCreateTokenLoading(true);
    try {
      await createNewApiToken({
        name: tokenForm.name.trim(),
        unlimited_quota: tokenForm.unlimitedQuota,
        remain_quota: tokenForm.unlimitedQuota ? 0 : creditsToQuota(creditsLimit, status),
        expired_time: tokenForm.expiredAt ? Math.floor(Date.parse(tokenForm.expiredAt) / 1000) : -1,
      });
      await loadTokens(1);
      setTokenForm(createDefaultTokenForm());
      showAlert('令牌已创建，请在列表中复制或直接设为当前创作 Key。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '创建令牌失败', { type: 'error' });
    } finally {
      setCreateTokenLoading(false);
    }
  };

  const handleToggleToken = async (token: NewApiToken) => {
    const nextStatus = token.status === TOKEN_STATUS_ENABLED ? TOKEN_STATUS_DISABLED : TOKEN_STATUS_ENABLED;
    setTokensLoading(true);
    try {
      await updateNewApiTokenStatus(token.id, nextStatus);
      await loadTokens(tokenPage);
      showAlert(nextStatus === TOKEN_STATUS_ENABLED ? '令牌已启用。' : '令牌已禁用。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '更新令牌状态失败', { type: 'error' });
    } finally {
      setTokensLoading(false);
    }
  };

  const handleDeleteToken = async (token: NewApiToken) => {
    showAlert(`确定删除令牌「${token.name}」吗？`, {
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await deleteNewApiToken(token.id);
          await loadTokens(Math.max(1, tokenPage));
          showAlert('令牌已删除。', { type: 'success' });
        } catch (error) {
          showAlert(error instanceof Error ? error.message : '删除令牌失败', { type: 'error' });
        }
      },
    });
  };

  const handleCopyToken = async (token: NewApiToken) => {
    await navigator.clipboard.writeText(`sk-${token.key}`);
    showAlert('令牌已复制到剪贴板。', { type: 'success' });
  };

  const handleUseTokenInProject = (token: NewApiToken) => {
    const fullKey = `sk-${token.key}`;
    localStorage.setItem('antsk_api_key', fullKey);
    setGlobalApiKey(fullKey);
    showAlert('已将该令牌设为当前项目的全局 API Key。', { type: 'success' });
  };

  const currentTab = ACCOUNT_TABS.find((item) => item.key === activeTab) || ACCOUNT_TABS[0];

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]">
              <ArrowLeft className="h-4 w-4" /> 返回
            </button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">账号中心</h1>
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">在这里管理登录、余额、令牌和使用记录。</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void loadStatusAndSession(activeEndpoint)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
              {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} 刷新数据
            </button>
            {session && (
              <button onClick={() => void handleLogout()} disabled={authLoading} className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/30 px-4 py-2.5 text-sm text-rose-400 transition-colors hover:bg-rose-500/10 disabled:opacity-60">
                <Power className="h-4 w-4" /> 退出登录
              </button>
            )}
          </div>
        </header>

        {!session ? (
          <div className="flex min-h-[calc(100vh-15rem)] items-center justify-center py-4">
            <div className="w-full max-w-2xl">
              <AuthView
                status={status}
                authTab={authTab}
                setAuthTab={setAuthTab}
                needsTwoFactor={needsTwoFactor}
                authLoading={authLoading}
                verificationLoading={verificationLoading}
                loginForm={loginForm}
                setLoginForm={setLoginForm}
                registerForm={registerForm}
                setRegisterForm={setRegisterForm}
                onLogin={handleLogin}
                onVerifyTwoFactor={handleVerifyTwoFactor}
                onRegister={handleRegister}
                onSendVerificationCode={handleSendVerificationCode}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <div className={`${cardClassName} min-w-0 p-5`}>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-bg)] text-[var(--accent-text)]"><User className="h-6 w-6" /></div>
                <div className="mt-4 break-words text-lg font-semibold leading-tight">{session.username}</div>
                <div className="mt-1 text-sm text-[var(--text-tertiary)]">已登录，可直接管理余额、令牌与日志</div>
                <div className="mt-5 grid gap-3">
                  <div className="min-w-0 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3"><div className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">余额</div><div className="mt-2 break-all text-lg font-semibold leading-tight sm:text-xl">{formatQuota(session.user?.quota, status)}</div></div>
                  <div className="min-w-0 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3"><div className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">用户组</div><div className="mt-2 break-words text-sm font-medium text-[var(--text-secondary)]">{session.user?.group || '默认分组'}</div></div>
                </div>
              </div>
              <div className={`${cardClassName} p-3`}>
                {ACCOUNT_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${isActive ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}>
                      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                      <span><span className="block font-medium">{tab.label}</span><span className={`mt-1 block text-xs leading-5 ${isActive ? 'text-[var(--accent-text)]/80' : 'text-[var(--text-tertiary)]'}`}>{tab.description}</span></span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="min-w-0 space-y-6">
              <SectionCard title={currentTab.label} description={currentTab.description}>
                <div className="text-sm leading-6 text-[var(--text-tertiary)]">选择左侧模块，即可完成充值、密钥管理和用量查询。</div>
              </SectionCard>

              {activeTab === 'overview' && <OverviewPanel status={status} session={session} walletLoading={walletLoading} onRefreshProfile={refreshProfile} onTabChange={setActiveTab} />}
              {activeTab === 'billing' && <BillingPanel status={status} session={session} topupInfo={topupInfo} topupInfoLoading={topupInfoLoading} walletLoading={walletLoading} paymentLoading={paymentLoading} estimateLoading={estimateLoading} estimateError={estimateError} topupMethods={topupMethods} subscriptionPlans={subscriptionPlans} subscriptionLoading={subscriptionLoading} billingPreference={billingPreference} activeSubscriptions={activeSubscriptions} allSubscriptions={allSubscriptions} selectedPaymentMethod={selectedPaymentMethod} setSelectedPaymentMethod={setSelectedPaymentMethod} topupAmount={topupAmount} setTopupAmount={setTopupAmount} payableAmount={payableAmount} redeemCode={redeemCode} setRedeemCode={setRedeemCode} onOnlinePay={handleOnlinePay} onSubscriptionPay={handleSubscriptionPay} onRedeemCode={handleRedeemCode} onRefreshProfile={refreshProfile} onRefreshSubscriptions={refreshSubscriptionSelf} />}
              {activeTab === 'tokens' && <TokensPanel status={status} tokens={tokens} tokensLoading={tokensLoading} tokenPage={tokenPage} tokenTotal={tokenTotal} tokenPageSize={tokenPageSize} createTokenLoading={createTokenLoading} tokenForm={tokenForm} setTokenForm={setTokenForm} onCreateToken={handleCreateToken} onRefreshTokens={() => loadTokens(tokenPage)} onPageChange={loadTokens} onToggleToken={handleToggleToken} onDeleteToken={handleDeleteToken} onCopyToken={handleCopyToken} onUseTokenInProject={handleUseTokenInProject} />}
              {activeTab === 'logs' && <LogsPanel status={status} logs={logs} logsLoading={logsLoading} logStats={logStats} logType={logType} setLogType={setLogType} logStart={logStart} setLogStart={setLogStart} logEnd={logEnd} setLogEnd={setLogEnd} logChannelId={logChannelId} setLogChannelId={setLogChannelId} logTokenName={logTokenName} setLogTokenName={setLogTokenName} logModelName={logModelName} setLogModelName={setLogModelName} logPage={logPage} logPageSize={logPageSize} logTotal={logTotal} onSearch={() => loadLogs(1)} onPageChange={loadLogs} />}
            </main>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewApiConsole;

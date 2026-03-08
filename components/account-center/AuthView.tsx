import React from 'react';
import { Loader2, LogIn, Mail, UserPlus } from 'lucide-react';
import { NewApiStatus } from '../../services/newApiService';
import { AuthTab, LoginFormState, RegisterFormState } from './internal';
import { SectionCard } from './ui';

interface AuthViewProps {
  status: NewApiStatus | null;
  authTab: AuthTab;
  setAuthTab: React.Dispatch<React.SetStateAction<AuthTab>>;
  needsTwoFactor: boolean;
  authLoading: boolean;
  verificationLoading: boolean;
  loginForm: LoginFormState;
  setLoginForm: React.Dispatch<React.SetStateAction<LoginFormState>>;
  registerForm: RegisterFormState;
  setRegisterForm: React.Dispatch<React.SetStateAction<RegisterFormState>>;
  onLogin: () => Promise<void>;
  onVerifyTwoFactor: () => Promise<void>;
  onRegister: () => Promise<void>;
  onSendVerificationCode: () => Promise<void>;
}

const inputClassName = 'w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]';

export const AuthView: React.FC<AuthViewProps> = ({
  status,
  authTab,
  setAuthTab,
  needsTwoFactor,
  authLoading,
  verificationLoading,
  loginForm,
  setLoginForm,
  registerForm,
  setRegisterForm,
  onLogin,
  onVerifyTwoFactor,
  onRegister,
  onSendVerificationCode,
}) => {
  const contentClassName = authTab === 'login' ? 'mx-auto w-full max-w-[560px]' : 'w-full';

  const handleLoginSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authLoading) {
      return;
    }
    if (needsTwoFactor) {
      void onVerifyTwoFactor();
      return;
    }
    void onLogin();
  };

  const handleRegisterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authLoading) {
      return;
    }
    void onRegister();
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title={authTab === 'login' ? (needsTwoFactor ? '完成两步验证' : '登录账号') : '注册账号'}
        description={authTab === 'login'
          ? '先完成登录，再进入充值、令牌管理和使用日志。'
          : '建议先完成注册，再回到登录流程获取当前项目可用的专属密钥。'}
      >
        <div className={contentClassName}>
          <div className="inline-flex rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-1">
            <button
              type="button"
              onClick={() => { setAuthTab('login'); }}
              className={`rounded-xl px-4 py-2 text-sm transition-colors ${authTab === 'login' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              <span className="inline-flex items-center gap-2"><LogIn className="h-4 w-4" /> 登录</span>
            </button>
            <button
              type="button"
              onClick={() => { setAuthTab('register'); }}
              className={`rounded-xl px-4 py-2 text-sm transition-colors ${authTab === 'register' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              <span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> 注册</span>
            </button>
          </div>

          {authTab === 'login' ? (
            <form className="mt-5 space-y-4" onSubmit={handleLoginSubmit}>
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="用户名"
                className={inputClassName}
                autoComplete="username"
              />

              {!needsTwoFactor ? (
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="密码"
                  className={inputClassName}
                  autoComplete="current-password"
                />
              ) : (
                <input
                  value={loginForm.twoFactorCode}
                  onChange={(event) => setLoginForm((current) => ({ ...current, twoFactorCode: event.target.value }))}
                  placeholder="请输入 2FA 验证码"
                  className={inputClassName}
                  autoComplete="one-time-code"
                />
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-3 font-medium text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:opacity-60"
              >
                {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {needsTwoFactor ? '完成验证' : '立即登录'}
              </button>

              {status?.turnstile_check && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  当前账号系统启用了额外安全验证，本页暂不支持完成该步骤，请联系管理员处理。
                </div>
              )}
            </form>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleRegisterSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  value={registerForm.username}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="用户名"
                  className={inputClassName}
                  autoComplete="username"
                />
                <input
                  value={registerForm.affCode}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, affCode: event.target.value }))}
                  placeholder="邀请码/邀请链接（可选）"
                  className={inputClassName}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="密码（至少 8 位）"
                  className={inputClassName}
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  value={registerForm.confirmPassword}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="确认密码"
                  className={inputClassName}
                  autoComplete="new-password"
                />
              </div>

              {status?.email_verification && (
                <>
                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      value={registerForm.email}
                      onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="邮箱地址"
                      className={inputClassName}
                      autoComplete="email"
                    />
                    <button
                      type="button"
                      onClick={() => void onSendVerificationCode()}
                      disabled={verificationLoading}
                      className="inline-flex min-w-[168px] items-center justify-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-3 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
                    >
                      {verificationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      发送验证码
                    </button>
                  </div>
                  <input
                    value={registerForm.verificationCode}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, verificationCode: event.target.value }))}
                    placeholder="邮箱验证码"
                    className={inputClassName}
                    autoComplete="one-time-code"
                  />
                </>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-3 font-medium text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:opacity-60"
              >
                {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                创建账号
              </button>
            </form>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

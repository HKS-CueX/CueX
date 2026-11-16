import React, { useCallback, useEffect, useState } from 'react';
import type {
  AccountUsageSummary,
  AuthSessionResponse,
  DataDeletionReceipt,
  Entitlement,
  PaymentChannel,
  PaymentCheckoutPreviewResult,
  PlanDefinition,
} from '@cuex/protocol';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  CreditCard,
  Download,
  ExternalLink,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Wallet,
} from 'lucide-react';
import {
  createAuthSession,
  deleteAccountData,
  deleteSessionById,
  ensureAuthSession,
  exportAccountData,
  fetchAccountUsage,
  fetchPlans,
  listSessionsHistory,
  logoutAuthSession,
  previewCheckout,
  type AccountExportResult,
  type SessionHistoryItem,
} from '@/lib/api';
import {
  formatApiError,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatMoneyFen,
  PLAN_CYCLE_LABELS,
} from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type AccountTab = 'account' | 'plans' | 'sessions' | 'privacy';

interface AccountPanelProps {
  authSession: AuthSessionResponse | null;
  onAuthChanged: (next: AuthSessionResponse) => void;
  onAccountWiped?: (receipt: DataDeletionReceipt, nextAuth: AuthSessionResponse) => void;
  onInspectSession?: (sessionId: string) => void;
  onClose?: () => void;
}

const PLAN_LABELS: Record<string, string> = {
  free: '免费体验版',
  event: '单场冲刺包',
  pro: '个人专业版',
  team: '团队协作版',
};

const DELETION_SCOPE_LABELS: Record<string, string> = {
  sessions: '演讲记录',
  packs: '讲稿提纲',
  memories: '演讲偏好',
  reflections: '复盘报告',
  telemetry: '运行记录',
  usage_records: '额度记录',
  auth_tokens: '登录凭证',
};

function triggerBrowserDownload(filename: string, content: string, mime: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const AccountPanel: React.FC<AccountPanelProps> = ({
  authSession,
  onAuthChanged,
  onAccountWiped,
  onInspectSession,
  onClose,
}) => {
  const [tab, setTab] = useState<AccountTab>('account');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [switchName, setSwitchName] = useState(authSession?.user.displayName ?? '');
  const [switchEmail, setSwitchEmail] = useState(authSession?.user.email ?? '');
  const [switchTenant, setSwitchTenant] = useState(authSession?.user.tenantId ?? 'tenant_default');
  const [switchingAuth, setSwitchingAuth] = useState(false);

  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [usageSummary, setUsageSummary] = useState<AccountUsageSummary | null>(
    authSession?.usageSummary ?? null
  );
  const [entitlements, setEntitlements] = useState<Entitlement[]>(authSession?.entitlements ?? []);
  const [paymentChannel] = useState<PaymentChannel>('wechat_pay');
  const [proCycle, setProCycle] = useState<'monthly' | 'annual'>('monthly');
  const [checkoutPreview, setCheckoutPreview] = useState<PaymentCheckoutPreviewResult | null>(null);
  const [previewLoadingPlan, setPreviewLoadingPlan] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [sessionDeletionReceipt, setSessionDeletionReceipt] =
    useState<DataDeletionReceipt | null>(null);

  const [exportResult, setExportResult] = useState<AccountExportResult | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'json' | 'markdown' | null>(null);
  const [confirmWipeChecked, setConfirmWipeChecked] = useState(false);
  const [wipingAccount, setWipingAccount] = useState(false);
  const [accountDeletionReceipt, setAccountDeletionReceipt] =
    useState<DataDeletionReceipt | null>(null);

  useEffect(() => {
    if (authSession) {
      setUsageSummary(authSession.usageSummary);
      setEntitlements(authSession.entitlements);
      if (!switchName) setSwitchName(authSession.user.displayName);
      if (!switchEmail && authSession.user.email) setSwitchEmail(authSession.user.email);
      if (authSession.user.tenantId) setSwitchTenant(authSession.user.tenantId);
    }
  }, [authSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshPanelData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansData, usageData, historyData] = await Promise.all([
        fetchPlans(),
        fetchAccountUsage(),
        listSessionsHistory(),
      ]);
      setPlans(plansData);
      setUsageSummary(usageData.summary);
      if (usageData.entitlements) {
        setEntitlements(usageData.entitlements);
      }
      setSessions(historyData);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPanelData();
  }, [refreshPanelData, authSession?.user.userId]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchName.trim()) {
      setError('请填写你的称呼');
      return;
    }
    setSwitchingAuth(true);
    setError(null);
    setNotice(null);
    setCheckoutPreview(null);
    setExportResult(null);
    setSessionDeletionReceipt(null);
    setAccountDeletionReceipt(null);

    try {
      const next = await createAuthSession({
        displayName: switchName.trim(),
        email: switchEmail.trim() || undefined,
        tenantId: switchTenant.trim() || undefined,
      });
      onAuthChanged(next);
      setNotice(`已更新个人资料：${next.user.displayName}`);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSwitchingAuth(false);
    }
  };

  const handleRotateToken = async () => {
    setSwitchingAuth(true);
    setError(null);
    try {
      await logoutAuthSession();
      const fresh = await ensureAuthSession();
      onAuthChanged(fresh);
      setNotice('已刷新登录会话。');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSwitchingAuth(false);
    }
  };

  const handlePreviewCheckout = async (plan: PlanDefinition) => {
    if (plan.status === 'planned') return;
    setPreviewLoadingPlan(plan.planId);
    setError(null);
    try {
      const cycle =
        plan.planId === 'event'
          ? 'one_time_14d'
          : plan.planId === 'pro'
            ? proCycle
            : 'monthly';
      const result = await previewCheckout({
        planId: plan.planId,
        billingCycle: cycle,
        paymentChannel,
      });
      setCheckoutPreview(result);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setPreviewLoadingPlan(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setError(null);
    try {
      const res = await deleteSessionById(sessionId);
      setSessions((prev) => prev.filter((item) => item.sessionId !== sessionId));
      if (res.receipt) {
        setSessionDeletionReceipt(res.receipt);
      }
      setNotice('已删除该场演讲记录。');
      void fetchAccountUsage()
        .then((u) => {
          setUsageSummary(u.summary);
        })
        .catch(() => {});
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleExport = async (format: 'json' | 'markdown') => {
    setExportingFormat(format);
    setError(null);
    try {
      const res = await exportAccountData(format);
      setExportResult(res);
      triggerBrowserDownload(
        res.filename,
        res.content,
        format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8'
      );
      setNotice(`已导出文件 ${res.filename}（${formatBytes(res.content.length)}）。`);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setExportingFormat(null);
    }
  };

  const handleWipeAccountData = async () => {
    if (!confirmWipeChecked) return;
    setWipingAccount(true);
    setError(null);
    try {
      const receipt = await deleteAccountData();
      setAccountDeletionReceipt(receipt);
      setConfirmWipeChecked(false);
      setSessions([]);
      setExportResult(null);

      const fresh = await createAuthSession({
        displayName: authSession?.user.displayName ?? '我的账户',
        tenantId: authSession?.user.tenantId,
      });
      onAccountWiped?.(receipt, fresh);
      onAuthChanged(fresh);
      setNotice('个人讲稿、演讲记录与偏好已清空。');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setWipingAccount(false);
    }
  };

  const activePlanId = usageSummary?.activePlanId ?? 'free';

  return (
    <div className="space-y-4" data-testid="account-panel">
      {/* Header Summary */}
      <div className="rounded border border-line bg-ground p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <UserCheck className="w-4 h-4 text-violet shrink-0" />
            <span className="text-sm font-semibold text-ink truncate" data-testid="account-user-name">
              {authSession?.user.displayName ?? '我的账户'}
            </span>
            <Badge variant="violet">
              {PLAN_LABELS[activePlanId] ?? activePlanId.toUpperCase()}
            </Badge>
          </div>
          {authSession?.user.email && (
            <p className="text-xs text-ink-3 truncate">{authSession.user.email}</p>
          )}
        </div>

        <Button
          type="button"
          variant="quiet"
          size="sm"
          onClick={() => void refreshPanelData()}
          disabled={loading}
          data-testid="account-refresh-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-line pb-2.5">
        {(
          [
            { key: 'account', label: '个人资料', icon: UserCheck },
            { key: 'plans', label: '会员方案', icon: Wallet },
            { key: 'sessions', label: `演讲记录 (${sessions.length})`, icon: History },
            { key: 'privacy', label: '数据管理', icon: ShieldAlert },
          ] as Array<{ key: AccountTab; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              data-testid={`account-tab-${item.key}`}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[38px] sm:min-h-[32px] rounded text-xs font-medium border transition-transform duration-100 ease-out-custom active:scale-[0.97] ${
                active
                  ? 'bg-ink text-ground border-ink'
                  : 'bg-surface text-ink-2 border-line hover:bg-ground-2 hover:text-ink'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="rounded border border-alert/35 bg-alert-tint px-3.5 py-2.5 text-xs text-alert flex items-start gap-2"
          data-testid="account-panel-error"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          className="rounded border border-resolved/35 bg-resolved-tint px-3.5 py-2.5 text-xs text-resolved flex items-start gap-2"
          data-testid="account-panel-notice"
        >
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* TAB 1: PROFILE & QUOTA */}
      {tab === 'account' && (
        <div className="space-y-4">
          <div className="rounded border border-line bg-surface p-4 space-y-3">
            <h4 className="text-sm font-semibold text-ink">基本信息</h4>

            <form
              onSubmit={(e) => void handleSaveProfile(e)}
              className="space-y-3"
              data-testid="auth-switch-form"
            >
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="auth-switch-name" className="block text-xs text-ink-2 font-medium mb-1">
                    称呼 / 昵称 *
                  </label>
                  <input
                    id="auth-switch-name"
                    type="text"
                    value={switchName}
                    onChange={(e) => setSwitchName(e.target.value)}
                    placeholder="例如：林同学 / 陈创始人"
                    data-testid="auth-switch-name"
                    className="w-full h-9 px-2.5 text-xs rounded border border-line-strong bg-ground text-ink focus:outline-none focus:border-ink"
                  />
                </div>
                <div>
                  <label htmlFor="auth-switch-email" className="block text-xs text-ink-2 font-medium mb-1">
                    联系邮箱（选填）
                  </label>
                  <input
                    id="auth-switch-email"
                    type="email"
                    value={switchEmail}
                    onChange={(e) => setSwitchEmail(e.target.value)}
                    placeholder="用于接收复盘报告或通知"
                    data-testid="auth-switch-email"
                    className="w-full h-9 px-2.5 text-xs rounded border border-line-strong bg-ground text-ink focus:outline-none focus:border-ink"
                  />
                </div>
              </div>

              {/* Advanced workspace switcher folded away from everyday consumer view */}
              <details
                className="group border border-line rounded bg-ground/60 px-3 py-2 text-xs"
                data-testid="advanced-workspace-details"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between text-ink-3 hover:text-ink select-none">
                  <span>高级选项：切换独立工作空间</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pt-2.5 flex flex-wrap items-end justify-between gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label htmlFor="auth-switch-tenant" className="block text-xs text-ink-2 mb-1">
                      工作空间标识
                    </label>
                    <input
                      id="auth-switch-tenant"
                      type="text"
                      value={switchTenant}
                      onChange={(e) => setSwitchTenant(e.target.value)}
                      placeholder="default"
                      data-testid="auth-switch-tenant"
                      className="w-full h-8 px-2.5 text-xs rounded border border-line bg-surface text-ink focus:outline-none focus:border-ink"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={() => void handleRotateToken()}
                    disabled={switchingAuth}
                    data-testid="auth-rotate-btn"
                  >
                    刷新登录状态
                  </Button>
                </div>
              </details>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={switchingAuth}
                  data-testid="auth-switch-submit"
                >
                  {switchingAuth ? '保存中…' : '保存资料'}
                </Button>
              </div>
            </form>
          </div>

          {/* Active Quota */}
          <div className="rounded border border-line bg-surface p-4 space-y-2.5">
            <h4 className="text-sm font-semibold text-ink">当前可用额度</h4>
            {entitlements.length === 0 ? (
              <p className="text-xs text-ink-3">当前使用免费体验版基础额度。</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {entitlements.map((ent) => (
                  <div
                    key={ent.entitlementId}
                    className="rounded bg-ground p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {PLAN_LABELS[ent.planId] ?? ent.planId.toUpperCase()}
                      </span>
                      <Badge variant={ent.status === 'active' ? 'resolved' : 'secondary'}>
                        {ent.status === 'active' ? '生效中' : '已到期'}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink-2 num">
                      剩余可用场次：{ent.remainingSessions ?? '不限'} ｜ 剩余云端语音：
                      {ent.remainingLiveMinutes ?? '不限'} 分钟
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PLANS & USAGE */}
      {tab === 'plans' && (
        <div className="space-y-4">
          {usageSummary && (
            <div
              className="grid grid-cols-2 rounded border border-line bg-surface divide-x divide-line"
              data-testid="account-usage-summary"
            >
              <div className="p-3.5">
                <div className="text-xs text-ink-3">本周期已用场次</div>
                <div className="text-base font-mono font-semibold text-ink mt-1 num">
                  {usageSummary.sessionsUsed}
                  <span className="text-xs text-ink-3 font-normal">
                    {' '}
                    / {usageSummary.sessionsLimit ?? '不限'}
                  </span>
                </div>
              </div>
              <div className="p-3.5">
                <div className="text-xs text-ink-3">已用云端语音时长</div>
                <div className="text-base font-mono font-semibold text-ink mt-1 num">
                  {usageSummary.liveMinutesUsed} 分钟
                  <span className="text-xs text-ink-3 font-normal">
                    {' '}
                    / {usageSummary.liveMinutesLimit ?? '不限'} 分钟
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-ink-2">选择适合你演讲频率的方案：</span>
            <div className="inline-flex rounded border border-line bg-ground p-0.5">
              <button
                type="button"
                onClick={() => setProCycle('monthly')}
                className={`px-2.5 py-1 rounded-sm text-xs ${
                  proCycle === 'monthly' ? 'bg-ink text-ground font-medium' : 'text-ink-2'
                }`}
              >
                按月
              </button>
              <button
                type="button"
                onClick={() => setProCycle('annual')}
                className={`px-2.5 py-1 rounded-sm text-xs ${
                  proCycle === 'annual' ? 'bg-ink text-ground font-medium' : 'text-ink-2'
                }`}
              >
                按年（省 30%）
              </button>
            </div>
          </div>

          {/* Plan Cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            {plans.map((plan) => {
              const isPlanned = plan.status === 'planned';
              const isCurrent = usageSummary?.activePlanId === plan.planId;
              const priceText =
                plan.planId === 'pro' && proCycle === 'annual' && plan.annualPrice
                  ? `${formatMoneyFen(plan.annualPrice)} / 年`
                  : `${formatMoneyFen(plan.price)}（${PLAN_CYCLE_LABELS[plan.billingCycle]}）`;

              return (
                <div
                  key={plan.planId}
                  data-testid={`plan-card-${plan.planId}`}
                  aria-disabled={isPlanned ? 'true' : undefined}
                  className={`rounded border p-4 flex flex-col justify-between gap-3 ${
                    isPlanned
                      ? 'border-line bg-ground/70'
                      : isCurrent
                        ? 'border-ink bg-surface'
                        : 'border-line bg-surface'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {plan.displayName}
                      </span>
                      {isPlanned ? (
                        <Badge variant="secondary" data-testid={`plan-status-${plan.planId}`}>
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span>即将推出</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant={isCurrent ? 'violet' : 'amber'}
                          data-testid={`plan-status-${plan.planId}`}
                        >
                          {isCurrent ? '当前方案' : '可选方案'}
                        </Badge>
                      )}
                    </div>

                    <div className="text-base font-mono font-semibold text-ink num">
                      {priceText}
                    </div>

                    <ul className="space-y-1 text-xs text-ink-2">
                      {plan.features.map((feat, idx) => (
                        <li key={idx}>• {feat}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    {isPlanned ? (
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        disabled
                        className="w-full"
                        data-testid={`preview-checkout-${plan.planId}`}
                      >
                        团队版即将推出
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant={isCurrent ? 'quiet' : 'default'}
                        size="sm"
                        onClick={() => void handlePreviewCheckout(plan)}
                        disabled={previewLoadingPlan === plan.planId}
                        className="w-full"
                        data-testid={`preview-checkout-${plan.planId}`}
                      >
                        {previewLoadingPlan === plan.planId
                          ? '加载方案详情…'
                          : isCurrent
                            ? '查看当前方案详情'
                            : '了解升级方案'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Beta Plan Details */}
          {checkoutPreview && (
            <div
              className="rounded border border-violet/35 bg-violet-tint/70 p-3.5 space-y-2 text-xs"
              data-testid="checkout-preview-result"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-ink">
                  <CreditCard className="w-4 h-4 text-violet shrink-0" />
                  <span>
                    {PLAN_LABELS[checkoutPreview.planId] ?? checkoutPreview.planId.toUpperCase()} 方案说明
                  </span>
                </div>
                <Badge variant="violet">公开体验期</Badge>
              </div>
              <p className="text-ink-2 leading-relaxed">
                当前处于公开体验阶段，核心备稿、余光提词与复盘重练功能均可直接使用；正式订阅开通后将支持微信支付与支付宝自助升级（方案标准价{' '}
                <strong className="font-mono text-ink">{formatMoneyFen(checkoutPreview.total)}</strong>
                ）。
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SESSION HISTORY */}
      {tab === 'sessions' && (
        <div className="space-y-3">
          {sessionDeletionReceipt && (
            <div
              className="rounded border border-resolved/35 bg-resolved-tint p-3 text-xs space-y-1"
              data-testid="history-deletion-receipt"
            >
              <div className="font-semibold text-resolved">该场演讲记录已删除</div>
              <div className="text-xs text-ink-2 num">
                删除时间：{formatDateTime(sessionDeletionReceipt.completedAt)}
              </div>
            </div>
          )}

          {sessions.length === 0 ? (
            <div
              className="rounded border border-dashed border-line bg-ground p-6 text-center text-xs text-ink-3"
              data-testid="session-history-empty"
            >
              还没有历史演讲记录。完成一次彩排或正式上台后，可以在这里随时回看复盘。
            </div>
          ) : (
            <div className="space-y-2" data-testid="session-history-list">
              {sessions.map((item) => (
                <div
                  key={item.sessionId}
                  data-testid={`session-history-item-${item.sessionId}`}
                  className="rounded border border-line bg-surface p-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink truncate">
                        {item.title || '未命名演讲'}
                      </span>
                      <Badge variant="secondary">
                        {item.mode === 'live' ? '正式演讲' : '彩排演练'}
                      </Badge>
                      <Badge variant={item.status === 'ended' ? 'resolved' : 'amber'}>
                        {item.status === 'ended' ? '已完成' : '进行中'}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink-3 num">
                      时间：{formatDateTime(item.startedAt)}
                      {item.elapsedSec !== undefined
                        ? ` ｜ 时长 ${formatDuration(item.elapsedSec)}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onInspectSession && (
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => {
                          onInspectSession(item.sessionId);
                          onClose?.();
                        }}
                        data-testid={`inspect-session-${item.sessionId}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        查看复盘
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="alert"
                      size="sm"
                      onClick={() => void handleDeleteSession(item.sessionId)}
                      data-testid={`delete-session-${item.sessionId}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EXPORT & CLEAR DATA */}
      {tab === 'privacy' && (
        <div className="space-y-4">
          <div className="rounded border border-line bg-surface p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-ink">导出我的数据</h4>
              <p className="text-xs text-ink-3 mt-0.5">
                将你准备过的讲稿提纲、复盘报告与演讲偏好打包下载到本地保存。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => void handleExport('markdown')}
                disabled={exportingFormat !== null}
                data-testid="export-md-btn"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                {exportingFormat === 'markdown' ? '正在导出…' : '导出 Markdown 文档'}
              </Button>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => void handleExport('json')}
                disabled={exportingFormat !== null}
                data-testid="export-json-btn"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                {exportingFormat === 'json' ? '正在导出…' : '导出 JSON 备份'}
              </Button>
            </div>

            {exportResult && (
              <div
                className="rounded bg-ground p-3 space-y-2"
                data-testid="export-preview"
              >
                <div className="flex items-center justify-between text-xs text-ink-2">
                  <span className="font-mono">{exportResult.filename}</span>
                  <span className="num">{formatBytes(exportResult.content.length)}</span>
                </div>
                <pre className="max-h-40 overflow-y-auto text-xs font-mono text-ink-2 whitespace-pre-wrap break-all bg-surface p-2.5 rounded border border-line">
                  {exportResult.content.slice(0, 1200)}
                  {exportResult.content.length > 1200 ? '\n…（完整内容已下载至本地）' : ''}
                </pre>
              </div>
            )}
          </div>

          <div className="rounded border border-alert/35 bg-alert-tint/60 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-alert shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-alert">
                  清空全部个人数据
                </h4>
                <p className="text-xs text-ink-2 leading-relaxed">
                  永久删除当前账户下的所有讲稿提纲、历史演讲记录、复盘报告与个人偏好设置，删除后无法恢复。
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-ink cursor-pointer min-h-[32px]">
              <input
                type="checkbox"
                checked={confirmWipeChecked}
                onChange={(e) => setConfirmWipeChecked(e.target.checked)}
                data-testid="confirm-account-wipe-checkbox"
                className="w-4 h-4 rounded border-line-strong accent-ink"
              />
              <span>我确认清空全部个人讲稿、记录与偏好</span>
            </label>

            <Button
              type="button"
              variant="alert"
              size="sm"
              disabled={!confirmWipeChecked || wipingAccount}
              onClick={() => void handleWipeAccountData()}
              data-testid="wipe-account-data-btn"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {wipingAccount ? '正在清空…' : '立即清空全部数据'}
            </Button>

            {accountDeletionReceipt && (
              <div
                className="rounded border border-resolved/40 bg-surface p-3.5 space-y-2 text-xs"
                data-testid="account-deletion-receipt"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-resolved">
                    个人数据已清空完毕
                  </span>
                  <span className="text-xs text-ink-3 num">
                    {formatDateTime(accountDeletionReceipt.completedAt)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {accountDeletionReceipt.deletedScopes.map((entry) => (
                    <Badge key={entry.scope} variant="secondary">
                      {DELETION_SCOPE_LABELS[entry.scope] ?? entry.scope}: {entry.deletedCount}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

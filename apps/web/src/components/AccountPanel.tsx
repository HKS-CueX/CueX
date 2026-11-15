import React, { useCallback, useEffect, useState } from 'react';
import type {
  AccountUsageSummary,
  AuthSessionResponse,
  BillingAuditRecord,
  DataDeletionReceipt,
  Entitlement,
  PaymentChannel,
  PaymentCheckoutPreviewResult,
  PlanDefinition,
  UsageRecord,
} from '@cuex/protocol';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Download,
  ExternalLink,
  History,
  KeyRound,
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
  formatMoneyFen,
  PLAN_CYCLE_LABELS,
  USAGE_TYPE_LABELS,
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

const DELETION_SCOPE_LABELS: Record<string, string> = {
  sessions: '演讲会话记录',
  packs: '场前编译包',
  memories: '个人记忆条目',
  reflections: '场后复盘报告',
  telemetry: '实时遥测记录',
  usage_records: '用量账本记录',
  auth_tokens: '历史认证令牌',
};

const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  sandbox: '本地沙盒估算',
  wechat_pay: '微信支付（预览）',
  alipay: '支付宝（预览）',
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

  // Switch profile form
  const [switchName, setSwitchName] = useState(authSession?.user.displayName ?? '');
  const [switchEmail, setSwitchEmail] = useState(authSession?.user.email ?? '');
  const [switchTenant, setSwitchTenant] = useState(authSession?.user.tenantId ?? 'tenant_default');
  const [switchingAuth, setSwitchingAuth] = useState(false);

  // Plans & Usage
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [usageSummary, setUsageSummary] = useState<AccountUsageSummary | null>(
    authSession?.usageSummary ?? null
  );
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>(authSession?.entitlements ?? []);
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>('sandbox');
  const [proCycle, setProCycle] = useState<'monthly' | 'annual'>('monthly');
  const [checkoutPreview, setCheckoutPreview] = useState<PaymentCheckoutPreviewResult | null>(null);
  const [previewLoadingPlan, setPreviewLoadingPlan] = useState<string | null>(null);

  // Sessions history
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [sessionDeletionReceipt, setSessionDeletionReceipt] =
    useState<DataDeletionReceipt | null>(null);

  // Privacy / Export / Audit / Account Wipe
  const [billingAudit, setBillingAudit] = useState<BillingAuditRecord[]>([]);
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
  }, [authSession]);

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
      setUsageRecords(usageData.records);
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

  const handleSwitchProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchName.trim()) {
      setError('请输入用于创建或切换身份的显示名称');
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
      setNotice(`已切换认证身份为「${next.user.displayName}」（租户 ${next.user.tenantId}）`);
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
      setNotice('已吊销旧令牌并签发新的 Bearer 会话令牌。');
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
      setNotice(`会话 ${sessionId} 已从个人空间销毁。`);
      void fetchAccountUsage()
        .then((u) => {
          setUsageRecords(u.records);
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
      if (res.bundle?.billingAuditRecords) {
        setBillingAudit(res.bundle.billingAuditRecords);
      }
      triggerBrowserDownload(
        res.filename,
        res.content,
        format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8'
      );
      setNotice(`已生成 ${res.filename}（${formatBytes(res.content.length)}）。`);
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

      // Re-issue a fresh empty session token so the UI remains usable cleanly.
      const fresh = await createAuthSession({
        displayName: authSession?.user.displayName ?? 'CueX 演示演讲者',
        tenantId: authSession?.user.tenantId,
      });
      onAccountWiped?.(receipt, fresh);
      onAuthChanged(fresh);
      setNotice('个人业务数据已按主权协议销毁，保留不可删除的合规审计回执。');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setWipingAccount(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="account-panel">
      {/* Header Status Summary */}
      <div className="rounded-lg border border-line bg-ground p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <UserCheck className="w-4 h-4 text-violet shrink-0" />
            <span className="text-[14px] font-semibold text-ink truncate" data-testid="account-user-name">
              {authSession?.user.displayName ?? '未登录会话'}
            </span>
            <Badge variant="violet">
              套餐: {usageSummary?.activePlanId?.toUpperCase() ?? 'FREE'}
            </Badge>
            <Badge variant="secondary">
              租户: {authSession?.user.tenantId ?? 'tenant_default'}
            </Badge>
          </div>
          <p className="text-[11px] font-mono text-ink-3 truncate">
            userId: {authSession?.user.userId ?? '-'}
            {authSession?.sessionTokenExpiresAt
              ? ` · 令牌有效期至 ${formatDateTime(authSession.sessionTokenExpiresAt)}`
              : ''}
          </p>
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
          刷新状态
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-line pb-2.5">
        {(
          [
            { key: 'account', label: '账户与隔离', icon: KeyRound },
            { key: 'plans', label: '套餐与用量', icon: Wallet },
            { key: 'sessions', label: `会话历史 (${sessions.length})`, icon: History },
            { key: 'privacy', label: '数据导出与销毁', icon: ShieldAlert },
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors border ${
                active
                  ? 'bg-ink text-white border-ink'
                  : 'bg-surface text-ink-2 border-line hover:bg-ground-2'
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
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger flex items-start gap-2"
          data-testid="account-panel-error"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          className="rounded-md border border-resolved/30 bg-resolved-soft px-3 py-2 text-[12px] text-resolved flex items-start gap-2"
          data-testid="account-panel-notice"
        >
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* TAB 1: ACCOUNT & MULTI-TENANT SWITCH */}
      {tab === 'account' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-[13px] font-semibold text-ink">
                  多用户 / 租户隔离认证 (Bearer Token)
                </h4>
                <p className="text-[11px] text-ink-3">
                  不同用户与租户拥有严格隔离的 ContextPack、会话记录与个人记忆；切换后立即可验证跨用户隔离。
                </p>
              </div>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => void handleRotateToken()}
                disabled={switchingAuth}
                data-testid="auth-rotate-btn"
              >
                轮换令牌
              </Button>
            </div>

            <form
              onSubmit={(e) => void handleSwitchProfile(e)}
              className="grid sm:grid-cols-3 gap-2.5 pt-1"
              data-testid="auth-switch-form"
            >
              <div>
                <label className="block text-[11px] text-ink-3 mb-1">演讲者昵称 *</label>
                <input
                  type="text"
                  value={switchName}
                  onChange={(e) => setSwitchName(e.target.value)}
                  placeholder="例如 User A / 李明"
                  data-testid="auth-switch-name"
                  className="w-full px-2.5 py-1.5 text-[12px] rounded border border-line bg-ground text-ink focus:outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-3 mb-1">邮箱（可选）</label>
                <input
                  type="email"
                  value={switchEmail}
                  onChange={(e) => setSwitchEmail(e.target.value)}
                  placeholder="speaker@example.com"
                  data-testid="auth-switch-email"
                  className="w-full px-2.5 py-1.5 text-[12px] rounded border border-line bg-ground text-ink focus:outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-3 mb-1">租户 ID（隔离域）</label>
                <input
                  type="text"
                  value={switchTenant}
                  onChange={(e) => setSwitchTenant(e.target.value)}
                  placeholder="tenant_default"
                  data-testid="auth-switch-tenant"
                  className="w-full px-2.5 py-1.5 text-[12px] rounded border border-line bg-ground text-ink focus:outline-none focus:border-ink"
                />
              </div>

              <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-ink-3">
                  当前认证模式: <span className="font-mono">{authSession?.user.authMode ?? 'session_token'}</span>
                </span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={switchingAuth}
                  data-testid="auth-switch-submit"
                >
                  {switchingAuth ? '切换中…' : '登录 / 切换身份'}
                </Button>
              </div>
            </form>
          </div>

          {/* Active Entitlements */}
          <div className="rounded-lg border border-line bg-surface p-4 space-y-2.5">
            <h4 className="text-[13px] font-semibold text-ink">当前生效权益 (Entitlements)</h4>
            {entitlements.length === 0 ? (
              <p className="text-[12px] text-ink-3">暂无权益条目，默认按 Free 额度执行。</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {entitlements.map((ent) => (
                  <div
                    key={ent.entitlementId}
                    className="rounded border border-line bg-ground p-3 text-[12px] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink uppercase">{ent.planId}</span>
                      <Badge variant={ent.status === 'active' ? 'resolved' : 'secondary'}>
                        {ent.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-ink-2">
                      剩余场次：{ent.remainingSessions ?? '不限'} · 剩余实时时长：
                      {ent.remainingLiveMinutes ?? '不限'} 分钟
                    </p>
                    <p className="text-[10px] font-mono text-ink-3">
                      来源：{ent.source} · 授予：{formatDateTime(ent.grantedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PLANS, CHECKOUT SANDBOX PREVIEW & USAGE LEDGER */}
      {tab === 'plans' && (
        <div className="space-y-4">
          {/* Usage Summary */}
          {usageSummary && (
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
              data-testid="account-usage-summary"
            >
              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="text-[11px] text-ink-3">本周期会话数</div>
                <div className="text-[16px] font-mono font-semibold text-ink mt-0.5">
                  {usageSummary.sessionsUsed}
                  <span className="text-[11px] text-ink-3 font-normal">
                    {' '}
                    / {usageSummary.sessionsLimit ?? '∞'}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="text-[11px] text-ink-3">实时音频时长</div>
                <div className="text-[16px] font-mono font-semibold text-ink mt-0.5">
                  {usageSummary.liveMinutesUsed}m
                  <span className="text-[11px] text-ink-3 font-normal">
                    {' '}
                    / {usageSummary.liveMinutesLimit ?? '∞'}m
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="text-[11px] text-ink-3">累计消耗 Token</div>
                <div className="text-[16px] font-mono font-semibold text-ink mt-0.5">
                  {usageSummary.totalTokensUsed.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="text-[11px] text-ink-3">计量成本估算</div>
                <div className="text-[16px] font-mono font-semibold text-ink mt-0.5">
                  {formatMoneyFen(usageSummary.totalCost ?? usageSummary.totalCostFen)}
                </div>
              </div>
            </div>
          )}

          {/* Commercial Sandbox Controls */}
          <div className="rounded-lg border border-amber/30 bg-amber-soft/50 p-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <div className="flex items-center gap-2 text-ink">
              <CreditCard className="w-4 h-4 text-amber shrink-0" />
              <span>
                <strong>商业试算声明：</strong>以下定价为 <code>isCommercialHypothesis</code>{' '}
                假设，点击购买仅触发<strong>沙盒结算预览</strong>，不连接真实扣费。
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={paymentChannel}
                onChange={(e) => setPaymentChannel(e.target.value as PaymentChannel)}
                data-testid="payment-channel-select"
                className="px-2 py-1 text-[11px] rounded border border-line bg-surface text-ink"
              >
                <option value="sandbox">{PAYMENT_CHANNEL_LABELS.sandbox}</option>
                <option value="wechat_pay">{PAYMENT_CHANNEL_LABELS.wechat_pay}</option>
                <option value="alipay">{PAYMENT_CHANNEL_LABELS.alipay}</option>
              </select>
              <select
                value={proCycle}
                onChange={(e) => setProCycle(e.target.value as 'monthly' | 'annual')}
                data-testid="pro-cycle-select"
                className="px-2 py-1 text-[11px] rounded border border-line bg-surface text-ink"
              >
                <option value="monthly">Pro 按月计费</option>
                <option value="annual">Pro 按年计费</option>
              </select>
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
                  : `${formatMoneyFen(plan.price)} · ${PLAN_CYCLE_LABELS[plan.billingCycle]}`;

              return (
                <div
                  key={plan.planId}
                  data-testid={`plan-card-${plan.planId}`}
                  aria-disabled={isPlanned ? 'true' : undefined}
                  className={`rounded-lg border p-3.5 flex flex-col justify-between gap-3 ${
                    isPlanned
                      ? 'border-line border-dashed bg-ground/70 opacity-85'
                      : isCurrent
                        ? 'border-ink bg-surface shadow-sm'
                        : 'border-line bg-surface'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px] font-semibold text-ink">
                            {plan.displayName}
                          </span>
                          {isPlanned ? (
                            <Badge variant="secondary" data-testid={`plan-status-${plan.planId}`}>
                              <Building2 className="w-3 h-3 mr-1" />
                              Planned · 尚未开放购买
                            </Badge>
                          ) : (
                            <Badge
                              variant={isCurrent ? 'violet' : 'amber'}
                              data-testid={`plan-status-${plan.planId}`}
                            >
                              {isCurrent ? '当前方案' : 'Available · 沙盒可预览'}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[15px] font-mono font-semibold text-ink mt-1">
                          {priceText}
                        </div>
                      </div>
                      {plan.isCommercialHypothesis && (
                        <Badge variant="outline" className="text-[10px]">
                          定价假设
                        </Badge>
                      )}
                    </div>

                    <ul className="space-y-1 text-[11px] text-ink-2">
                      {plan.features.map((feat, idx) => (
                        <li key={idx}>• {feat}</li>
                      ))}
                    </ul>
                    {plan.limitations.length > 0 && (
                      <p className="text-[11px] text-ink-3">
                        限制：{plan.limitations.join('；')}
                      </p>
                    )}
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
                        企业团队版尚未开放购买 (Planned)
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
                          ? '生成沙盒预览…'
                          : '沙盒结账预览（非真实支付）'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Checkout Sandbox Result */}
          {checkoutPreview && (
            <div
              className="rounded-lg border border-violet/30 bg-violet-soft p-3.5 space-y-2 text-[12px]"
              data-testid="checkout-preview-result"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-ink">
                  <CreditCard className="w-4 h-4 text-violet" />
                  <span>
                    结账沙盒预览 ({checkoutPreview.planId.toUpperCase()} ·{' '}
                    {PAYMENT_CHANNEL_LABELS[checkoutPreview.paymentChannel]})
                  </span>
                </div>
                <Badge variant="amber">
                  liveCheckoutAvailable: {String(checkoutPreview.liveCheckoutAvailable)} ·{' '}
                  {checkoutPreview.mode}
                </Badge>
              </div>
              <p className="text-ink-2">{checkoutPreview.notice}</p>
              <div className="flex flex-wrap gap-4 font-mono text-[11px] text-ink">
                <span>小计：{formatMoneyFen(checkoutPreview.subtotal)}</span>
                <span>折扣：{formatMoneyFen(checkoutPreview.discount)}</span>
                <span className="font-semibold">应付预览：{formatMoneyFen(checkoutPreview.total)}</span>
                <span className="text-ink-3">previewId: {checkoutPreview.previewId}</span>
              </div>
            </div>
          )}

          {/* Usage Ledger */}
          <div className="rounded-lg border border-line bg-surface p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-ink">
                用量账本明细 (UsageLedger · 最近 {usageRecords.length} 条)
              </h4>
            </div>
            {usageRecords.length === 0 ? (
              <p className="text-[12px] text-ink-3 py-2">当前尚无用量记录，发起编译或演讲后将自动计量。</p>
            ) : (
              <div
                className="max-h-56 overflow-y-auto divide-y divide-line border border-line rounded"
                data-testid="usage-ledger-list"
              >
                {usageRecords.slice(0, 30).map((rec) => (
                  <div
                    key={rec.id}
                    className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="secondary">{USAGE_TYPE_LABELS[rec.usageType] ?? rec.usageType}</Badge>
                      <span className="font-mono text-ink">
                        {rec.quantity} {rec.unit}
                      </span>
                      <span className="text-ink-3 truncate">来源: {rec.source}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-ink-2">
                      {typeof rec.costFen === 'number' && <span>{formatMoneyFen(rec.costFen)}</span>}
                      <span className="text-ink-3">{formatDateTime(rec.occurredAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SESSION HISTORY */}
      {tab === 'sessions' && (
        <div className="space-y-3">
          {sessionDeletionReceipt && (
            <div
              className="rounded-lg border border-resolved/30 bg-resolved-soft p-3 text-[12px] space-y-1.5"
              data-testid="history-deletion-receipt"
            >
              <div className="font-semibold text-resolved">
                会话数据销毁回执 ({sessionDeletionReceipt.receiptId})
              </div>
              <div className="text-[11px] text-ink-2">
                完成时间：{formatDateTime(sessionDeletionReceipt.completedAt)} · 清除范围：
                {sessionDeletionReceipt.deletedScopes
                  .map((s) => `${DELETION_SCOPE_LABELS[s.scope] ?? s.scope}: ${s.deletedCount}`)
                  .join(' · ')}
              </div>
            </div>
          )}

          {sessions.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-line bg-ground p-6 text-center text-[12px] text-ink-3"
              data-testid="session-history-empty"
            >
              当前认证身份下暂无历史会话记录。完成一次彩排或正式演讲后，可在此回看复盘与销毁数据。
            </div>
          ) : (
            <div className="space-y-2" data-testid="session-history-list">
              {sessions.map((item) => (
                <div
                  key={item.sessionId}
                  data-testid={`session-history-item-${item.sessionId}`}
                  className="rounded-lg border border-line bg-surface p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-ink truncate">
                        {item.title || `会话 ${item.sessionId.slice(0, 12)}`}
                      </span>
                      <Badge variant="secondary">{item.mode === 'live' ? '正式演讲' : '彩排'}</Badge>
                      <Badge variant={item.status === 'ended' ? 'resolved' : 'amber'}>
                        {item.status}
                      </Badge>
                      {typeof item.utilityScore === 'number' && (
                        <Badge variant="violet">净效用 V = {item.utilityScore.toFixed(1)}</Badge>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-ink-3">
                      {item.sessionId} · 开始于 {formatDateTime(item.startedAt)}
                      {item.elapsedSec !== undefined ? ` · 时长 ${item.elapsedSec}s` : ''}
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
                      variant="quiet"
                      size="sm"
                      onClick={() => void handleDeleteSession(item.sessionId)}
                      data-testid={`delete-session-${item.sessionId}`}
                      className="text-danger border-danger/30 hover:bg-danger-soft"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      销毁
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EXPORT & ACCOUNT DATA WIPE */}
      {tab === 'privacy' && (
        <div className="space-y-4">
          {/* Export My Data */}
          <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
            <div>
              <h4 className="text-[13px] font-semibold text-ink">导出我的完整数据 (Data Portability)</h4>
              <p className="text-[11px] text-ink-3">
                一键导出当前账户名下的演讲编译包、个人记忆、复盘报告、用量账本与合规审计记录。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => void handleExport('json')}
                disabled={exportingFormat !== null}
                data-testid="export-json-btn"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                {exportingFormat === 'json' ? '导出中…' : '导出 JSON Bundle'}
              </Button>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => void handleExport('markdown')}
                disabled={exportingFormat !== null}
                data-testid="export-md-btn"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                {exportingFormat === 'markdown' ? '导出中…' : '导出 Markdown 报告'}
              </Button>
            </div>

            {exportResult && (
              <div
                className="rounded border border-line bg-ground p-3 space-y-1.5"
                data-testid="export-preview"
              >
                <div className="flex items-center justify-between text-[11px] text-ink-2">
                  <span className="font-mono">{exportResult.filename}</span>
                  <span>{formatBytes(exportResult.content.length)}</span>
                </div>
                <pre className="max-h-40 overflow-y-auto text-[11px] font-mono text-ink-2 whitespace-pre-wrap break-all bg-surface p-2 rounded border border-line">
                  {exportResult.content.slice(0, 1200)}
                  {exportResult.content.length > 1200 ? '\n…（已截断预览，完整内容已下载）' : ''}
                </pre>
              </div>
            )}
          </div>

          {/* Account Wipe */}
          <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-[13px] font-semibold text-danger">
                  一键清空账户个人数据 (Right to Erasure)
                </h4>
                <p className="text-[11px] text-ink-2 leading-relaxed">
                  将永久删除当前账户的演讲会话、ContextPack、个人记忆、复盘报告与用量明细分录，并吊销历史认证令牌。依法需留存的不可逆合规审计记录（如{' '}
                  <code>billing_audit_logs</code>）将在下方销毁回执中如实披露。
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={confirmWipeChecked}
                onChange={(e) => setConfirmWipeChecked(e.target.checked)}
                data-testid="confirm-account-wipe-checkbox"
                className="rounded border-line"
              />
              <span>我确认彻底清除当前账户个人业务数据（不可恢复）</span>
            </label>

            <Button
              type="button"
              variant="quiet"
              size="sm"
              disabled={!confirmWipeChecked || wipingAccount}
              onClick={() => void handleWipeAccountData()}
              data-testid="wipe-account-data-btn"
              className="border-danger text-danger hover:bg-danger hover:text-white"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {wipingAccount ? '正在清除并生成回执…' : '销毁全部个人数据并获取回执'}
            </Button>

            {accountDeletionReceipt && (
              <div
                className="rounded-lg border border-resolved/40 bg-surface p-3.5 space-y-2 text-[12px]"
                data-testid="account-deletion-receipt"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-resolved">
                    数据销毁合规回执 (DataDeletionReceipt)
                  </span>
                  <span className="font-mono text-[11px] text-ink-3">
                    {accountDeletionReceipt.receiptId}
                  </span>
                </div>
                <p className="text-[11px] text-ink-3">
                  请求时间：{formatDateTime(accountDeletionReceipt.requestedAt)} · 完成时间：
                  {formatDateTime(accountDeletionReceipt.completedAt)}
                </p>

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-ink">已清除范围：</div>
                  <div className="flex flex-wrap gap-1.5">
                    {accountDeletionReceipt.deletedScopes.map((entry) => (
                      <Badge key={entry.scope} variant="secondary">
                        {DELETION_SCOPE_LABELS[entry.scope] ?? entry.scope}: {entry.deletedCount}
                      </Badge>
                    ))}
                  </div>
                </div>

                {accountDeletionReceipt.preservedRecords.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-ink">依法保留审计项：</div>
                    {accountDeletionReceipt.preservedRecords.map((item, idx) => (
                      <div key={idx} className="text-[11px] text-ink-2 bg-ground rounded p-2 border border-line">
                        <code>{item.category}</code>（{item.count} 条）：{item.reason}（策略：
                        {item.retentionPolicy}）
                      </div>
                    ))}
                  </div>
                )}

                {accountDeletionReceipt.thirdPartyCaveats.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-ink">第三方服务提示：</div>
                    <ul className="text-[11px] text-ink-3 list-disc list-inside space-y-0.5">
                      {accountDeletionReceipt.thirdPartyCaveats.map((c, idx) => (
                        <li key={idx}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Billing Audit Trail */}
          {billingAudit.length > 0 && (
            <div className="rounded-lg border border-line bg-surface p-3.5 space-y-2">
              <h4 className="text-[12px] font-semibold text-ink">
                合规审计留痕 (Billing Audit · {billingAudit.length} 条)
              </h4>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {billingAudit.map((rec) => (
                  <div
                    key={rec.auditId}
                    className="text-[11px] text-ink-2 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1"
                  >
                    <span>
                      <code>{rec.eventType}</code> · {rec.retentionNote}
                    </span>
                    <span className="font-mono text-ink-3">{formatDateTime(rec.occurredAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

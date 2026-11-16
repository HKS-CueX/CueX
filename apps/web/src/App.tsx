import React, { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type {
  AuthSessionResponse,
  DataDeletionReceipt,
  HealthStatusResponse,
  InterventionLevel,
  PresentationContextPack,
  PresentationMode,
  PresentationReflection,
  PresentationWeakSegment,
  ScenarioCapabilityDescriptor,
  ViewMode,
} from '@cuex/protocol';
import { X } from 'lucide-react';
import { AccountPanel } from '@/components/AccountPanel';
import { Footer } from '@/components/layout/Footer';
import { Navbar, type ViewKey } from '@/components/layout/Navbar';
import { MemoryInspectorPanel } from '@/components/MemoryInspectorPanel';
import { usePresentationSession } from '@/core/session/usePresentationSession';
import {
  compilePresentationPack,
  ensureAuthSession,
  fetchHealth,
  fetchScenarios,
  getPresentationPack,
} from '@/lib/api';
import { CompanionView } from '@/views/CompanionView';
import { CompilerView } from '@/views/CompilerView';
import { HomeView } from '@/views/HomeView';
import { ReflectionView } from '@/views/ReflectionView';
import { StageView } from '@/views/StageView';

type AppRouteView = ViewKey | 'companion';
const VALID_VIEWS: ViewKey[] = ['home', 'compiler', 'stage', 'reflection'];

function resolveInitialRoute(): { view: AppRouteView; sessionId: string | null } {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('view');
  const sessionId = params.get('sessionId');
  if (requested === 'companion') {
    return { view: 'companion', sessionId };
  }
  const safeView =
    requested && VALID_VIEWS.includes(requested as ViewKey) ? (requested as ViewKey) : 'home';
  return { view: safeView, sessionId };
}

/** 独立伴随窗外壳：只订阅主会话状态，绝不初始化主控 usePresentationSession / AudioCapture。 */
function CompanionShell({ initialSessionId }: { initialSessionId: string | null }) {
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);

  useEffect(() => {
    void fetchHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  const handleNavigateMain = useCallback((nextView: ViewKey, targetSessionId?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', nextView);
    if (targetSessionId) {
      url.searchParams.set('sessionId', targetSessionId);
    } else {
      url.searchParams.delete('sessionId');
    }
    window.location.assign(url.toString());
  }, []);

  return (
    <CompanionView
      sessionId={initialSessionId}
      health={health}
      onNavigateMain={handleNavigateMain}
    />
  );
}

export function App() {
  const [initialRoute] = useState(resolveInitialRoute);
  if (initialRoute.view === 'companion') {
    return <CompanionShell initialSessionId={initialRoute.sessionId} />;
  }
  return (
    <MainWorkspaceShell
      initialView={initialRoute.view}
      initialSessionId={initialRoute.sessionId}
    />
  );
}

function MainWorkspaceShell({
  initialView,
  initialSessionId,
}: {
  initialView: ViewKey;
  initialSessionId: string | null;
}) {
  const [view, setView] = useState<ViewKey>(initialView);

  const [authSession, setAuthSession] = useState<AuthSessionResponse | null>(null);
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioCapabilityDescriptor[]>([]);
  const [activePack, setActivePack] = useState<PresentationContextPack | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  const [completedSessionId, setCompletedSessionId] = useState<string | null>(
    initialView === 'reflection' ? initialSessionId : null
  );
  const [completedReflection, setCompletedReflection] = useState<PresentationReflection | null>(null);

  const runtime = usePresentationSession();

  // Keep latest completed session/reflection available for ReflectionView
  useEffect(() => {
    if (runtime.state.session?.status === 'ended') {
      setCompletedSessionId(runtime.state.session.sessionId);
      if (runtime.state.reflection) {
        setCompletedReflection(runtime.state.reflection);
      }
    }
  }, [runtime.state.session?.status, runtime.state.session?.sessionId, runtime.state.reflection]);

  useEffect(() => {
    void fetchHealth()
      .then(setHealth)
      .catch(() => {});

    void ensureAuthSession()
      .then((auth) => {
        setAuthSession(auth);
        return fetchScenarios();
      })
      .then(setScenarios)
      .catch(() => {
        void fetchScenarios()
          .then(setScenarios)
          .catch(() => {});
      });
  }, []);

  const navigate = useCallback((nextView: ViewKey) => {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set('view', nextView);
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleAuthChanged = useCallback(
    (nextAuth: AuthSessionResponse) => {
      const switchedUser = authSession?.user.userId !== nextAuth.user.userId;
      setAuthSession(nextAuth);
      if (switchedUser) {
        runtime.disconnect();
        setActivePack(null);
        setCompletedSessionId(null);
        setCompletedReflection(null);
      }
    },
    [authSession?.user.userId, runtime]
  );

  const handleAccountWiped = useCallback(
    (_receipt: DataDeletionReceipt, nextAuth: AuthSessionResponse) => {
      runtime.disconnect();
      setActivePack(null);
      setCompletedSessionId(null);
      setCompletedReflection(null);
      setAuthSession(nextAuth);
    },
    [runtime]
  );

  const loadSamplePack = useCallback(async (): Promise<PresentationContextPack | null> => {
    setLoadingDemo(true);
    try {
      await ensureAuthSession().then(setAuthSession).catch(() => {});
      const pack = await compilePresentationPack({
        title: 'CueX：通用实时认知外挂路演演示包',
        sceneType: 'pitch',
        goal: '在 5 分钟内讲清 CueX 最小必要干预原则、双层架构与 Presentation 闭环',
        audience: '赛事评委与投资人',
        targetDurationSec: 300,
        rawMaterials: '',
        useSamplePack: true,
      });
      setActivePack(pack);
      return pack;
    } catch {
      return null;
    } finally {
      setLoadingDemo(false);
    }
  }, []);

  const handleLoadDemoFromHome = async () => {
    const pack = await loadSamplePack();
    if (pack) {
      navigate('compiler');
    }
  };

  const handleLaunchStage = (options: {
    pack: PresentationContextPack;
    mode: PresentationMode;
    viewMode: ViewMode;
    maxLevel: InterventionLevel;
  }) => {
    setActivePack(options.pack);
    runtime.startSession({
      packId: options.pack.packId,
      contextPack: options.pack,
      mode: options.mode,
      viewMode: options.viewMode,
      maxInterventionLevel: options.maxLevel,
      silentMode: false,
      privacyNoticeAccepted: privacyAccepted,
    });
    navigate('stage');
  };

  const handleStartRehearsal = async (
    weakSegment: PresentationWeakSegment,
    packId: string
  ) => {
    let pack = activePack;
    if (!pack && packId) {
      pack = await getPresentationPack(packId).catch(() => null);
      if (pack) setActivePack(pack);
    }
    setPrivacyAccepted(true);
    runtime.startSession({
      packId: pack?.packId ?? packId,
      contextPack: pack ?? undefined,
      mode: 'rehearsal',
      viewMode: 'focus',
      maxInterventionLevel: 'L3',
      silentMode: false,
      privacyNoticeAccepted: true,
      rehearsalTarget: {
        weakSegmentId: weakSegment.weakSegmentId,
        chapterId: weakSegment.chapterId,
        promptText: weakSegment.promptText,
        targetPointLabels: weakSegment.targetPointLabels,
      },
    });
    navigate('stage');
  };

  return (
    <div className="min-h-dvh flex flex-col bg-ground text-ink font-ui antialiased">
      <Navbar
        currentView={view}
        onSelectView={navigate}
        health={health}
        authSession={authSession}
        onOpenMemory={() => setMemoryModalOpen(true)}
        onOpenAccount={() => setAccountModalOpen(true)}
        sessionActive={runtime.state.session?.status === 'active'}
      />

      <div className="flex-1">
        {view === 'home' && (
          <HomeView
            scenarios={scenarios}
            health={health}
            authSession={authSession}
            onNavigate={navigate}
            onLoadDemoPack={handleLoadDemoFromHome}
            onOpenAccount={() => setAccountModalOpen(true)}
            loadingDemo={loadingDemo}
          />
        )}

        {view === 'compiler' && (
          <CompilerView
            activePack={activePack}
            onPackChange={setActivePack}
            privacyAccepted={privacyAccepted}
            onPrivacyChange={setPrivacyAccepted}
            authReady={Boolean(authSession)}
            onLaunchStage={handleLaunchStage}
          />
        )}

        {view === 'stage' && (
          <StageView
            activePack={activePack}
            onPackChange={setActivePack}
            privacyAccepted={privacyAccepted}
            onPrivacyChange={setPrivacyAccepted}
            authReady={Boolean(authSession)}
            health={health}
            runtime={runtime}
            onLoadDemoPack={loadSamplePack}
            onGoToCompiler={() => navigate('compiler')}
            onGoToReflection={(sid) => {
              if (sid) setCompletedSessionId(sid);
              if (runtime.state.reflection) setCompletedReflection(runtime.state.reflection);
              navigate('reflection');
            }}
          />
        )}

        {view === 'reflection' && (
          <ReflectionView
            sessionId={completedSessionId ?? runtime.state.session?.sessionId ?? null}
            initialReflection={completedReflection ?? runtime.state.reflection}
            activePack={activePack}
            onStartRehearsal={(ws, pid) => void handleStartRehearsal(ws, pid)}
            onGoToCompiler={() => navigate('compiler')}
            onGoToStage={() => navigate('stage')}
            onSessionWiped={() => {
              setCompletedSessionId(null);
              setCompletedReflection(null);
              runtime.disconnect();
            }}
          />
        )}
      </div>

      <Footer onSelectView={navigate} />

      {/* Global Account, Plans, Usage & Data Sovereignty Dialog */}
      <Dialog.Root open={accountModalOpen} onOpenChange={setAccountModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-ink/40 z-50" />
          <Dialog.Content className="cuex-dialog-panel fixed left-1/2 top-1/2 w-[min(94vw,880px)] max-h-[88dvh] overflow-y-auto bg-surface border border-line-strong rounded-md p-5 sm:p-6 shadow-xl z-50 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <Dialog.Title className="text-base font-semibold text-ink">
                账户隔离、套餐用量与数据主权控制台
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="cuex-btn h-9 w-9 inline-flex items-center justify-center rounded hover:bg-ground-2 text-ink-2 active:scale-[0.97]"
                  aria-label="关闭账户控制台"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
            <AccountPanel
              authSession={authSession}
              onAuthChanged={handleAuthChanged}
              onAccountWiped={handleAccountWiped}
              onInspectSession={(sid) => {
                setCompletedSessionId(sid);
                setCompletedReflection(null);
                navigate('reflection');
              }}
              onClose={() => setAccountModalOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Global Opt-in Memory Governance Drawer/Dialog */}
      <Dialog.Root open={memoryModalOpen} onOpenChange={setMemoryModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-ink/40 z-50" />
          <Dialog.Content className="cuex-dialog-panel fixed left-1/2 top-1/2 w-[min(92vw,740px)] max-h-[86dvh] overflow-y-auto bg-surface border border-line-strong rounded-md p-5 sm:p-6 shadow-xl z-50 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <Dialog.Title className="text-base font-semibold text-ink">
                个人记忆治理与隐私检查
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="cuex-btn h-9 w-9 inline-flex items-center justify-center rounded hover:bg-ground-2 text-ink-2 active:scale-[0.97]"
                  aria-label="关闭记忆治理弹窗"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
            <MemoryInspectorPanel />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default App;

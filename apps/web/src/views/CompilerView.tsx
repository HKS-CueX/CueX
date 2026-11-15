import React, { useEffect, useRef, useState } from 'react';
import type {
  InterventionLevel,
  PresentationContextPack,
  PresentationExtractResult,
  PresentationFactItem,
  PresentationMode,
  PresentationPackSummary,
  PresentationQACard,
  PresentationSceneType,
  ViewMode,
} from '@cuex/protocol';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Edit3,
  FileText,
  HelpCircle,
  ListChecks,
  Lock,
  Mic,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  compilePresentationPack,
  extractPresentationDoc,
  getPresentationPack,
  listPresentationPacks,
  patchPresentationPack,
} from '@/lib/api';
import { formatApiError, formatDuration, SCENE_TYPE_LABELS } from '@/lib/format';
import { validatePresentationUploadFile } from '@/lib/validation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface CompilerViewProps {
  activePack: PresentationContextPack | null;
  onPackChange: (pack: PresentationContextPack) => void;
  privacyAccepted: boolean;
  onPrivacyChange: (accepted: boolean) => void;
  onLaunchStage: (options: {
    pack: PresentationContextPack;
    mode: PresentationMode;
    viewMode: ViewMode;
    maxLevel: InterventionLevel;
  }) => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export const CompilerView: React.FC<CompilerViewProps> = ({
  activePack,
  onPackChange,
  privacyAccepted,
  onPrivacyChange,
  onLaunchStage,
}) => {
  const [savedPacks, setSavedPacks] = useState<PresentationPackSummary[]>([]);
  const [title, setTitle] = useState(activePack?.title ?? '');
  const [sceneType, setSceneType] = useState<PresentationSceneType>(
    activePack?.sceneType ?? 'pitch'
  );
  const [goal, setGoal] = useState(activePack?.goal ?? '');
  const [audience, setAudience] = useState(activePack?.audience ?? '');
  const [targetDurationSec, setTargetDurationSec] = useState<number>(
    activePack?.targetDurationSec ?? 300
  );
  const [rawMaterials, setRawMaterials] = useState('');
  const [keyFactsText, setKeyFactsText] = useState('');
  const [forbiddenText, setForbiddenText] = useState(
    activePack?.forbiddenClaims.join('\n') ?? ''
  );

  const [extractInfo, setExtractInfo] = useState<PresentationExtractResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [savingPatch, setSavingPatch] = useState(false);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canRetryCompile, setCanRetryCompile] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const extractAbortRef = useRef<AbortController | null>(null);
  const compileAbortRef = useRef<AbortController | null>(null);

  // Editable FactWhitelist & CueSheet states
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editingFactText, setEditingFactText] = useState('');
  const [newFactText, setNewFactText] = useState('');
  const [newFactSource, setNewFactSource] = useState('演讲者手动确认');
  const [newFactCategory, setNewFactCategory] =
    useState<PresentationFactItem['category']>('metric');

  const [launchViewMode, setLaunchViewMode] = useState<ViewMode>('focus');
  const [launchMaxLevel, setLaunchMaxLevel] = useState<InterventionLevel>('L3');

  useEffect(() => {
    void listPresentationPacks()
      .then((packs) => setSavedPacks(packs))
      .catch(() => {
        // Ignore silent failure on initial pack list fetch
      });
  }, [activePack?.packId]);

  // Sync form fields when activePack updates externally (e.g. demo pack load)
  useEffect(() => {
    if (!activePack) return;
    setTitle(activePack.title);
    setSceneType(activePack.sceneType);
    setGoal(activePack.goal);
    setAudience(activePack.audience);
    setTargetDurationSec(activePack.targetDurationSec);
    setForbiddenText(activePack.forbiddenClaims.join('\n'));
    if (activePack.facts.length > 0 && !keyFactsText) {
      setKeyFactsText(activePack.facts.map((f) => f.text).join('\n'));
    }
  }, [activePack?.packId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validatePresentationUploadFile({ name: file.name, size: file.size });
    if (!validation.ok) {
      setFileValidationError(validation.message);
      setError(validation.message);
      setStatusMessage(null);
      event.target.value = '';
      return;
    }

    extractAbortRef.current?.abort();
    const controller = new AbortController();
    extractAbortRef.current = controller;

    setExtracting(true);
    setFileValidationError(null);
    setError(null);
    setCanRetryCompile(false);
    setStatusMessage(null);
    try {
      const lower = file.name.toLowerCase();
      let result: PresentationExtractResult;
      if (lower.endsWith('.md') || lower.endsWith('.txt')) {
        const textContent = await file.text();
        result = await extractPresentationDoc(
          {
            filename: file.name,
            mimeType: file.type,
            textContent,
          },
          { signal: controller.signal }
        );
      } else {
        const buffer = await file.arrayBuffer();
        result = await extractPresentationDoc(
          {
            filename: file.name,
            mimeType: file.type,
            contentBase64: arrayBufferToBase64(buffer),
          },
          { signal: controller.signal }
        );
      }
      setExtractInfo(result);
      if (result.extractedText.trim()) {
        setRawMaterials((prev) =>
          prev.trim()
            ? `${prev.trim()}\n\n--- ${file.name} ---\n${result.extractedText}`
            : result.extractedText
        );
        if (!title.trim()) {
          setTitle(file.name.replace(/\.(pptx|pdf|md|txt)$/i, ''));
        }
      }
      if (result.status === 'rejected') {
        setStatusMessage(null);
        setError(result.warnings[0] || `文档 ${file.name} 未能通过格式或内容校验 (rejected)。`);
      } else if (result.status === 'unreadable' || result.unreadable) {
        setStatusMessage(
          `已读取 ${file.name}，但状态为 ${result.status}，请查看警告并补充文本。`
        );
      } else {
        setStatusMessage(
          `已成功解析 ${file.name}（${result.characterCount} 字符，${result.sections.length} 个片段）。`
        );
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setStatusMessage('已取消文档提取。');
      } else {
        setError(formatApiError(err));
      }
    } finally {
      if (extractAbortRef.current === controller) {
        extractAbortRef.current = null;
      }
      setExtracting(false);
      event.target.value = '';
    }
  };

  const handleCancelExtract = () => {
    extractAbortRef.current?.abort();
  };

  const handleLoadSamplePack = async () => {
    setCompiling(true);
    setError(null);
    setStatusMessage(null);
    try {
      const pack = await compilePresentationPack({
        title: 'CueX：通用实时认知外挂路演演示包',
        sceneType: 'pitch',
        goal: '在 5 分钟路演内讲清 CueX 的最小必要干预原则、双层架构与 CueX Presentation 首场景闭环',
        audience: '赛事评委与早期技术投资人',
        targetDurationSec: 300,
        rawMaterials: '',
        useSamplePack: true,
      });
      onPackChange(pack);
      setKeyFactsText(pack.facts.map((f) => f.text).join('\n'));
      setRawMaterials(
        pack.cueSheet.chapters
          .map((c) => `## ${c.title}\n${c.coreMessage}\n过渡句：${c.transitionCue}`)
          .join('\n\n')
      );
      setStatusMessage('已载入内置示例：CueX 路演演示包（包含真实事实白名单与预测问答）。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '载入示例演示包失败');
    } finally {
      setCompiling(false);
    }
  };

  const handleSelectSavedPack = async (packId: string) => {
    if (!packId) return;
    setCompiling(true);
    setError(null);
    try {
      const pack = await getPresentationPack(packId);
      onPackChange(pack);
      setKeyFactsText(pack.facts.map((f) => f.text).join('\n'));
      setStatusMessage(`已加载已保存演讲包：${pack.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载演讲包失败');
    } finally {
      setCompiling(false);
    }
  };

  const runCompile = async () => {
    if (!title.trim()) {
      setError('请填写演讲主题。');
      return;
    }
    compileAbortRef.current?.abort();
    const controller = new AbortController();
    compileAbortRef.current = controller;

    setCompiling(true);
    setError(null);
    setCanRetryCompile(false);
    setStatusMessage(null);
    try {
      const keyFactsInput = keyFactsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const forbiddenClaims = forbiddenText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const pack = await compilePresentationPack(
        {
          packId: activePack?.packId,
          title: title.trim(),
          sceneType,
          goal: goal.trim() || `清晰完成「${title.trim()}」核心表达与现场问答`,
          audience: audience.trim() || '现场听众与评审',
          targetDurationSec: Math.max(60, Number(targetDurationSec) || 300),
          rawMaterials: rawMaterials.trim() || keyFactsInput.join('\n'),
          sourceFilenames: extractInfo ? [extractInfo.filename] : undefined,
          keyFactsInput,
          forbiddenClaims,
        },
        { signal: controller.signal }
      );
      onPackChange(pack);
      setStatusMessage('ContextPack 编译完成！请校准右侧事实白名单后即可进入场中协同。');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setStatusMessage('已取消本次 ContextPack 编译。');
      } else {
        setCanRetryCompile(true);
        setError(formatApiError(err));
      }
    } finally {
      if (compileAbortRef.current === controller) {
        compileAbortRef.current = null;
      }
      setCompiling(false);
    }
  };

  const handleCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    await runCompile();
  };

  const handleCancelCompile = () => {
    compileAbortRef.current?.abort();
  };

  const persistPatch = async (updated: Partial<PresentationContextPack>) => {
    if (!activePack) return;
    setSavingPatch(true);
    setError(null);
    try {
      const saved = await patchPresentationPack(activePack.packId, {
        title: updated.title ?? activePack.title,
        goal: updated.goal ?? activePack.goal,
        audience: updated.audience ?? activePack.audience,
        targetDurationSec: updated.targetDurationSec ?? activePack.targetDurationSec,
        cueSheet: updated.cueSheet ?? activePack.cueSheet,
        facts: updated.facts ?? activePack.facts,
        qaCards: updated.qaCards ?? activePack.qaCards,
        forbiddenClaims: updated.forbiddenClaims ?? activePack.forbiddenClaims,
      });
      onPackChange(saved);
      setStatusMessage('已同步保存至 ContextPack。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存更新失败');
    } finally {
      setSavingPatch(false);
    }
  };

  const toggleFactConfirm = (factId: string) => {
    if (!activePack) return;
    const nextFacts = activePack.facts.map((f) =>
      f.id === factId ? { ...f, userConfirmed: !f.userConfirmed, verified: !f.userConfirmed } : f
    );
    void persistPatch({ facts: nextFacts });
  };

  const toggleFactLock = (factId: string) => {
    if (!activePack) return;
    const nextFacts = activePack.facts.map((f) =>
      f.id === factId ? { ...f, locked: !f.locked } : f
    );
    void persistPatch({ facts: nextFacts });
  };

  const deleteFact = (factId: string) => {
    if (!activePack) return;
    const target = activePack.facts.find((f) => f.id === factId);
    if (target?.locked) {
      setError('该条事实已锁定，请先解锁后再删除。');
      return;
    }
    const nextFacts = activePack.facts.filter((f) => f.id !== factId);
    void persistPatch({ facts: nextFacts });
  };

  const saveFactEdit = (factId: string) => {
    if (!activePack || !editingFactText.trim()) return;
    const target = activePack.facts.find((f) => f.id === factId);
    if (target?.locked) {
      setError('该条事实已锁定，请先解锁后再编辑。');
      setEditingFactId(null);
      return;
    }
    const nextFacts = activePack.facts.map((f) =>
      f.id === factId
        ? { ...f, text: editingFactText.trim(), userConfirmed: true, verified: true }
        : f
    );
    setEditingFactId(null);
    void persistPatch({ facts: nextFacts });
  };

  const addCustomFact = () => {
    if (!activePack || !newFactText.trim()) return;
    const id = `fact-manual-${Date.now()}`;
    const newItem: PresentationFactItem = {
      id,
      text: newFactText.trim(),
      category: newFactCategory,
      source: newFactSource.trim() || '演讲者手动确认',
      userConfirmed: true,
      locked: true,
      verified: true,
      evidenceId: `ev-${id}`,
    };
    setNewFactText('');
    void persistPatch({ facts: [...activePack.facts, newItem] });
  };

  const updateQACard = (qaId: string, patch: Partial<PresentationQACard>) => {
    if (!activePack) return;
    const nextCards = activePack.qaCards.map((q) => (q.id === qaId ? { ...q, ...patch } : q));
    void persistPatch({ qaCards: nextCards });
  };

  return (
    <div className="bg-ground text-ink min-h-[calc(100vh-3.5rem)]">
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Page Header */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-line pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink-3">
              <span className="text-amber font-semibold">STAGE 01</span>
              <span>/</span>
              <span>PRE-SESSION CONTEXT COMPILER</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              场前编译 · 构建你的演讲上下文与事实白名单
            </h1>
            <p className="text-xs sm:text-sm text-ink-2 max-w-3xl">
              上传讲稿或 PPT，提取并锁定真实数据与边界。场中一切提示严格受限于已确认的{' '}
              <span className="font-mono text-ink font-medium">FactWhitelist</span>，绝不现场臆造。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {savedPacks.length > 0 && (
              <select
                aria-label="切换已编译演讲包"
                value={activePack?.packId ?? ''}
                onChange={(e) => void handleSelectSavedPack(e.target.value)}
                className="h-9 px-3 text-xs border border-line bg-surface rounded text-ink"
                data-testid="saved-packs-select"
              >
                <option value="" disabled>
                  选择已有演讲包...
                </option>
                {savedPacks.map((p) => (
                  <option key={p.packId} value={p.packId}>
                    {p.title} ({p.factCount} 事实 · {formatDuration(p.targetDurationSec)})
                  </option>
                ))}
              </select>
            )}

            <Button
              type="button"
              variant="amber"
              size="sm"
              onClick={() => void handleLoadSamplePack()}
              disabled={compiling}
              data-testid="load-sample-pack-btn"
              className="gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>载入示例：CueX 路演演示包</span>
            </Button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 border border-amber/40 bg-amber-tint text-amber-ink px-4 py-2.5 rounded text-xs"
            data-testid="compiler-error"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
            {canRetryCompile && !compiling && (
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => void runCompile()}
                data-testid="retry-compile-btn"
                className="h-7 text-[11px]"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                重试编译
              </Button>
            )}
          </div>
        )}

        {statusMessage && (
          <div
            role="status"
            className="flex items-center gap-2 border border-resolved/30 bg-resolved-tint text-resolved px-4 py-2.5 rounded text-xs"
            data-testid="compiler-status"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Main 2-Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Material Ingestion & Compile Form */}
          <section className="lg:col-span-5 border border-line bg-surface rounded-md p-5 space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber" />
                <span>1. 材料导入与参数设定</span>
              </h2>
              <span className="text-[11px] font-mono text-ink-3">.pptx / .pdf / .md / .txt</span>
            </div>

            <div className="space-y-2">
              <label
                className={cn(
                  'block border border-dashed border-line-strong rounded p-4 bg-ground/60 hover:bg-ground-2/60 transition-colors cursor-pointer text-center space-y-1.5',
                  extracting && 'opacity-60 pointer-events-none'
                )}
              >
                <input
                  type="file"
                  accept=".pptx,.pdf,.md,.txt,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  onChange={(e) => void handleFileUpload(e)}
                  className="sr-only"
                  data-testid="file-upload-input"
                />
                <FileText className="w-5 h-5 text-ink-2 mx-auto" />
                <div className="text-xs font-medium text-ink">
                  {extracting ? '正在提取文档正文与演讲备注...' : '点击上传讲稿 / PPTX / PDF / Markdown'}
                </div>
                <div className="text-[11px] text-ink-3">
                  支持 .pptx / .pdf / .md / .txt（单文件上限 15 MB）；扫描版 PDF 将诚实提示无法提取。
                </div>
              </label>

              {extracting && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={handleCancelExtract}
                    data-testid="cancel-extract-btn"
                    className="h-7 text-[11px]"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    取消提取
                  </Button>
                </div>
              )}

              {fileValidationError && (
                <div
                  role="alert"
                  className="border border-danger/35 bg-danger-soft text-danger rounded px-3 py-2 text-[11px] flex items-start gap-2"
                  data-testid="file-validation-error"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{fileValidationError}</span>
                </div>
              )}
            </div>

            {extractInfo && (
              <div
                className={cn(
                  'border rounded p-3 space-y-2 text-xs',
                  extractInfo.status === 'rejected'
                    ? 'border-danger/40 bg-danger-soft/50'
                    : extractInfo.status === 'unreadable' || extractInfo.unreadable
                      ? 'border-amber/45 bg-amber-soft/50'
                      : 'border-line bg-ground'
                )}
                data-testid="extract-result"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink truncate">{extractInfo.filename}</span>
                  <Badge
                    variant={
                      extractInfo.status === 'rejected'
                        ? 'amber'
                        : extractInfo.unreadable
                          ? 'amber'
                          : 'resolved'
                    }
                  >
                    {extractInfo.fileType.toUpperCase()} · {extractInfo.status} ·{' '}
                    {extractInfo.characterCount} 字符
                  </Badge>
                </div>
                {(extractInfo.sourceDocumentId || extractInfo.contentHash) && (
                  <div className="text-[10px] font-mono text-ink-3 flex flex-wrap gap-3">
                    {extractInfo.sourceDocumentId && <span>doc: {extractInfo.sourceDocumentId}</span>}
                    {extractInfo.contentHash && (
                      <span>sha256: {extractInfo.contentHash.slice(0, 12)}…</span>
                    )}
                  </div>
                )}
                {(extractInfo.status === 'unreadable' ||
                  extractInfo.status === 'rejected' ||
                  extractInfo.unreadable) && (
                  <div
                    className="rounded border border-amber/40 bg-surface px-2.5 py-2 text-[11px] text-amber-ink space-y-0.5"
                    data-testid="extract-status-warning"
                  >
                    <strong className="block font-semibold">
                      {extractInfo.status === 'rejected'
                        ? '文档未通过校验 (rejected)'
                        : '文档不可自动解析或为扫描版 (unreadable)'}
                    </strong>
                    <span>
                      CueX 不会伪造文档正文。请直接粘贴文字讲稿、Markdown 大纲或关键事实后继续编译。
                    </span>
                  </div>
                )}
                {extractInfo.warnings.length > 0 && (
                  <ul className="text-[11px] text-amber-ink space-y-0.5 list-disc pl-4">
                    {extractInfo.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <form onSubmit={handleCompile} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label htmlFor="compile-title" className="font-medium text-ink block">
                  演讲主题 <span className="text-amber">*</span>
                </label>
                <input
                  id="compile-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：CueX 通用实时认知协同系统路演"
                  className="w-full border border-line bg-ground/50 rounded px-3 py-2 text-ink"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="compile-scene" className="font-medium text-ink block">
                    场景类型
                  </label>
                  <select
                    id="compile-scene"
                    value={sceneType}
                    onChange={(e) => setSceneType(e.target.value as PresentationSceneType)}
                    className="w-full border border-line bg-ground/50 rounded px-3 py-2 text-ink"
                  >
                    {(Object.keys(SCENE_TYPE_LABELS) as PresentationSceneType[]).map((key) => (
                      <option key={key} value={key}>
                        {SCENE_TYPE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="compile-duration" className="font-medium text-ink block">
                    目标时长（秒）
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="compile-duration"
                      type="number"
                      min={60}
                      max={7200}
                      step={30}
                      value={targetDurationSec}
                      onChange={(e) => setTargetDurationSec(Number(e.target.value))}
                      className="w-full border border-line bg-ground/50 rounded px-3 py-2 text-ink font-mono"
                    />
                    <span className="text-[11px] font-mono text-ink-3 shrink-0">
                      {formatDuration(targetDurationSec)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="compile-audience" className="font-medium text-ink block">
                    受众 / 评审身份
                  </label>
                  <input
                    id="compile-audience"
                    type="text"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="例如：评委、导师或客户决策层"
                    className="w-full border border-line bg-ground/50 rounded px-3 py-2 text-ink"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="compile-goal" className="font-medium text-ink block">
                    核心沟通目标
                  </label>
                  <input
                    id="compile-goal"
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="例如：讲清技术壁垒与真实商业边界"
                    className="w-full border border-line bg-ground/50 rounded px-3 py-2 text-ink"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="compile-materials" className="font-medium text-ink block">
                  演讲材料 / 逐字稿 / 章节大纲
                </label>
                <textarea
                  id="compile-materials"
                  rows={6}
                  value={rawMaterials}
                  onChange={(e) => setRawMaterials(e.target.value)}
                  placeholder="粘贴 PPT 大纲、逐字稿或演讲备注（支持 Markdown 章节格式 ## 章节名）..."
                  className="w-full border border-line bg-ground/50 rounded px-3 py-2 text-ink leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="compile-facts" className="font-medium text-ink block">
                  核心确认事实清单（每行一条，直接进入白名单候选）
                </label>
                <textarea
                  id="compile-facts"
                  rows={3}
                  value={keyFactsText}
                  onChange={(e) => setKeyFactsText(e.target.value)}
                  placeholder="例如：&#10;System 1 平均判定延迟 < 50ms&#10;净有效介入评分公式 V = H - λI（默认 λ = 2）"
                  className="w-full border border-line bg-ground/50 rounded px-3 py-2 text-ink"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="compile-forbidden" className="font-medium text-ink block">
                  严禁编造 / 越界表达红线（每行一条）
                </label>
                <textarea
                  id="compile-forbidden"
                  rows={2}
                  value={forbiddenText}
                  onChange={(e) => setForbiddenText(e.target.value)}
                  placeholder="例如：不得宣称尚未开展的付费转化率、不得把路线图场景说成已实机上线"
                  className="w-full border border-line bg-ground/50 rounded px-3 py-2 text-ink"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={compiling}
                  className="flex-1"
                  data-testid="compile-submit-btn"
                >
                  {compiling ? '正在编译 ContextPack...' : '编译演讲上下文包 (Compile ContextPack)'}
                </Button>
                {compiling && (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={handleCancelCompile}
                    data-testid="cancel-compile-btn"
                  >
                    取消
                  </Button>
                )}
              </div>
            </form>
          </section>

          {/* Right: 4-Part Compiled Artifacts & Launch Gate */}
          <section className="lg:col-span-7 space-y-5">
            {!activePack ? (
              <div className="border border-dashed border-line-strong bg-surface/60 rounded-md p-10 text-center space-y-4">
                <BookOpen className="w-8 h-8 text-amber mx-auto" />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-ink">尚未编译演讲上下文包</h2>
                  <p className="text-xs text-ink-2 max-w-md mx-auto leading-relaxed">
                    请在左侧上传文档/填写讲稿后点击编译，或直接点击上方「载入示例：CueX 路演演示包」立即预览完整编译成果。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="amber"
                  onClick={() => void handleLoadSamplePack()}
                  disabled={compiling}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>一键载入 CueX 路演演示包</span>
                </Button>
              </div>
            ) : (
              <>
                <div
                  className="border border-line bg-surface rounded-md p-5 space-y-4 shadow-sm"
                  data-testid="compiled-pack-panel"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-ink">{activePack.title}</h2>
                        <Badge variant="amber">
                          {SCENE_TYPE_LABELS[activePack.sceneType] ?? activePack.sceneType}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {activePack.compiledBy === 'llm_compiler'
                            ? 'LLM 辅助编译'
                            : '本地确定性编译器'}
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-3 mt-0.5">
                        受众：{activePack.audience} · 目标时长：{formatDuration(activePack.targetDurationSec)} ·{' '}
                        {activePack.facts.filter((f) => f.userConfirmed).length}/{activePack.facts.length}{' '}
                        条事实已确认
                      </p>
                    </div>
                    {savingPatch && (
                      <span className="text-[11px] font-mono text-ink-3">正在保存修改...</span>
                    )}
                  </div>

                  {activePack.warnings.length > 0 && (
                    <div className="border border-amber/30 bg-amber-tint/60 rounded p-3 text-xs text-amber-ink space-y-1">
                      {activePack.warnings.map((w, i) => (
                        <div key={i}>· {w}</div>
                      ))}
                    </div>
                  )}

                  <Tabs defaultValue="cuesheet" className="w-full">
                    <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 h-auto gap-1">
                      <TabsTrigger value="cuesheet" data-testid="tab-cuesheet" className="text-xs">
                        A. 一页式导播单
                      </TabsTrigger>
                      <TabsTrigger value="facts" data-testid="tab-facts" className="text-xs">
                        B. 事实白名单 ({activePack.facts.length})
                      </TabsTrigger>
                      <TabsTrigger value="qa" data-testid="tab-qa" className="text-xs">
                        C. 预测问答 ({activePack.qaCards.length})
                      </TabsTrigger>
                      <TabsTrigger value="structure" data-testid="tab-structure" className="text-xs">
                        D. 进度结构 ({activePack.progressNodes.length})
                      </TabsTrigger>
                    </TabsList>

                    {/* A. One-Page CueSheet */}
                    <TabsContent value="cuesheet" className="space-y-4 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-ground rounded border border-line space-y-1">
                          <span className="text-[11px] font-semibold text-ink-3 block">
                            一句话核心论点 (One-Line Thesis)
                          </span>
                          <textarea
                            rows={2}
                            value={activePack.cueSheet.oneLineThesis}
                            onChange={(e) =>
                              onPackChange({
                                ...activePack,
                                cueSheet: { ...activePack.cueSheet, oneLineThesis: e.target.value },
                              })
                            }
                            className="w-full bg-surface border border-line rounded px-2.5 py-1.5 text-ink"
                          />
                        </div>
                        <div className="p-3 bg-ground rounded border border-line space-y-1">
                          <span className="text-[11px] font-semibold text-ink-3 block">
                            开场钩子 (Audience Hook)
                          </span>
                          <textarea
                            rows={2}
                            value={activePack.cueSheet.audienceHook}
                            onChange={(e) =>
                              onPackChange({
                                ...activePack,
                                cueSheet: { ...activePack.cueSheet, audienceHook: e.target.value },
                              })
                            }
                            className="w-full bg-surface border border-line rounded px-2.5 py-1.5 text-ink"
                          />
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink">章节导播要点</span>
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            onClick={() => void persistPatch({ cueSheet: activePack.cueSheet })}
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>保存导播单</span>
                          </Button>
                        </div>

                        {activePack.cueSheet.chapters.map((ch, idx) => (
                          <div
                            key={ch.chapterId}
                            className="border border-line bg-ground/60 rounded p-3 space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-ink">
                                0{idx + 1}. {ch.title}
                              </span>
                              <span className="font-mono text-[11px] text-ink-3">
                                预算 {formatDuration(ch.targetDurationSec)}
                              </span>
                            </div>
                            <p className="text-ink-2 leading-relaxed">{ch.coreMessage}</p>
                            <p className="text-[11px] text-violet-ink bg-violet-tint/60 px-2.5 py-1 rounded">
                              过渡衔接：{ch.transitionCue}
                            </p>
                          </div>
                        ))}
                      </div>

                      {activePack.forbiddenClaims.length > 0 && (
                        <div className="border border-amber/30 bg-amber-tint/50 rounded p-3 text-xs space-y-1">
                          <span className="font-semibold text-amber-ink flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            禁止编造 / 越界清单
                          </span>
                          <ul className="list-disc pl-4 text-amber-ink space-y-0.5">
                            {activePack.forbiddenClaims.map((c, idx) => (
                              <li key={idx}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </TabsContent>

                    {/* B. FactWhitelist */}
                    <TabsContent value="facts" className="space-y-4 pt-3" data-testid="fact-whitelist">
                      <div className="flex items-center justify-between text-xs bg-ground border border-line rounded px-3 py-2">
                        <span className="text-ink-2">
                          仅<strong>「已确认」</strong>的事实允许被场中 InterventionController 用于生成 L2/L3 提示；锁定后可防误删。
                        </span>
                      </div>

                      <div className="space-y-2">
                        {activePack.facts.map((fact) => {
                          const isEditing = editingFactId === fact.id;
                          const matchedEvidence = activePack.evidence.find(
                            (ev) => ev.id === fact.evidenceId
                          );
                          return (
                            <div
                              key={fact.id}
                              data-testid={`fact-item-${fact.id}`}
                              data-locked={fact.locked}
                              data-confirmed={fact.userConfirmed}
                              className={cn(
                                'border rounded p-3 text-xs space-y-2 transition-colors',
                                fact.userConfirmed
                                  ? 'border-line bg-surface'
                                  : 'border-amber/35 bg-amber-tint/30'
                              )}
                            >
                              {isEditing ? (
                                <div className="space-y-2">
                                  <textarea
                                    rows={2}
                                    value={editingFactText}
                                    onChange={(e) => setEditingFactText(e.target.value)}
                                    className="w-full border border-line bg-ground rounded px-2.5 py-1.5 text-ink"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingFactId(null)}
                                    >
                                      取消
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => saveFactEdit(fact.id)}
                                    >
                                      保存并确认
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Badge variant={fact.userConfirmed ? 'resolved' : 'amber'}>
                                        {fact.userConfirmed ? '已确认事实' : '待用户确认'}
                                      </Badge>
                                      <Badge variant="secondary">{fact.category}</Badge>
                                      {fact.locked && (
                                        <Badge variant="violet">
                                          <Lock className="w-2.5 h-2.5" />
                                          已锁定
                                        </Badge>
                                      )}
                                      <span className="text-[10px] font-mono text-ink-3">
                                        {fact.evidenceId}
                                      </span>
                                    </div>
                                    <p className="text-ink font-medium leading-relaxed break-words">
                                      {fact.text}
                                    </p>
                                    <div
                                      className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3"
                                      data-testid={`fact-provenance-${fact.id}`}
                                    >
                                      <span>来源：{fact.source}</span>
                                      {matchedEvidence?.locationRef && (
                                        <span className="font-mono px-1.5 py-0.5 rounded bg-ground border border-line text-[10px]">
                                          位置：{matchedEvidence.locationRef}
                                        </span>
                                      )}
                                      {matchedEvidence?.contentHash && (
                                        <span className="font-mono px-1.5 py-0.5 rounded bg-ground border border-line text-[10px]">
                                          摘要：{matchedEvidence.contentHash.slice(0, 10)}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      size="sm"
                                      onClick={() => toggleFactConfirm(fact.id)}
                                      data-testid={`fact-confirm-${fact.id}`}
                                      className="h-7 px-2 text-[11px]"
                                    >
                                      {fact.userConfirmed ? '取消确认' : '确认'}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => toggleFactLock(fact.id)}
                                      data-testid={`fact-lock-${fact.id}`}
                                      aria-label={fact.locked ? '解锁事实' : '锁定事实'}
                                      title={fact.locked ? '点击解锁' : '点击锁定'}
                                    >
                                      {fact.locked ? (
                                        <Lock className="w-3.5 h-3.5 text-violet" />
                                      ) : (
                                        <Unlock className="w-3.5 h-3.5 text-ink-3" />
                                      )}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      disabled={fact.locked}
                                      onClick={() => {
                                        if (fact.locked) return;
                                        setEditingFactId(fact.id);
                                        setEditingFactText(fact.text);
                                      }}
                                      data-testid={`fact-edit-${fact.id}`}
                                      aria-label="编辑事实"
                                      title={fact.locked ? '已锁定，请先解锁后再编辑' : '编辑事实'}
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-ink-2" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => deleteFact(fact.id)}
                                      disabled={fact.locked}
                                      data-testid={`fact-delete-${fact.id}`}
                                      aria-label="删除事实"
                                      title={fact.locked ? '已锁定，请先解锁后再删除' : '删除事实'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-amber-ink" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Add New Verified Fact */}
                      <div className="border border-line bg-ground/70 rounded p-3 space-y-2 text-xs">
                        <span className="font-semibold text-ink block">新增白名单确认事实</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={newFactText}
                            onChange={(e) => setNewFactText(e.target.value)}
                            placeholder="输入可核验的数据或边界声明..."
                            className="sm:col-span-2 border border-line bg-surface rounded px-2.5 py-1.5 text-ink"
                            data-testid="new-fact-input"
                          />
                          <select
                            value={newFactCategory}
                            onChange={(e) =>
                              setNewFactCategory(e.target.value as PresentationFactItem['category'])
                            }
                            className="border border-line bg-surface rounded px-2 py-1.5 text-ink"
                          >
                            <option value="metric">量化指标</option>
                            <option value="claim">核心论点</option>
                            <option value="boundary">边界约束</option>
                            <option value="milestone">里程碑</option>
                            <option value="definition">概念定义</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={newFactSource}
                            onChange={(e) => setNewFactSource(e.target.value)}
                            placeholder="出处说明（如：P6 评测表）"
                            className="flex-1 border border-line bg-surface rounded px-2.5 py-1.5 text-ink"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={addCustomFact}
                            disabled={!newFactText.trim()}
                            data-testid="add-fact-btn"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>添加并锁定</span>
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    {/* C. Predicted Q&A Cards & Unprepared Gaps */}
                    <TabsContent value="qa" className="space-y-4 pt-3" data-testid="qa-cards-panel">
                      <div className="flex items-start gap-2 border border-violet/35 bg-violet-tint/60 rounded p-3 text-xs text-violet-ink">
                        <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold">
                            AI 预测问题 · 非已确认事实
                          </strong>
                          <p className="text-[11px] mt-0.5 opacity-90">
                            以下问答卡基于材料语义推演可能出现的评审/观众追问，仅作彩排与兜底参考；实际回答依据仍严格绑定所关联的 evidenceIds。
                          </p>
                        </div>
                      </div>

                      {activePack.unpreparedGaps.length > 0 && (
                        <div
                          className="border border-amber/35 bg-amber-tint/60 rounded p-3 text-xs space-y-1"
                          data-testid="unprepared-gaps"
                        >
                          <span className="font-semibold text-amber-ink block">
                            尚未准备事项（建议场前补充到事实白名单）
                          </span>
                          <ul className="list-disc pl-4 text-amber-ink space-y-0.5">
                            {activePack.unpreparedGaps.map((gap, i) => (
                              <li key={i}>{gap}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="space-y-3">
                        {activePack.qaCards.map((qa) => (
                          <div
                            key={qa.id}
                            className="border border-line bg-ground/60 rounded p-3.5 space-y-2 text-xs"
                            data-testid={`qa-card-${qa.id}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="violet">AI 预测问题 · 非已确认事实</Badge>
                                <Badge variant={qa.prepared ? 'resolved' : 'amber'}>
                                  {qa.prepared ? '有事实支撑' : '尚无完整实证'}
                                </Badge>
                              </div>
                              <span className="text-[10px] font-mono text-ink-3">
                                依据数：{qa.evidenceIds.length}
                              </span>
                            </div>

                            <h3 className="text-sm font-semibold text-ink">{qa.question}</h3>
                            <p className="text-[11px] text-ink-3">提问动机：{qa.rationale}</p>

                            <div className="space-y-1">
                              <span className="text-[11px] font-medium text-ink-2 block">
                                建议回应口径（可修改）：
                              </span>
                              <textarea
                                rows={2}
                                value={qa.suggestedAnswer}
                                onChange={(e) =>
                                  updateQACard(qa.id, { suggestedAnswer: e.target.value })
                                }
                                className="w-full border border-line bg-surface rounded px-2.5 py-1.5 text-ink"
                              />
                            </div>

                            {qa.gapNote && (
                              <p className="text-[11px] text-amber-ink">缺口提示：{qa.gapNote}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* D. Progress Structure */}
                    <TabsContent value="structure" className="space-y-3 pt-3" data-testid="progress-structure">
                      {activePack.progressNodes.map((node) => (
                        <div
                          key={node.chapterId}
                          className="border border-line bg-ground/60 rounded p-3.5 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-ink flex items-center gap-2">
                              <ListChecks className="w-4 h-4 text-amber" />
                              第 {node.order + 1} 章 · {node.title}
                            </span>
                            <span className="font-mono text-[11px] text-ink-3">
                              目标 {formatDuration(node.targetDurationSec)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {node.keyPoints.map((kp) => (
                              <span
                                key={kp.id}
                                className="px-2 py-0.5 rounded border border-line bg-surface text-ink-2 text-[11px]"
                              >
                                {kp.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Microphone & Privacy Notice + Launch Gate */}
                <div
                  className="border-2 border-ink bg-surface rounded-md p-5 space-y-4 shadow-sm"
                  data-testid="launch-gate"
                >
                  <div className="flex items-start gap-3 bg-ground border border-line rounded p-3.5 text-xs">
                    <Mic className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                    <div className="space-y-1.5 flex-1">
                      <strong className="font-semibold text-ink block">
                        麦克风采集与隐私告知（进入场中前需显式确认）
                      </strong>
                      <p className="text-ink-2 leading-relaxed">
                        CueX 场中协同可使用浏览器麦克风（16kHz PCM16LE 流式传输至本地 ASR 或浏览器 Web Speech API），或使用显式标注的文本仿真测试。
                        音频流仅用于当场转写与实时决策，不作背景静默留存；场后个人记忆仅在您手动点击「允许写入」后保存，且您可随时一键清除本场全部会话数据。
                      </p>
                      <label className="inline-flex items-center gap-2 pt-1 cursor-pointer select-none font-medium text-ink">
                        <input
                          type="checkbox"
                          checked={privacyAccepted}
                          onChange={(e) => onPrivacyChange(e.target.checked)}
                          data-testid="privacy-consent-checkbox"
                          className="w-4 h-4 accent-ink rounded"
                        />
                        <span>我已了解麦克风采集边界与会话隐私控制，同意进入实时协同</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 text-ink-2">
                        <span>初始视角：</span>
                        <select
                          value={launchViewMode}
                          onChange={(e) => setLaunchViewMode(e.target.value as ViewMode)}
                          className="border border-line bg-ground rounded px-2 py-1 text-ink"
                        >
                          <option value="focus">Focus（演讲者极简）</option>
                          <option value="inspector">Inspector（开发透视）</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5 text-ink-2">
                        <span>最高干预上限：</span>
                        <select
                          value={launchMaxLevel}
                          onChange={(e) => setLaunchMaxLevel(e.target.value as InterventionLevel)}
                          className="border border-line bg-ground rounded px-2 py-1 text-ink font-mono"
                        >
                          <option value="L0">L0 · 静默</option>
                          <option value="L1">L1 · 微光</option>
                          <option value="L2">L2 · 关键词</option>
                          <option value="L3">L3 · 要点展开</option>
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={!privacyAccepted}
                        data-testid="launch-rehearsal-btn"
                        onClick={() =>
                          onLaunchStage({
                            pack: activePack,
                            mode: 'rehearsal',
                            viewMode: launchViewMode,
                            maxLevel: launchMaxLevel,
                          })
                        }
                        className="gap-1.5"
                      >
                        <ShieldCheck className="w-4 h-4 text-violet" />
                        <span>开始彩排模式 (Rehearsal)</span>
                      </Button>
                      <Button
                        type="button"
                        disabled={!privacyAccepted}
                        data-testid="launch-live-btn"
                        onClick={() =>
                          onLaunchStage({
                            pack: activePack,
                            mode: 'live',
                            viewMode: launchViewMode,
                            maxLevel: launchMaxLevel,
                          })
                        }
                        className="gap-1.5"
                      >
                        <span>进入正式演讲 (Live)</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

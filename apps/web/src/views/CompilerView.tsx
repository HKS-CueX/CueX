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
  ChevronDown,
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
import {
  FACT_CATEGORY_LABELS,
  formatApiError,
  formatDuration,
  SCENE_TYPE_LABELS,
} from '@/lib/format';
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
  authReady?: boolean;
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

const DURATION_MINUTE_PRESETS = [3, 5, 7, 10, 15] as const;

export const CompilerView: React.FC<CompilerViewProps> = ({
  activePack,
  onPackChange,
  privacyAccepted,
  onPrivacyChange,
  authReady = true,
  onLaunchStage,
}) => {
  const [savedPacks, setSavedPacks] = useState<PresentationPackSummary[]>([]);
  const [title, setTitle] = useState(activePack?.title ?? '');
  const [sceneType, setSceneType] = useState<PresentationSceneType>(
    activePack?.sceneType ?? 'pitch'
  );
  const [goal, setGoal] = useState(activePack?.goal ?? '');
  const [audience, setAudience] = useState(activePack?.audience ?? '');
  const [targetDurationMinutes, setTargetDurationMinutes] = useState<number>(
    Math.max(1, Math.round((activePack?.targetDurationSec ?? 300) / 60))
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

  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editingFactText, setEditingFactText] = useState('');
  const [newFactText, setNewFactText] = useState('');
  const [newFactSource, setNewFactSource] = useState('讲稿补充说明');
  const [newFactCategory, setNewFactCategory] =
    useState<PresentationFactItem['category']>('metric');

  const [launchMaxLevel, setLaunchMaxLevel] = useState<InterventionLevel>('L3');

  useEffect(() => {
    if (!authReady) return;
    void listPresentationPacks()
      .then((packs) => setSavedPacks(packs))
      .catch(() => {});
  }, [activePack?.packId, authReady]);

  useEffect(() => {
    if (!activePack) return;
    setTitle(activePack.title);
    setSceneType(activePack.sceneType);
    setGoal(activePack.goal);
    setAudience(activePack.audience);
    setTargetDurationMinutes(Math.max(1, Math.round(activePack.targetDurationSec / 60)));
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
        setError(result.warnings[0] || `无法读取文件 ${file.name}，请检查格式后重试。`);
      } else if (result.status === 'unreadable' || result.unreadable) {
        setStatusMessage(`未能从 ${file.name} 提取到文字，请在下方直接粘贴讲稿大纲。`);
      } else {
        setStatusMessage(`已导入 ${file.name}（共 ${result.sections.length} 节内容）。`);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setStatusMessage('已取消文件导入。');
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
        title: 'CueX 产品路演示例讲稿',
        sceneType: 'pitch',
        goal: '在 5 分钟内清晰分享产品核心价值、临场提词体验与拓展方向',
        audience: '现场评委与听众',
        targetDurationSec: 300,
        rawMaterials: '',
        useSamplePack: true,
      });
      onPackChange(pack);
      setKeyFactsText(pack.facts.map((f) => f.text).join('\n'));
      setRawMaterials(
        pack.cueSheet.chapters
          .map((c) => `## ${c.title}\n${c.coreMessage}\n衔接提示：${c.transitionCue}`)
          .join('\n\n')
      );
      setStatusMessage('已加载示例讲稿，可直接查看右侧提纲与关键数据，或立即开始彩排。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载示例讲稿失败');
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
      setStatusMessage(`已切换至讲稿：${pack.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取讲稿失败');
    } finally {
      setCompiling(false);
    }
  };

  const runCompile = async () => {
    if (!title.trim()) {
      setError('请先填写演讲标题。');
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
      const safeMinutes = Math.min(120, Math.max(1, Number(targetDurationMinutes) || 5));
      const pack = await compilePresentationPack(
        {
          packId: activePack?.packId,
          title: title.trim(),
          sceneType,
          goal: goal.trim() || `清晰完成「${title.trim()}」核心分享与现场交流`,
          audience: audience.trim() || '现场听众与评委',
          targetDurationSec: safeMinutes * 60,
          rawMaterials: rawMaterials.trim() || keyFactsInput.join('\n'),
          sourceFilenames: extractInfo ? [extractInfo.filename] : undefined,
          keyFactsInput,
          forbiddenClaims,
        },
        { signal: controller.signal }
      );
      onPackChange(pack);
      setStatusMessage('演讲提纲与关键数据已整理完成，核对后即可开始彩排或正式上台。');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setStatusMessage('已取消本次提纲生成。');
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
      setStatusMessage('修改已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
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
      setError('该条关键数据已开启防改锁定，请先点击锁图标解锁后再删除。');
      return;
    }
    const nextFacts = activePack.facts.filter((f) => f.id !== factId);
    void persistPatch({ facts: nextFacts });
  };

  const saveFactEdit = (factId: string) => {
    if (!activePack || !editingFactText.trim()) return;
    const target = activePack.facts.find((f) => f.id === factId);
    if (target?.locked) {
      setError('该条关键数据已开启防改锁定，请先点击锁图标解锁后再编辑。');
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
      source: newFactSource.trim() || '讲者补充',
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
    <div className="bg-ground text-ink min-h-[calc(100dvh-3.5rem)]">
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Page Header */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-line pb-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              准备讲稿
            </h1>
            <p className="text-sm text-ink-2 max-w-3xl leading-relaxed">
              上传幻灯片或粘贴讲稿大纲，自动梳理章节时间分配、核心数据卡片与常见现场追问。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {savedPacks.length > 0 && (
              <select
                aria-label="切换已有讲稿"
                value={activePack?.packId ?? ''}
                onChange={(e) => void handleSelectSavedPack(e.target.value)}
                className="h-9 max-w-full px-3 text-xs border border-line bg-surface rounded text-ink focus-visible:outline-none focus-visible:border-ink"
                data-testid="saved-packs-select"
              >
                <option value="" disabled>
                  切换已保存的讲稿…
                </option>
                {savedPacks.map((p) => (
                  <option key={p.packId} value={p.packId}>
                    {p.title}（{formatDuration(p.targetDurationSec)}）
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
              className="gap-1.5 min-h-9"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>加载示例讲稿</span>
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
                className="h-8 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                重新生成
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
          {/* Left: Simple Material Import & Settings */}
          <section className="lg:col-span-5 border border-line bg-surface rounded-md p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-line pb-3">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber shrink-0" />
                <span>导入幻灯片或讲稿</span>
              </h2>
              <span className="text-xs text-ink-3 whitespace-nowrap shrink-0">
                支持 PPTX / PDF / MD / TXT
              </span>
            </div>

            <div className="space-y-2">
              <label
                className={cn(
                  'block border border-line-strong rounded p-4 bg-surface-muted/70 hover:bg-surface-muted focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2 transition-colors cursor-pointer text-center space-y-1.5',
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
                  {extracting ? '正在读取幻灯片与演讲备注…' : '点击选择 PPTX、PDF 或文稿文件'}
                </div>
                <div className="text-xs text-ink-3 leading-relaxed">
                  自动读取每页正文与演讲者备注（单文件最大 15 MB）
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
                    className="h-8 text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    取消读取
                  </Button>
                </div>
              )}

              {fileValidationError && (
                <div
                  role="alert"
                  className="border border-alert/35 bg-alert-tint text-alert rounded px-3 py-2 text-xs flex items-start gap-2"
                  data-testid="file-validation-error"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{fileValidationError}</span>
                </div>
              )}
            </div>

            {extractInfo && (
              <div
                className={cn(
                  'border rounded p-3 space-y-2 text-xs',
                  extractInfo.status === 'rejected'
                    ? 'border-alert/40 bg-alert-tint/60'
                    : extractInfo.status === 'unreadable' || extractInfo.unreadable
                      ? 'border-amber/45 bg-amber-tint/70'
                      : 'border-line bg-surface-muted/70'
                )}
                data-testid="extract-result"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink truncate">{extractInfo.filename}</span>
                  <Badge
                    variant={
                      extractInfo.status === 'rejected' || extractInfo.unreadable
                        ? 'amber'
                        : 'resolved'
                    }
                  >
                    {extractInfo.status === 'parsed'
                      ? `已读取 ${extractInfo.characterCount} 字`
                      : '需要补充文字'}
                  </Badge>
                </div>
                {(extractInfo.status === 'unreadable' ||
                  extractInfo.status === 'rejected' ||
                  extractInfo.unreadable) && (
                  <div
                    className="rounded border border-amber/40 bg-surface px-2.5 py-2 text-xs text-amber-ink space-y-0.5"
                    data-testid="extract-status-warning"
                  >
                    <strong className="block font-semibold">
                      该文件暂未识别到可直接提取的文字（如扫描图片版 PDF）
                    </strong>
                    <span>请在下方文本框直接粘贴讲稿要点或章节大纲后继续整理。</span>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleCompile} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label htmlFor="compile-title" className="font-medium text-ink block">
                  演讲标题 <span className="text-amber-ink">*</span>
                </label>
                <input
                  id="compile-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：毕业论文答辩汇报 / 新产品融资路演"
                  className="w-full border border-line bg-ground rounded px-3 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="compile-scene" className="font-medium text-ink block">
                    演讲场合
                  </label>
                  <select
                    id="compile-scene"
                    value={sceneType}
                    onChange={(e) => setSceneType(e.target.value as PresentationSceneType)}
                    className="w-full border border-line bg-ground rounded px-3 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
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
                    预计时长（分钟）
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="compile-duration"
                      type="number"
                      min={1}
                      max={120}
                      step={1}
                      value={targetDurationMinutes}
                      onChange={(e) => setTargetDurationMinutes(Number(e.target.value))}
                      className="w-20 border border-line bg-ground rounded px-2.5 py-2 text-ink font-mono tabular-nums focus-visible:outline-none focus-visible:border-ink"
                    />
                    <div className="flex flex-wrap gap-1">
                      {DURATION_MINUTE_PRESETS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setTargetDurationMinutes(m)}
                          className={cn(
                            'px-2 py-1 rounded text-xs border transition-colors tabular-nums',
                            targetDurationMinutes === m
                              ? 'bg-ink text-ground border-ink font-medium'
                              : 'bg-ground text-ink-2 border-line hover:bg-surface-muted'
                          )}
                        >
                          {m}分
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="compile-materials" className="font-medium text-ink block">
                  讲稿正文或章节大纲
                </label>
                <textarea
                  id="compile-materials"
                  rows={6}
                  value={rawMaterials}
                  onChange={(e) => setRawMaterials(e.target.value)}
                  placeholder="粘贴讲稿、分页要点或演讲者备注（可用 ## 标题 划分章节）…"
                  className="w-full border border-line bg-ground rounded px-3 py-2 text-ink leading-relaxed focus-visible:outline-none focus-visible:border-ink"
                />
              </div>

              {/* Optional fine-tuning settings tucked cleanly */}
              <details className="group border border-line rounded bg-ground/60 px-3.5 py-2.5">
                <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-medium text-ink-2 hover:text-ink select-none">
                  <span>更多背景与边界设置（可选）</span>
                  <ChevronDown className="w-4 h-4 text-ink-3 transition-transform group-open:rotate-180" />
                </summary>

                <div className="pt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="compile-audience" className="font-medium text-ink block">
                        现场听众
                      </label>
                      <input
                        id="compile-audience"
                        type="text"
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        placeholder="例如：答辩导师、投资人、客户团队"
                        className="w-full border border-line bg-surface rounded px-3 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="compile-goal" className="font-medium text-ink block">
                        核心目标
                      </label>
                      <input
                        id="compile-goal"
                        type="text"
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        placeholder="例如：讲清创新点并稳健回答实验细节提问"
                        className="w-full border border-line bg-surface rounded px-3 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="compile-facts" className="font-medium text-ink block">
                      重点必提数据（每行一条）
                    </label>
                    <textarea
                      id="compile-facts"
                      rows={3}
                      value={keyFactsText}
                      onChange={(e) => setKeyFactsText(e.target.value)}
                      placeholder="例如：&#10;样本规模 1,240 例，准确率提升 18.6%&#10;单场服务成本控制在 0.6 元以内"
                      className="w-full border border-line bg-surface rounded px-3 py-2 text-ink leading-relaxed focus-visible:outline-none focus-visible:border-ink"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="compile-forbidden" className="font-medium text-ink block">
                      避免提及的表述（每行一条）
                    </label>
                    <textarea
                      id="compile-forbidden"
                      rows={2}
                      value={forbiddenText}
                      onChange={(e) => setForbiddenText(e.target.value)}
                      placeholder="例如：暂未公开的合作客户名单、未定稿的明年财务预测"
                      className="w-full border border-line bg-surface rounded px-3 py-2 text-ink leading-relaxed focus-visible:outline-none focus-visible:border-ink"
                    />
                  </div>
                </div>
              </details>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={compiling}
                  className="flex-1"
                  data-testid="compile-submit-btn"
                >
                  {compiling ? '正在整理演讲提纲…' : '生成演讲提纲'}
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

          {/* Right: Organized Outline, Key Data, Predicted Q&A & Launch Bar */}
          <section className="lg:col-span-7 space-y-5">
            {!activePack ? (
              <div className="border border-line bg-surface rounded-md p-8 sm:p-10 text-center space-y-4">
                <BookOpen className="w-8 h-8 text-amber mx-auto" />
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold text-ink">先导入一份讲稿，或体验内置示例</h2>
                  <p className="text-sm text-ink-2 max-w-md mx-auto leading-relaxed">
                    在左侧上传 PPT / 文稿后点击「生成演讲提纲」，也可以直接加载路演示例讲稿立刻去台上试一试。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="amber"
                  onClick={() => void handleLoadSamplePack()}
                  disabled={compiling}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>加载路演示例讲稿</span>
                </Button>
              </div>
            ) : (
              <>
                <div
                  className="border border-line bg-surface rounded-md p-5 space-y-4"
                  data-testid="compiled-pack-panel"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-ink">{activePack.title}</h2>
                        <Badge variant="amber">
                          {SCENE_TYPE_LABELS[activePack.sceneType] ?? activePack.sceneType}
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-3 mt-1 tabular-nums">
                        听众：{activePack.audience} ｜ 预计时长：{formatDuration(activePack.targetDurationSec)} ｜ 已启用{' '}
                        {activePack.facts.filter((f) => f.userConfirmed).length} 条关键数据
                      </p>
                    </div>
                    {savingPatch && (
                      <span className="text-xs text-ink-3">正在保存…</span>
                    )}
                  </div>

                  {activePack.warnings.length > 0 && (
                    <div className="border border-amber/30 bg-amber-tint/60 rounded p-3 text-xs text-amber-ink space-y-1">
                      {activePack.warnings.map((w, i) => (
                        <div key={i}>• {w}</div>
                      ))}
                    </div>
                  )}

                  <Tabs defaultValue="cuesheet" className="w-full">
                    <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 h-auto gap-1">
                      <TabsTrigger value="cuesheet" data-testid="tab-cuesheet" className="text-xs">
                        导播提纲
                      </TabsTrigger>
                      <TabsTrigger value="facts" data-testid="tab-facts" className="text-xs">
                        关键数据 ({activePack.facts.length})
                      </TabsTrigger>
                      <TabsTrigger value="qa" data-testid="tab-qa" className="text-xs">
                        预测追问 ({activePack.qaCards.length})
                      </TabsTrigger>
                      <TabsTrigger value="structure" data-testid="tab-structure" className="text-xs">
                        章节要点 ({activePack.progressNodes.length})
                      </TabsTrigger>
                    </TabsList>

                    {/* 1. CueSheet */}
                    <TabsContent value="cuesheet" className="space-y-4 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 bg-surface-muted/60 rounded space-y-1.5">
                          <label
                            htmlFor="cuesheet-thesis"
                            className="text-xs font-semibold text-ink-2 block"
                          >
                            一句话核心结论
                          </label>
                          <textarea
                            id="cuesheet-thesis"
                            rows={4}
                            value={activePack.cueSheet.oneLineThesis}
                            onChange={(e) =>
                              onPackChange({
                                ...activePack,
                                cueSheet: { ...activePack.cueSheet, oneLineThesis: e.target.value },
                              })
                            }
                            className="w-full min-h-[88px] bg-surface border border-line rounded px-2.5 py-2 text-xs text-ink leading-relaxed focus-visible:outline-none focus-visible:border-ink"
                          />
                        </div>
                        <div className="p-3.5 bg-surface-muted/60 rounded space-y-1.5">
                          <label
                            htmlFor="cuesheet-hook"
                            className="text-xs font-semibold text-ink-2 block"
                          >
                            开场引入话术
                          </label>
                          <textarea
                            id="cuesheet-hook"
                            rows={4}
                            value={activePack.cueSheet.audienceHook}
                            onChange={(e) =>
                              onPackChange({
                                ...activePack,
                                cueSheet: { ...activePack.cueSheet, audienceHook: e.target.value },
                              })
                            }
                            className="w-full min-h-[88px] bg-surface border border-line rounded px-2.5 py-2 text-xs text-ink leading-relaxed focus-visible:outline-none focus-visible:border-ink"
                          />
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">各章节节奏与衔接</span>
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            onClick={() => void persistPatch({ cueSheet: activePack.cueSheet })}
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>保存提纲修改</span>
                          </Button>
                        </div>

                        <div className="divide-y divide-line border border-line rounded bg-surface">
                          {activePack.cueSheet.chapters.map((ch, idx) => (
                            <div
                              key={ch.chapterId}
                              className="p-3.5 space-y-2 text-xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-ink">
                                  第 {idx + 1} 章 {ch.title}
                                </span>
                                <span className="font-mono text-xs text-ink-3 tabular-nums whitespace-nowrap">
                                  建议 {formatDuration(ch.targetDurationSec)}
                                </span>
                              </div>
                              <p className="text-ink-2 leading-relaxed">{ch.coreMessage}</p>
                              <p className="text-xs text-violet-ink bg-violet-tint/70 px-2.5 py-1.5 rounded leading-relaxed">
                                下一章衔接：{ch.transitionCue}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {activePack.forbiddenClaims.length > 0 && (
                        <div className="border border-amber/30 bg-amber-tint/50 rounded p-3.5 text-xs space-y-1.5">
                          <span className="font-semibold text-amber-ink flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            表达注意边界
                          </span>
                          <ul className="list-disc pl-4 text-amber-ink space-y-0.5 leading-relaxed">
                            {activePack.forbiddenClaims.map((c, idx) => (
                              <li key={idx}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </TabsContent>

                    {/* 2. Key Facts */}
                    <TabsContent value="facts" className="space-y-4 pt-3" data-testid="fact-whitelist">
                      <div className="flex items-center justify-between text-xs bg-surface-muted rounded px-3.5 py-2.5">
                        <span className="text-ink-2 leading-relaxed">
                          开启<strong>「已启用」</strong>的数据会在你卡顿或遇到现场提问时用作提词依据；点击小锁可防止误改关键数字。
                        </span>
                      </div>

                      <div className="space-y-2.5">
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
                                'border rounded p-3.5 text-xs space-y-2 transition-colors',
                                fact.userConfirmed
                                  ? 'border-line bg-surface'
                                  : 'border-amber/35 bg-amber-tint/35'
                              )}
                            >
                              {isEditing ? (
                                <div className="space-y-2">
                                  <textarea
                                    rows={3}
                                    value={editingFactText}
                                    onChange={(e) => setEditingFactText(e.target.value)}
                                    className="w-full border border-line bg-ground rounded px-2.5 py-2 text-ink leading-relaxed focus-visible:outline-none focus-visible:border-ink"
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
                                      保存
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                  <div className="space-y-1.5 min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Badge variant={fact.userConfirmed ? 'resolved' : 'amber'}>
                                        {fact.userConfirmed ? '已启用' : '待核对'}
                                      </Badge>
                                      <Badge variant="secondary">
                                        {FACT_CATEGORY_LABELS[fact.category] ?? fact.category}
                                      </Badge>
                                      {fact.locked && (
                                        <Badge variant="violet">
                                          <Lock className="w-3 h-3" />
                                          已锁定保护
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-ink font-medium leading-relaxed break-words">
                                      {fact.text}
                                    </p>
                                    <div
                                      className="flex flex-wrap items-center gap-2 text-xs text-ink-3"
                                      data-testid={`fact-provenance-${fact.id}`}
                                    >
                                      <span>出处：{fact.source}</span>
                                      {matchedEvidence?.locationRef && (
                                        <span className="px-2 py-0.5 rounded bg-surface-muted text-ink-2 text-xs">
                                          页码/段落：{matchedEvidence.locationRef}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      size="sm"
                                      onClick={() => toggleFactConfirm(fact.id)}
                                      data-testid={`fact-confirm-${fact.id}`}
                                      className="h-9 sm:h-8 px-2.5 text-xs whitespace-nowrap"
                                    >
                                      {fact.userConfirmed ? '停用' : '启用'}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      size="icon"
                                      className="h-9 w-9 sm:h-8 sm:w-8"
                                      onClick={() => toggleFactLock(fact.id)}
                                      data-testid={`fact-lock-${fact.id}`}
                                      aria-label={fact.locked ? '解锁该条数据' : '锁定该条数据'}
                                      title={fact.locked ? '点击解锁以允许修改' : '点击锁定防止误改'}
                                    >
                                      {fact.locked ? (
                                        <Lock className="w-4 h-4 text-violet" />
                                      ) : (
                                        <Unlock className="w-4 h-4 text-ink-3" />
                                      )}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9 sm:h-8 sm:w-8"
                                      disabled={fact.locked}
                                      onClick={() => {
                                        if (fact.locked) return;
                                        setEditingFactId(fact.id);
                                        setEditingFactText(fact.text);
                                      }}
                                      data-testid={`fact-edit-${fact.id}`}
                                      aria-label="编辑数据"
                                      title={fact.locked ? '请先解锁后再编辑' : '编辑数据'}
                                    >
                                      <Edit3 className="w-4 h-4 text-ink-2" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9 sm:h-8 sm:w-8"
                                      onClick={() => deleteFact(fact.id)}
                                      disabled={fact.locked}
                                      data-testid={`fact-delete-${fact.id}`}
                                      aria-label="删除数据"
                                      title={fact.locked ? '请先解锁后再删除' : '删除数据'}
                                    >
                                      <Trash2 className="w-4 h-4 text-amber-ink" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Add Custom Key Data */}
                      <div className="border border-line bg-surface-muted/70 rounded p-3.5 space-y-2.5 text-xs">
                        <span className="font-semibold text-ink block">补充一条关键数据</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={newFactText}
                            onChange={(e) => setNewFactText(e.target.value)}
                            placeholder="输入核心指标、实验结论或业务口径…"
                            className="sm:col-span-2 border border-line bg-surface rounded px-2.5 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
                            data-testid="new-fact-input"
                          />
                          <select
                            value={newFactCategory}
                            onChange={(e) =>
                              setNewFactCategory(e.target.value as PresentationFactItem['category'])
                            }
                            className="border border-line bg-surface rounded px-2.5 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
                          >
                            <option value="metric">关键数字</option>
                            <option value="claim">核心观点</option>
                            <option value="boundary">表达边界</option>
                            <option value="milestone">重要进展</option>
                            <option value="definition">关键概念</option>
                          </select>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <input
                            type="text"
                            value={newFactSource}
                            onChange={(e) => setNewFactSource(e.target.value)}
                            placeholder="备注出处（如：第 6 页实验对比表）"
                            className="flex-1 border border-line bg-surface rounded px-2.5 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={addCustomFact}
                            disabled={!newFactText.trim()}
                            data-testid="add-fact-btn"
                            className="min-h-9 sm:min-h-8"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>添加并锁定</span>
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    {/* 3. Predicted Q&A Cards */}
                    <TabsContent value="qa" className="space-y-4 pt-3" data-testid="qa-cards-panel">
                      <div className="flex items-start gap-2.5 border border-violet/35 bg-violet-tint/60 rounded p-3.5 text-xs text-violet-ink">
                        <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <strong className="font-semibold">
                            可能被问到的现场问题
                          </strong>
                          <p className="text-xs leading-relaxed">
                            根据你的讲稿推演出的常见追问与应答思路，你可以提前微调回答要点，上台遇到类似提问时会即时提示。
                          </p>
                        </div>
                      </div>

                      {activePack.unpreparedGaps.length > 0 && (
                        <div
                          className="border border-amber/35 bg-amber-tint/60 rounded p-3.5 text-xs space-y-1"
                          data-testid="unprepared-gaps"
                        >
                          <span className="font-semibold text-amber-ink block">
                            讲稿尚未覆盖的高频问题（可按需到「关键数据」补充）
                          </span>
                          <ul className="list-disc pl-4 text-amber-ink space-y-0.5 leading-relaxed">
                            {activePack.unpreparedGaps.map((gap, i) => (
                              <li key={i}>{gap}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="divide-y divide-line border border-line rounded bg-surface">
                        {activePack.qaCards.map((qa) => (
                          <div
                            key={qa.id}
                            className="p-3.5 space-y-2 text-xs"
                            data-testid={`qa-card-${qa.id}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant={qa.prepared ? 'resolved' : 'amber'}>
                                  {qa.prepared ? '已有讲稿数据支撑' : '建议补充相关数据'}
                                </Badge>
                              </div>
                              {qa.evidenceIds.length > 0 && (
                                <span className="text-xs text-ink-3 tabular-nums">
                                  关联 {qa.evidenceIds.length} 条关键数据
                                </span>
                              )}
                            </div>

                            <h3 className="text-sm font-semibold text-ink">{qa.question}</h3>
                            <p className="text-xs text-ink-3 leading-relaxed">
                              关注点：{qa.rationale}
                            </p>

                            <div className="space-y-1">
                              <span className="text-xs font-medium text-ink-2 block">
                                建议回答要点（可直接修改）：
                              </span>
                              <textarea
                                rows={3}
                                value={qa.suggestedAnswer}
                                onChange={(e) =>
                                  updateQACard(qa.id, { suggestedAnswer: e.target.value })
                                }
                                className="w-full border border-line bg-ground rounded px-2.5 py-2 text-ink leading-relaxed focus-visible:outline-none focus-visible:border-ink"
                              />
                            </div>

                            {qa.gapNote && (
                              <p className="text-xs text-amber-ink">补充建议：{qa.gapNote}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* 4. Chapter Key Points */}
                    <TabsContent value="structure" className="space-y-3 pt-3" data-testid="progress-structure">
                      <div className="divide-y divide-line border border-line rounded bg-surface">
                        {activePack.progressNodes.map((node) => (
                          <div
                            key={node.chapterId}
                            className="p-3.5 space-y-2 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-ink flex items-center gap-2">
                                <ListChecks className="w-4 h-4 text-amber shrink-0" />
                                第 {node.order + 1} 章 {node.title}
                              </span>
                              <span className="font-mono text-xs text-ink-3 tabular-nums whitespace-nowrap">
                                预计 {formatDuration(node.targetDurationSec)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {node.keyPoints.map((kp) => (
                                <span
                                  key={kp.id}
                                  className="px-2.5 py-1 rounded bg-surface-muted text-ink-2 text-xs"
                                >
                                  {kp.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Ready-to-Launch Bar */}
                <div
                  className="border border-ink/25 bg-surface rounded-md p-5 space-y-4"
                  data-testid="launch-gate"
                >
                  <div className="flex items-start gap-3 bg-surface-muted rounded p-3.5 text-xs">
                    <Mic className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <label className="inline-flex items-center gap-2.5 min-h-[36px] cursor-pointer select-none font-medium text-ink">
                        <input
                          type="checkbox"
                          checked={privacyAccepted}
                          onChange={(e) => onPrivacyChange(e.target.checked)}
                          data-testid="privacy-consent-checkbox"
                          className="w-4 h-4 accent-ink rounded shrink-0"
                        />
                        <span>允许在演讲期间使用麦克风跟进语流（录音不落盘保存，讲完可一键清空）</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 text-ink-2">
                        <span>提示详略：</span>
                        <select
                          value={launchMaxLevel}
                          onChange={(e) => setLaunchMaxLevel(e.target.value as InterventionLevel)}
                          className="h-9 border border-line bg-ground rounded px-2.5 text-ink focus-visible:outline-none focus-visible:border-ink"
                        >
                          <option value="L3">追问时可展开要点</option>
                          <option value="L2">仅关键词短提示</option>
                          <option value="L1">仅边缘柔和微光</option>
                          <option value="L0">全程免打扰（仅记录）</option>
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
                            viewMode: 'focus',
                            maxLevel: launchMaxLevel,
                          })
                        }
                        className="gap-1.5 min-h-[40px]"
                      >
                        <ShieldCheck className="w-4 h-4 text-violet" />
                        <span>先彩排一遍</span>
                      </Button>
                      <Button
                        type="button"
                        disabled={!privacyAccepted}
                        data-testid="launch-live-btn"
                        onClick={() =>
                          onLaunchStage({
                            pack: activePack,
                            mode: 'live',
                            viewMode: 'focus',
                            maxLevel: launchMaxLevel,
                          })
                        }
                        className="gap-1.5 min-h-[40px]"
                      >
                        <span>开始正式演讲</span>
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

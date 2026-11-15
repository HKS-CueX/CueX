import React, { useCallback, useEffect, useState } from 'react';
import type { DataScope, MemoryCategory, MemoryItem, PrivacyLevel } from '@cuex/protocol';
import { Trash2, Edit3, Check, X, RefreshCw, ShieldCheck, Plus } from 'lucide-react';
import {
  createMemoryItem,
  deleteMemoryItem,
  listMemoryItems,
  patchMemoryItem,
} from '@/lib/api';
import { MEMORY_CATEGORY_LABELS } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MemoryInspectorPanelProps {
  refreshTrigger?: number;
  compact?: boolean;
}

const SCOPE_LABELS: Record<DataScope, string> = {
  global: '全局记忆',
  scenario: '场景内',
  session: '仅会话',
  document: '文档级',
};

const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  local_private: '本地私有',
  session: '仅本场',
  ephemeral: '临时缓存',
  shared: '团队共享',
};

export const MemoryInspectorPanel: React.FC<MemoryInspectorPanelProps> = ({
  refreshTrigger = 0,
  compact = false,
}) => {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPrivacy, setEditPrivacy] = useState<PrivacyLevel>('local_private');

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preference');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listMemoryItems();
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取记忆列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const startEdit = (item: MemoryItem) => {
    setEditingId(item.memoryId);
    setEditTitle(item.title);
    setEditContent(item.content);
    setEditPrivacy(item.privacyLevel);
  };

  const saveEdit = async (memoryId: string) => {
    try {
      const updated = await patchMemoryItem(memoryId, {
        title: editTitle.trim(),
        content: editContent.trim(),
        privacyLevel: editPrivacy,
      });
      setItems((prev) => prev.map((it) => (it.memoryId === memoryId ? updated : it)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新记忆失败');
    }
  };

  const handleDelete = async (memoryId: string) => {
    try {
      await deleteMemoryItem(memoryId);
      setItems((prev) => prev.filter((it) => it.memoryId !== memoryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除记忆失败');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      const created = await createMemoryItem({
        scenarioId: 'presentation',
        category: newCategory,
        title: newTitle.trim(),
        content: newContent.trim(),
        userConfirmed: true,
        privacyLevel: 'local_private',
        scope: 'global',
      });
      setItems((prev) => [created, ...prev]);
      setNewTitle('');
      setNewContent('');
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入记忆失败');
    }
  };

  return (
    <div className="space-y-4" data-testid="memory-inspector">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-resolved" />
            <h3 className="text-sm font-semibold text-ink">个人记忆控制面板（Opt-in Memory Store）</h3>
          </div>
          {!compact && (
            <p className="text-xs text-ink-3">
              所有长期记忆必须经用户显式确认（userConfirmed = true）才会写入本地存储，支持随时查阅、编辑或彻底删除。
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
            data-testid="memory-add-toggle"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>手动添加</span>
          </Button>
          <Button type="button" variant="quiet" size="sm" onClick={() => void load()}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>刷新</span>
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-amber-ink bg-amber-tint border border-amber/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="border border-line bg-ground p-3.5 rounded space-y-2.5 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="记忆标题（例如：开场习惯）"
              className="sm:col-span-2 border border-line bg-surface rounded px-2.5 py-1.5 text-ink"
              required
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
              className="border border-line bg-surface rounded px-2.5 py-1.5 text-ink"
            >
              {Object.entries(MEMORY_CATEGORY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="需要 CueX 在后续场次记住的偏好、术语或边界说明..."
            className="w-full border border-line bg-surface rounded px-2.5 py-1.5 text-ink"
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              取消
            </Button>
            <Button type="submit" size="sm">
              确认写入记忆
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="border border-line bg-ground/60 rounded p-4 text-xs text-ink-3">
          正在读取个人记忆存储...
        </div>
      ) : items.length === 0 ? (
        <div
          className="border border-dashed border-line-strong bg-ground/40 rounded p-5 text-center space-y-1"
          data-testid="memory-empty"
        >
          <p className="text-xs font-medium text-ink-2">当前没有已写入的个人长期记忆</p>
          <p className="text-[11px] text-ink-3">
            场后复盘若生成记忆建议，仅在您点击「允许写入」后才会出现在此处。
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line border border-line bg-surface rounded">
          {items.map((item) => {
            const isEditing = editingId === item.memoryId;
            return (
              <div
                key={item.memoryId}
                data-testid={`memory-item-${item.memoryId}`}
                className="p-3.5 space-y-2"
              >
                {isEditing ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="flex-1 min-w-[160px] border border-line bg-ground rounded px-2.5 py-1.5 text-ink font-medium"
                      />
                      <select
                        value={editPrivacy}
                        onChange={(e) => setEditPrivacy(e.target.value as PrivacyLevel)}
                        className="border border-line bg-ground rounded px-2 py-1.5 text-ink"
                      >
                        {Object.entries(PRIVACY_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full border border-line bg-ground rounded px-2.5 py-1.5 text-ink"
                    />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="w-3.5 h-3.5" />
                        <span>取消</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void saveEdit(item.memoryId)}
                        data-testid={`memory-save-${item.memoryId}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>保存</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-ink">{item.title}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {MEMORY_CATEGORY_LABELS[item.category] ?? item.category}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {SCOPE_LABELS[item.scope] ?? item.scope}
                        </Badge>
                        <Badge variant="resolved" className="text-[10px]">
                          {PRIVACY_LABELS[item.privacyLevel] ?? item.privacyLevel}
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-2 leading-relaxed break-words">
                        {item.content}
                      </p>
                      <p className="text-[10px] font-mono text-ink-3">
                        更新于 {new Date(item.updatedAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(item)}
                        aria-label={`编辑 ${item.title}`}
                        data-testid={`memory-edit-${item.memoryId}`}
                      >
                        <Edit3 className="w-3.5 h-3.5 text-ink-2" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(item.memoryId)}
                        aria-label={`删除 ${item.title}`}
                        data-testid={`memory-delete-${item.memoryId}`}
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
      )}
    </div>
  );
};

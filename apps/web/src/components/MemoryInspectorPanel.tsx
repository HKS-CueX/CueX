import React, { useCallback, useEffect, useState } from 'react';
import type { MemoryCategory, MemoryItem, PrivacyLevel } from '@cuex/protocol';
import { Trash2, Edit3, Check, X, RefreshCw, SlidersHorizontal, Plus } from 'lucide-react';
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

const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  local_private: '仅自己可见',
  session: '仅当前场次',
  ephemeral: '临时记录',
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
      setError(err instanceof Error ? err.message : '读取偏好列表失败');
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
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleDelete = async (memoryId: string) => {
    try {
      await deleteMemoryItem(memoryId);
      setItems((prev) => prev.filter((it) => it.memoryId !== memoryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
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
      setError(err instanceof Error ? err.message : '添加偏好失败');
    }
  };

  return (
    <div className="space-y-4" data-testid="memory-inspector">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-violet" />
            <h3 className="text-sm font-semibold text-ink">我的演讲偏好</h3>
          </div>
          {!compact && (
            <p className="text-xs text-ink-3">
              保存你的常用术语、语速节奏与提词习惯，后续准备讲稿和上台时会自动沿用，随时可修改或删除。
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
            <span>新增偏好</span>
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
              aria-label="偏好名称"
              placeholder="例如：开场节奏提醒 / 专业名词写法"
              className="sm:col-span-2 border border-line bg-surface rounded px-2.5 py-1.5 text-ink"
              required
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
              aria-label="偏好分类"
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
            aria-label="偏好说明"
            placeholder="写下希望 CueX 在之后每场演讲中记住的习惯或常用口径…"
            className="w-full border border-line bg-surface rounded px-2.5 py-1.5 text-ink"
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              取消
            </Button>
            <Button type="submit" size="sm">
              保存偏好
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="border border-line bg-ground/60 rounded p-4 text-xs text-ink-3">
          正在加载演讲偏好…
        </div>
      ) : items.length === 0 ? (
        <div
          className="bg-surface-muted rounded p-5 text-center space-y-1"
          data-testid="memory-empty"
        >
          <p className="text-sm font-medium text-ink-2">还没有已保存的个人演讲偏好</p>
          <p className="text-xs text-ink-3">
            你可以点击右上角「新增偏好」，或在每场复盘后将推荐习惯一键保存过来。
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
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-ink">{item.title}</span>
                        <Badge variant="secondary">
                          {MEMORY_CATEGORY_LABELS[item.category] ?? item.category}
                        </Badge>
                        <Badge variant="resolved">
                          {PRIVACY_LABELS[item.privacyLevel] ?? item.privacyLevel}
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-2 leading-relaxed break-words">
                        {item.content}
                      </p>
                      <p className="text-xs text-ink-3 tabular-nums">
                        更新于 {new Date(item.updatedAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(item)}
                        aria-label={`编辑 ${item.title}`}
                        data-testid={`memory-edit-${item.memoryId}`}
                        className="min-h-9 min-w-9"
                      >
                        <Edit3 className="w-4 h-4 text-ink-2" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(item.memoryId)}
                        aria-label={`删除 ${item.title}`}
                        data-testid={`memory-delete-${item.memoryId}`}
                        className="min-h-9 min-w-9"
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
      )}
    </div>
  );
};

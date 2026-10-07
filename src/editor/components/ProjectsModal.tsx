import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, PencilLine, Trash2, X } from 'lucide-react';
import { Button } from './Button';
import { ProjectThumbnail } from './ProjectThumbnail';
import { loadProjectItems } from '../../projects/items';
import type { ProjectItem } from '../../projects/items';
import type { ProjectRepository } from '../../projects/repository';
import type { ActionResult } from '../useProjectManager';

interface Props {
  repository: ProjectRepository;
  currentId: string; // 今開いている作品
  onClose: () => void;
  // 一覧を読む前に呼ぶ (今の作品の未保存の分を保存して、一覧に反映するため)
  beforeLoad: () => Promise<unknown>;
  onOpen: (id: string) => Promise<ActionResult>;
  onRename: (id: string, name: string) => Promise<ActionResult>;
  onDuplicate: (id: string) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// マイスキン: 作品の一覧。開く・名前の変更・複製・削除ができる
export function ProjectsModal({ repository, currentId, onClose, beforeLoad, onOpen, onRename, onDuplicate, onDelete }: Props) {
  const [items, setItems] = useState<ProjectItem[] | null>(null); // null = 読み込み中
  const [message, setMessage] = useState<string | null>(null); // 失敗したときの理由
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await loadProjectItems(repository));
    } catch {
      setMessage('作品の一覧を読み込めませんでした');
      setItems([]);
    }
  }, [repository]);

  // 開いたとき: 今の作品を保存してから、一覧を読む
  useEffect(() => {
    let cancelled = false;
    void beforeLoad().then(() => { if (!cancelled) void reload(); });
    return () => { cancelled = true; };
  }, [beforeLoad, reload]);

  // 開いたら、ダイアログにフォーカスを移す (キーボードで操作できるように)
  useEffect(() => { dialogRef.current?.focus(); }, []);

  // 操作を実行して、失敗したら理由を出し、成功したら一覧を読み直す
  const run = async (action: () => Promise<ActionResult>, onSuccess?: () => void) => {
    setMessage(null);
    const result = await action();
    if (!result.ok) { setMessage(result.message); return; }
    onSuccess?.();
    await reload();
  };

  const startRename = (item: ProjectItem) => { setRenamingId(item.summary.id); setDraftName(item.summary.name); };
  const commitRename = (id: string) => run(() => onRename(id, draftName), () => setRenamingId(null));

  // Esc で閉じる (名前を編集中なら、まず編集をやめる)
  // ダイアログ内の要素が消えるとフォーカスが外れて、ダイアログ自身では Esc を受け取れなくなるので、画面全体で受け取る
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (renamingId) setRenamingId(null); else onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [renamingId, onClose]);

  // 名前の編集をやめたら、フォーカスをダイアログに戻す (キー操作を続けられるように)
  useEffect(() => {
    if (renamingId === null && !dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
  }, [renamingId]);

  // Tab はダイアログの中だけを回る
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="vx-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef} className="vx-modal" role="dialog" aria-modal="true" aria-labelledby="vx-projects-title"
        tabIndex={-1} onKeyDown={onKeyDown}
      >
        <div className="vx-modal-header">
          <h2 id="vx-projects-title" className="vx-panel-title">マイスキン</h2>
          <Button onClick={onClose} title="閉じる (Esc)" aria-label="閉じる"><X size={16} /></Button>
        </div>

        {message && <div className="vx-modal-message" role="alert">⚠ {message}</div>}

        <div className="vx-project-list" data-testid="project-list">
          {items === null && <p className="vx-empty">読み込み中…</p>}
          {items?.length === 0 && <p className="vx-empty">作品がありません</p>}
          {items?.map(item => {
            const { id, name, updatedAt } = item.summary;
            const isCurrent = id === currentId;
            return (
              <article key={id} className={isCurrent ? 'vx-project-card vx-project-card--current' : 'vx-project-card'} data-testid="project-card">
                <ProjectThumbnail pixels={item.thumbnail} label={name} />
                <div className="vx-project-body">
                  {renamingId === id ? (
                    <input
                      className="vx-input" autoFocus value={draftName} aria-label="作品の名前" maxLength={80}
                      onChange={e => setDraftName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void commitRename(id); }}
                    />
                  ) : (
                    <h3 className="vx-project-name" title={name}>{name}</h3>
                  )}
                  <div className="vx-project-meta">
                    {isCurrent && <span className="vx-project-badge">編集中</span>}
                    <span>{formatDate(updatedAt)}</span>
                  </div>
                  <div className="vx-project-actions">
                    {renamingId === id ? (
                      <>
                        <Button variant="primary" onClick={() => void commitRename(id)}>決定</Button>
                        <Button onClick={() => setRenamingId(null)}>やめる</Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="primary" disabled={isCurrent}
                          onClick={() => void run(() => onOpen(id), onClose)}
                        >開く</Button>
                        <Button onClick={() => startRename(item)} title="名前を変更" aria-label={`${name}の名前を変更`}><PencilLine size={14} /></Button>
                        <Button onClick={() => void run(() => onDuplicate(id))} title="複製" aria-label={`${name}を複製`}><Copy size={14} /></Button>
                        <Button
                          variant="danger" title="削除" aria-label={`${name}を削除`}
                          onClick={() => {
                            if (window.confirm(`「${name}」を削除しますか？\n削除すると元に戻せません。`)) void run(() => onDelete(id));
                          }}
                        ><Trash2 size={14} /></Button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

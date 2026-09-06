/**
 * 任务看板客户端（v0.1）：注册会话视图插槽「任务看板」，与「数字分身」Tab 同级布局。
 *
 * v0.1 范围：基础五列看板 + 卡片创建/执行/归档。续接卡、交接包、实时 SSE 在
 * 后续版本按需补足（决策三承诺 12 项基线，分阶段落）。
 *
 * 数据面走宿主 HTTP：GET /dsh-task-board/state / POST /dsh-task-board/action
 * （sameOrigin 防护已在服务端处理，浏览器只做带 cookie 拉取）。
 */
import { useState, useEffect, useCallback } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export const inject = ['slots']

type Column = '待规划' | '待办' | '进行中' | '已完成' | '已失败'

interface RunRecord {
  id: string; startedAt: string; finishedAt?: string
  sessionId?: string; status: string; summary?: string
  trigger: '手动' | '定时'
}
interface TaskRecord {
  id: string; title: string; prompt: string; column: Column
  createdAt: string; updatedAt: string; archived?: boolean
  workspaceId?: string; actionType: string; targetScope: string
  actionLevel: 'L0' | 'L1' | 'L2' | 'L3'
  cron?: string; lastMinuteKey?: string
  lastRunAt?: string; lastSessionId?: string; lastStatus?: string
  runs: RunRecord[]
}
interface BoardState {
  schemaVersion: number; revision: number; tasks: TaskRecord[]
  governance?: { mode?: '账本' | '本地' }
}

const COLUMNS: Array<{ id: Column; label: string }> = [
  { id: '待规划', label: '待规划' },
  { id: '待办', label: '待办' },
  { id: '进行中', label: '进行中' },
  { id: '已完成', label: '已完成' },
  { id: '已失败', label: '已失败' },
]

const LEVEL_OPTIONS: TaskRecord['actionLevel'][] = ['L0', 'L1', 'L2', 'L3']

const s: Record<string, React.CSSProperties> = {
  wrap: { padding: '14px 20px 48px' },
  head: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  h: { fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--dsw-alias-label-primary)' },
  badge: { fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: 'var(--dsw-alias-state-success-tertiary)', color: 'var(--dsw-alias-state-success-primary)' },
  badgeDegraded: { fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: 'var(--dsw-alias-state-warn-tertiary)', color: 'var(--dsw-alias-state-warn-primary)' },
  sub: { fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)', margin: '0 0 12px', lineHeight: 1.6 },
  actionRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, padding: '10px 14px', marginBottom: 12, background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12 },
  btn: { padding: '7px 18px', border: 'none', borderRadius: 8, background: 'var(--dsw-alias-state-business-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btn2: { padding: '6px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, cursor: 'pointer' },
  board: { display: 'flex', gap: 12, overflowX: 'auto' as const, paddingBottom: 8 },
  col: { flex: '1 1 0', minWidth: 220, background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12, display: 'flex', flexDirection: 'column' as const },
  colHead: { padding: '10px 12px', borderBottom: '1px solid var(--dsw-alias-border-l1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600, fontSize: 12.5, color: 'var(--dsw-alias-label-primary)' },
  colCount: { background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 999, padding: '1px 8px', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' },
  colBody: { padding: 8, flex: 1, minHeight: 80 },
  card: { background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, color: 'var(--dsw-alias-label-primary)' },
  cardTitle: { fontWeight: 600, fontSize: 13.5, marginBottom: 4 },
  cardMeta: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 11.5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 6 },
  cardDesc: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, lineHeight: 1.55, maxHeight: 60, overflow: 'hidden' },
  cardActions: { display: 'flex', gap: 6, marginTop: 8 },
  levelOk: { background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', padding: '1px 6px', borderRadius: 4, fontSize: 11 },
  levelWarn: { background: 'var(--dsw-alias-state-warn-tertiary)', color: 'var(--dsw-alias-state-warn-label)', padding: '1px 6px', borderRadius: 4, fontSize: 11 },
  levelErr: { background: 'var(--dsw-alias-state-error-tertiary)', color: 'var(--dsw-alias-state-error-primary)', padding: '1px 6px', borderRadius: 4, fontSize: 11 },
  empty: { padding: '24px 16px', textAlign: 'center' as const, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12.5, lineHeight: 1.6 },
  emptyBold: { color: 'var(--dsw-alias-label-primary)' },
  modal: { position: 'fixed' as const, inset: 0, background: 'rgba(20,22,26,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalBox: { background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 14, padding: '20px 22px', maxWidth: 560, width: '90%', maxHeight: '90vh', overflow: 'auto' },
  modalTitle: { fontSize: 16, fontWeight: 700, margin: '0 0 12px' },
  modalField: { marginBottom: 12 },
  modalFieldLabel: { display: 'block', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 },
  modalInput: { width: '100%', boxSizing: 'border-box' as const, padding: '6px 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, fontSize: 13, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontFamily: 'inherit' },
  modalHint: { background: 'var(--dsw-alias-bg-layer-2)', padding: '8px 10px', borderRadius: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 6, lineHeight: 1.55 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
}

function api<T>(path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { credentials: 'include', headers: { Accept: 'application/json' } }
  if (body !== undefined) {
    opts.method = 'POST'
    opts.headers = { ...opts.headers, 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  }
  return fetch(path, opts).then((r) => r.json() as Promise<T>)
}

function levelStyle(level: string): React.CSSProperties {
  if (level === 'L2' || level === 'L3') return s.levelErr
  if (level === 'L1') return s.levelWarn
  return s.levelOk
}

function BoardPage() {
  const [state, setState] = useState<BoardState | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    const d = await api<{ ok: boolean; state?: BoardState }>('/dsh-task-board/state')
    if (d.ok && d.state !== undefined) setState(d.state)
  }, [])
  useEffect(() => { void load() }, [load])

  const action = useCallback(async (type: string, body: Record<string, unknown>) => {
    const d = await api<{ ok: boolean; error?: string }>('/dsh-task-board/action', { type, ...body })
    if (!d.ok) alert(d.error ?? '操作失败')
    await load()
    return d
  }, [load])

  if (state === null) {
    return <div style={s.wrap}><div style={s.sub}>加载任务看板中…</div></div>
  }
  const tasks = state.tasks
  const byCol = (col: Column) => tasks.filter((t) => !t.archived && t.column === col)

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h1 style={s.h}>任务看板</h1>
        {state.governance?.mode === '本地' ? (
          <span
            style={s.badgeDegraded}
            title="dsh-ledger 未安装：L0/L1/L2 任务降级运行（summary 标注「无账本治理」），L3 不可逆动作一律拒绝。安装账本后恢复完整 L0-L3 审批治理。"
          >
            ⚠ 账本未安装 · 本地降级治理
          </span>
        ) : (
          <span style={s.badge}>✓ 治理就绪</span>
        )}
      </div>
      <p style={s.sub}>
        任务中心化——布置 → 账本裁决 → 分身执行 → 结果回填。所有任务默认由全工具分身执行，不可逆动作过 dsh-ledger。L2/L3 任务创建时立即触发裁决。
      </p>
      <div style={s.actionRow}>
        <button style={s.btn} onClick={() => setShowCreate(true)}>+ 新建任务</button>
        <button style={s.btn2} onClick={() => void load()}>刷新</button>
        <span style={{ marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }}>
          共 {tasks.filter((t) => !t.archived).length} 个任务
        </span>
      </div>
      <div style={s.board}>
        {COLUMNS.map((col) => {
          const list = byCol(col.id)
          return (
            <div key={col.id} style={s.col}>
              <div style={s.colHead}>
                <span>{col.label}</span>
                <span style={s.colCount}>{list.length}</span>
              </div>
              <div style={s.colBody}>
                {list.length === 0 ? (
                  <div style={s.empty}>暂无任务</div>
                ) : list.map((t) => (
                  <div key={t.id} style={s.card}>
                    <div style={s.cardTitle}>{t.title}</div>
                    <div style={s.cardMeta}>
                      <span style={levelStyle(t.actionLevel)}>{t.actionLevel}</span>
                      {t.cron !== undefined && t.cron !== '' ? <span>⏰ {t.cron}</span> : <span>一次性</span>}
                      {t.lastStatus !== undefined ? <span>· {t.lastStatus}</span> : null}
                    </div>
                    <div style={s.cardDesc}>{t.prompt}</div>
                    <div style={s.cardActions}>
                      <button style={s.btn2} onClick={() => void action('run', { id: t.id }).then((d) => {
                        // 执行结果反馈（审计 UX L-2）：治理拦截/待审批不再静默无响应
                        const run = (d as { run?: { status?: string; summary?: string } }).run
                        if (run && (run.status === '已阻断' || run.status === '待审批')) {
                          window.alert(`${run.status}：${run.summary ?? '该任务需要主任批准后才会执行（可在今日待办批准）'}`)
                        }
                      })}>▶ 执行</button>
                      <button style={s.btn2} onClick={() => void action('archive', { id: t.id, task: { archived: true } })}>归档</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load() }} />}
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [actionType, setActionType] = useState('整理汇报')
  const [targetScope, setTargetScope] = useState('记忆库')
  const [actionLevel, setActionLevel] = useState<TaskRecord['actionLevel']>('L1')
  const [cron, setCron] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(): Promise<void> {
    if (title.trim() === '' || prompt.trim() === '') { setErr('标题与提示词必填'); return }
    setBusy(true)
    setErr('')
    const d = await api<{ ok: boolean; error?: string }>('/dsh-task-board/action', {
      type: 'create',
      task: { title, prompt, actionType, targetScope, actionLevel, ...(cron.trim() !== '' ? { cron } : {}) },
    })
    setBusy(false)
    if (!d.ok) { setErr(d.error ?? '创建失败'); return }
    onCreated()
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.modalTitle}>新建任务</h2>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>任务标题</label>
          <input style={s.modalInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：每周整理记忆库摘要" />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>任务提示词（投递给分身）</label>
          <textarea style={{ ...s.modalInput, minHeight: 80, resize: 'vertical' as const }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="具体指令" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={s.modalField}>
            <label style={s.modalFieldLabel}>动作类型（账本裁决输入）</label>
            <input style={s.modalInput} value={actionType} onChange={(e) => setActionType(e.target.value)} />
          </div>
          <div style={s.modalField}>
            <label style={s.modalFieldLabel}>目标范围</label>
            <input style={s.modalInput} value={targetScope} onChange={(e) => setTargetScope(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={s.modalField}>
            <label style={s.modalFieldLabel}>动作级别</label>
            <select style={s.modalInput} value={actionLevel} onChange={(e) => setActionLevel(e.target.value as TaskRecord['actionLevel'])}>
              {LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div style={s.modalField}>
            <label style={s.modalFieldLabel}>cron（留空 = 仅手动）</label>
            <input style={s.modalInput} value={cron} onChange={(e) => setCron(e.target.value)} placeholder="分 时 日 月 周" />
          </div>
        </div>
        {(actionLevel === 'L2' || actionLevel === 'L3') && (
          <div style={s.modalHint}>
            ℹ L2/L3 任务创建时立即触发账本裁决：若阻断会产生审批令牌，进入今日待办「待批审批」。账本未安装时按本地降级策略执行——L2 放行并尽力通知主任，L3 一律拒绝。
          </div>
        )}
        {err !== '' && <div style={{ ...s.modalHint, background: 'var(--dsw-alias-state-error-tertiary)', color: 'var(--dsw-alias-state-error-primary)' }}>{err}</div>}
        <div style={s.modalActions}>
          <button style={s.btn2} onClick={onClose} disabled={busy}>取消</button>
          <button style={s.btn} onClick={() => void submit()} disabled={busy}>{busy ? '保存中…' : '保存到待办'}</button>
        </div>
      </div>
    </div>
  )
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      { name: 'conversation.view', id: 'task-board', order: 22, label: () => '任务看板' },
      BoardPage,
    ),
  )
}

/**
 * 任务看板客户端（v0.3）：看板/列表双视图 + 详情弹窗 + 沉淀列收纳 + 搜索筛选 +
 * 含归档开关 + 自动归档（服务端：已完成满 7 天归档，本客户端提供「含归档」查看）。
 *
 * 呈现原则（主人拍板的 P1+P2）：看板永远只呈现「当前要关心的活」——
 * 卡片保持紧凑（点卡片弹圆角详情卡：全量字段 + 运行历史 + 阶段动作），
 * 沉淀列只显示最近 5 条、已完成满 7 天自动归档；任务量大时切「列表」视图
 * （表格 + 排序 + 分页）全局检索。v0.2 的原地展开交互废除——列内长卡会
 * 把整条泳道撑变形（2026-09-23 主人反馈）。
 *
 * 数据面走宿主 HTTP：GET /dsh-task-board/state / POST /dsh-task-board/action
 * （sameOrigin 防护已在服务端处理，浏览器只做带 cookie 拉取）。
 */
import { useState, useEffect, useCallback } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { TaskBoardPluginConfig } from './PluginPage'

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
/** 沉淀列（已完成/已失败）默认只显示最近 5 条，其余「展开其余 N 条」 */
const SETTLED_LIMIT = 5
/** 列表视图分页大小 */
const LIST_PAGE_SIZE = 50

const LEVEL_OPTIONS: TaskRecord['actionLevel'][] = ['L0', 'L1', 'L2', 'L3']

const s: Record<string, React.CSSProperties> = {
  wrap: { padding: '14px 20px 48px' },
  head: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  h: { fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--dsw-alias-label-primary)' },
  badge: { fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: 'var(--dsw-alias-state-success-tertiary)', color: 'var(--dsw-alias-state-success-primary)' },
  badgeDegraded: { fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: 'var(--dsw-alias-state-warn-tertiary)', color: 'var(--dsw-alias-state-warn-primary)' },
  sub: { fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)', margin: '0 0 12px', lineHeight: 1.6 },
  actionRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, padding: '10px 14px', marginBottom: 12, background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12 },
  btn: { padding: '7px 18px', border: 'none', borderRadius: 8, background: 'var(--dsw-alias-state-business-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btn2: { padding: '6px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, cursor: 'pointer' },
  btn2Active: { padding: '6px 14px', border: '1px solid var(--dsw-alias-state-business-primary)', borderRadius: 8, background: 'var(--dsw-alias-state-business-tertiary)', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, cursor: 'pointer' },
  input: { padding: '6px 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, fontSize: 12.5, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', minWidth: 180, fontFamily: 'inherit' },
  select: { padding: '6px 8px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, fontSize: 12.5, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)' },
  count: { marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 },
  board: { display: 'flex', gap: 12, overflowX: 'auto' as const, paddingBottom: 8, alignItems: 'flex-start' as const },
  col: { flex: '1 1 0', minWidth: 230, background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12, display: 'flex', flexDirection: 'column' as const },
  colHead: { padding: '10px 12px', borderBottom: '1px solid var(--dsw-alias-border-l1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600, fontSize: 12.5, color: 'var(--dsw-alias-label-primary)' },
  colCount: { background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 999, padding: '1px 8px', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' },
  colBody: { padding: 8, flex: 1, minHeight: 80 },
  card: { background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, color: 'var(--dsw-alias-label-primary)' },
  cardArchived: { opacity: 0.62 },
  cardTitleRow: { display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' as const },
  detailBtn: { marginLeft: 'auto', flexShrink: 0, border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11.5, cursor: 'pointer', padding: '0 2px' },
  detailModalBox: { background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 16, padding: '20px 24px', maxWidth: 660, width: '92%', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.28)' },
  detailHead: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  detailTitle: { fontSize: 16.5, fontWeight: 700, flex: 1, margin: 0, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.4 },
  detailClose: { border: 'none', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', width: 26, height: 26, borderRadius: 8, fontSize: 14, cursor: 'pointer', flexShrink: 0, lineHeight: 1 },
  detailMeta: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 12 },
  detailMetaItem: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 6, padding: '3px 8px' },
  detailLabel: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', margin: '14px 0 6px' },
  detailPrompt: { background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.65, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap' as const, maxHeight: 260, overflowY: 'auto' as const },
  runItem: { borderLeft: '2px solid var(--dsw-alias-border-l2)', padding: '4px 0 4px 10px', marginBottom: 8 },
  runHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', flexWrap: 'wrap' as const },
  runSummary: { fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.55, marginTop: 3, whiteSpace: 'pre-wrap' as const },
  runOk: { color: 'var(--dsw-alias-state-success-primary)', fontWeight: 600 },
  runWarn: { color: 'var(--dsw-alias-state-warn-primary)', fontWeight: 600 },
  runErr: { color: 'var(--dsw-alias-state-error-primary)', fontWeight: 600 },
  runIdle: { color: 'var(--dsw-alias-label-secondary)', fontWeight: 600 },
  emptyRuns: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', padding: '6px 0' },
  cardTitle: { fontWeight: 600, fontSize: 13.5, flex: 1 },
  cardMeta: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 11.5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const, margin: '4px 0 6px' },
  cardDesc: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' as const, marginBottom: 6 },
  cardDetail: { borderTop: '1px dashed var(--dsw-alias-border-l2)', marginTop: 6, paddingTop: 6 },
  cardDetailLine: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 2 },
  cardActions: { display: 'flex', gap: 6, marginTop: 8 },
  runningHint: { fontSize: 12, color: 'var(--dsw-alias-state-business-primary)' },
  moreBtn: { width: '100%', padding: '6px 0', border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: 8, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, cursor: 'pointer' },
  levelOk: { background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', padding: '1px 6px', borderRadius: 4, fontSize: 11 },
  levelWarn: { background: 'var(--dsw-alias-state-warn-tertiary)', color: 'var(--dsw-alias-state-warn-label)', padding: '1px 6px', borderRadius: 4, fontSize: 11 },
  levelErr: { background: 'var(--dsw-alias-state-error-tertiary)', color: 'var(--dsw-alias-state-error-primary)', padding: '1px 6px', borderRadius: 4, fontSize: 11 },
  empty: { padding: '24px 16px', textAlign: 'center' as const, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12.5, lineHeight: 1.6 },
  section: { fontSize: 13.5, fontWeight: 700, margin: '18px 0 8px', color: 'var(--dsw-alias-label-primary)' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12.5, color: 'var(--dsw-alias-label-primary)' },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-tertiary)', fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap' as const },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--dsw-alias-border-l2)', verticalAlign: 'top' as const },
  tdTitle: { fontWeight: 600, maxWidth: 420 },
  tdTime: { whiteSpace: 'nowrap' as const, color: 'var(--dsw-alias-label-tertiary)', fontSize: 11.5 },
  pager: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 },
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

/** 页内通知（替代 window.alert——桌面壳把 alert 路由到 Tauri dialog 插件，
 *  capability ACL 未放行会抛 not allowed by ACL，反馈丢失）。 */
export function boardNotify(message: string): void {
  window.dispatchEvent(new CustomEvent('dsh-task-board:notify', { detail: message }))
}

function BoardToasts(): JSX.Element {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([])
  useEffect(() => {
    let id = 0
    const onNotify = (e: Event): void => {
      const message = (e as CustomEvent<string>).detail
      const entry = { id: ++id, message }
      setToasts(prev => [...prev, entry])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== entry.id)), 6000)
    }
    window.addEventListener('dsh-task-board:notify', onNotify)
    return () => window.removeEventListener('dsh-task-board:notify', onNotify)
  }, [])
  if (toasts.length === 0) return <></>
  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 999 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          maxWidth: 420, padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
          background: 'var(--dsw-alias-bg-layer-2, #fff)', color: 'var(--dsw-alias-label-primary, #222)',
          border: '1px solid var(--dsw-alias-border-l1, #ddd)', boxShadow: '0 6px 18px rgba(0,0,0,.14)',
        }}>{t.message}</div>
      ))}
    </div>
  )
}

function levelStyle(level: string): React.CSSProperties {
  if (level === 'L2' || level === 'L3') return s.levelErr
  if (level === 'L1') return s.levelWarn
  return s.levelOk
}

// ISO(UTC) → 查看者本地时区（存储保持 UTC，仅展示层转换）
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`
}

function BoardPage() {
  const [state, setState] = useState<BoardState | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  // P1+P2 呈现状态
  const [view, setView] = useState<'board' | 'list'>('board')
  const [query, setQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<'全部' | TaskRecord['actionLevel']>('全部')
  const [showArchived, setShowArchived] = useState(false)
  // 详情弹窗（v0.3 交互）：看板/列表点卡片都弹圆角详情卡；按 id 引用 state 内任务，
  // 动作（执行/归档）触发 load() 后弹窗内容随最新状态刷新。
  const [detailId, setDetailId] = useState<string | null>(null)
  const [settledExpanded, setSettledExpanded] = useState<Record<string, boolean>>({})
  const [listPage, setListPage] = useState(1)
  const [listDesc, setListDesc] = useState(true)

  const load = useCallback(async () => {
    const d = await api<{ ok: boolean; state?: BoardState }>('/dsh-task-board/state')
    if (d.ok && d.state !== undefined) setState(d.state)
  }, [])
  useEffect(() => { void load() }, [load])

  const action = useCallback(async (type: string, body: Record<string, unknown>) => {
    const d = await api<{ ok: boolean; error?: string }>('/dsh-task-board/action', { type, ...body })
    if (!d.ok) boardNotify(d.error ?? '操作失败')
    await load()
    return d
  }, [load])

  if (state === null) {
    return <div style={s.wrap}><div style={s.sub}>加载任务看板中…</div></div>
  }

  const q = query.trim().toLowerCase()
  const matches = (t: TaskRecord): boolean => {
    if (levelFilter !== '全部' && t.actionLevel !== levelFilter) return false
    if (q === '') return true
    return t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.prompt.toLowerCase().includes(q)
  }
  const active = state.tasks.filter(t => !t.archived)
  const byCol = (col: Column) => active.filter(t => t.column === col && matches(t))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const archivedList = state.tasks.filter(t => t.archived === true && matches(t))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const listRows = active.filter(matches)
    .sort((a, b) => (listDesc ? b.updatedAt.localeCompare(a.updatedAt) : a.updatedAt.localeCompare(b.updatedAt)))
  const pageCount = Math.max(1, Math.ceil(listRows.length / LIST_PAGE_SIZE))
  const safePage = Math.min(listPage, pageCount)
  const pageRows = listRows.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE)

  const renderCard = (t: TaskRecord, opts: { archived?: boolean } = {}): JSX.Element => {
    return (
      <div
        key={t.id}
        style={{ ...s.card, ...(opts.archived === true ? s.cardArchived : {}), cursor: 'pointer' }}
        onClick={() => setDetailId(t.id)}
        title="点击查看详情"
      >
        <div style={s.cardTitleRow}>
          <span style={s.cardTitle}>{t.title}</span>
          <span style={s.detailBtn}>详情 ›</span>
        </div>
        <div style={s.cardMeta}>
          <span style={levelStyle(t.actionLevel)}>{t.actionLevel}</span>
          {t.cron !== undefined && t.cron !== '' ? <span>⏰ {t.cron}</span> : <span>一次性</span>}
          {t.lastStatus !== undefined ? <span>· {t.lastStatus}</span> : null}
          {opts.archived === true ? <span>· 已归档</span> : null}
        </div>
        <div style={{ ...s.cardActions }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          {/* 按钮跟随任务阶段（主人反馈）：已完成/进行中不显示执行；进行中不显示归档 */}
          {t.column !== '已完成' && t.column !== '进行中' && (
            <button style={s.btn2} onClick={() => void action('run', { id: t.id }).then((d) => {
              // 执行结果反馈（审计 UX L-2）：治理拦截/待审批不再静默无响应
              const run = (d as { run?: { status?: string; summary?: string } }).run
              if (run && (run.status === '已阻断' || run.status === '待审批')) {
                boardNotify(`${run.status}：${run.summary ?? '该任务需要主人批准后才会执行（可在今日待办批准）'}`)
              }
            })}>▶ 执行</button>
          )}
          {t.column === '进行中' && <span style={s.runningHint}>执行中…</span>}
          {t.column !== '进行中' && (opts.archived === true ? (
            <button style={s.btn2} onClick={() => void action('archive', { id: t.id, task: { archived: false } })}>恢复</button>
          ) : (
            <button style={s.btn2} onClick={() => void action('archive', { id: t.id, task: { archived: true } })}>归档</button>
          ))}
        </div>
      </div>
    )
  }

  const renderColumn = (colId: Column): JSX.Element => {
    const list = byCol(colId)
    const label = COLUMNS.find(c => c.id === colId)?.label ?? colId
    const settled = colId === '已完成' || colId === '已失败'
    const visible = settled && settledExpanded[colId] !== true ? list.slice(0, SETTLED_LIMIT) : list
    const rest = list.length - visible.length
    return (
      <div key={colId} style={s.col}>
        <div style={s.colHead}>
          <span>{label}</span>
          <span style={s.colCount}>{list.length}</span>
        </div>
        <div style={s.colBody}>
          {list.length === 0 ? (
            <div style={s.empty}>暂无任务</div>
          ) : (
            <>
              {visible.map(t => renderCard(t))}
              {settled && rest > 0 && (
                <button style={s.moreBtn} onClick={() => setSettledExpanded(prev => ({ ...prev, [colId]: true }))}>
                  展开其余 {rest} 条
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  const renderList = (): JSX.Element => {
    return (
      <div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>任务号</th>
              <th style={s.th}>标题</th>
              <th style={s.th}>级别</th>
              <th style={s.th}>状态</th>
              <th style={s.th}>列</th>
              <th style={{ ...s.th, cursor: 'pointer' }} onClick={() => setListDesc(v => !v)}>
                更新时间 {listDesc ? '↓' : '↑'}
              </th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(t => (
              <tr key={t.id}>
                <td style={s.td}>{t.id}</td>
                <td style={{ ...s.td, ...s.tdTitle }}>
                  <span style={{ ...s.cardTitleRow }} onClick={() => setDetailId(t.id)}>
                    {t.title}
                  </span>
                </td>
                <td style={s.td}><span style={levelStyle(t.actionLevel)}>{t.actionLevel}</span></td>
                <td style={s.td}>{t.lastStatus ?? '—'}</td>
                <td style={s.td}>{t.column}</td>
                <td style={s.tdTime}>{fmtTime(t.updatedAt)}</td>
                <td style={s.td}>
                  <div style={s.cardActions} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    {t.column !== '已完成' && t.column !== '进行中' && <button style={s.btn2} onClick={() => void action('run', { id: t.id })}>▶</button>}
                    {t.column === '进行中' && <span style={s.runningHint}>执行中…</span>}
                    {t.column !== '进行中' && <button style={s.btn2} onClick={() => void action('archive', { id: t.id, task: { archived: !t.archived } })}>{t.archived === true ? '恢复' : '归档'}</button>}
                  </div>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td style={s.td} colSpan={7}><div style={s.empty}>没有匹配的任务</div></td></tr>
            )}
          </tbody>
        </table>
        <div style={s.pager}>
          <span>共 {listRows.length} 条 · 第 {safePage}/{pageCount} 页</span>
          <button style={s.btn2} disabled={safePage <= 1} onClick={() => setListPage(p => Math.max(1, p - 1))}>上一页</button>
          <button style={s.btn2} disabled={safePage >= pageCount} onClick={() => setListPage(p => Math.min(pageCount, p + 1))}>下一页</button>
        </div>
      </div>
    )
  }

  const missingAny = Object.values({}).some(Boolean)

  return (
    <div style={s.wrap}>
      <BoardToasts />
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
        任务中心化——布置 → 账本裁决 → 分身执行 → 自报 → 主人确认。已完成满 7 天自动归档（「含归档」可查）。
      </p>
      <div style={s.actionRow}>
        <button style={s.btn} onClick={() => setShowCreate(true)}>+ 新建任务</button>
        <button style={s.btn2} onClick={() => void load()}>刷新</button>
        <button style={view === 'board' ? s.btn2Active : s.btn2} onClick={() => setView('board')}>看板</button>
        <button style={view === 'list' ? s.btn2Active : s.btn2} onClick={() => { setView('list'); setListPage(1) }}>列表</button>
        <input
          style={s.input}
          placeholder="搜索：任务号 / 标题 / 内容…"
          value={query}
          onChange={(e: React.ChangeEvent) => { setQuery(e.target.value); setListPage(1) }}
        />
        <select
          style={s.select}
          value={levelFilter}
          onChange={(e: React.ChangeEvent) => { setLevelFilter(e.target.value as '全部' | TaskRecord['actionLevel']); setListPage(1) }}
        >
          <option value="全部">全部级别</option>
          {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button style={showArchived ? s.btn2Active : s.btn2} onClick={() => setShowArchived(v => !v)}>
          {showArchived ? '✓ 含归档' : '含归档'}
        </button>
        <span style={s.count}>
          共 {active.length} 个任务{q !== '' || levelFilter !== '全部' ? ` · 匹配 ${listRows.length}` : ''}
        </span>
      </div>

      {view === 'board' ? (
        <div style={s.board}>
          {COLUMNS.map(col => renderColumn(col.id))}
        </div>
      ) : (
        renderList()
      )}

      {showArchived && (
        <>
          <div style={s.section}>归档（{archivedList.length}）——已完成的任务满 7 天自动归档，数据保留可恢复</div>
          {archivedList.length === 0 ? (
            <div style={s.empty}>暂无归档任务</div>
          ) : (
            archivedList.map(t => renderCard(t, { archived: true }))
          )}
        </>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load() }} />}
      {detailId !== null && (() => {
        const task = state.tasks.find(t => t.id === detailId)
        return task === undefined ? null : (
          <TaskDetailModal
            task={task}
            onAction={(type, body) => action(type, body)}
            onClose={() => setDetailId(null)}
          />
        )
      })()}
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [actionType, setActionType] = useState('整理汇报')
  const [targetScope, setTargetScope] = useState('本机')
  const [actionLevel, setActionLevel] = useState<TaskRecord['actionLevel']>('L1')
  const [cron, setCron] = useState('')

  const submit = async (): Promise<void> => {
    const d = await api<{ ok: boolean; error?: string }>('/dsh-task-board/action', {
      type: 'create',
      task: { title, prompt, actionType, targetScope, actionLevel, ...(cron.trim() !== '' ? { cron } : {}) },
    })
    if (!d.ok) { boardNotify(d.error ?? '创建失败'); return }
    onClose()
    onCreated()
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalBox} onClick={(e: React.ChangeEvent) => e.stopPropagation()}>
        <h2 style={s.modalTitle}>新建任务</h2>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>标题（必填）</label>
          <input style={s.modalInput} value={title} onChange={(e: React.ChangeEvent) => setTitle(e.target.value)} />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>执行提示词（必填——执行会话依赖它独立完成工作）</label>
          <textarea style={{ ...s.modalInput, minHeight: 90 }} value={prompt} onChange={(e: React.ChangeEvent) => setPrompt(e.target.value)} />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>动作类型（账本分级依据）</label>
          <input style={s.modalInput} value={actionType} onChange={(e: React.ChangeEvent) => setActionType(e.target.value)} />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>目标范围（账本分级依据）</label>
          <input style={s.modalInput} value={targetScope} onChange={(e: React.ChangeEvent) => setTargetScope(e.target.value)} />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>动作级别</label>
          <select style={s.modalInput} value={actionLevel} onChange={(e: React.ChangeEvent) => setActionLevel(e.target.value as TaskRecord['actionLevel'])}>
            {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {(actionLevel === 'L2' || actionLevel === 'L3') && (
            <div style={s.modalHint}>L2/L3 创建时立即触发裁决：需主人批准后才可执行。</div>
          )}
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>cron（可选，留空=一次性）</label>
          <input style={s.modalInput} value={cron} onChange={(e: React.ChangeEvent) => setCron(e.target.value)} placeholder="如：0 9 * * 1-5" />
        </div>
        <div style={s.modalActions}>
          <button style={s.btn2} onClick={onClose}>取消</button>
          <button style={s.btn} disabled={title.trim() === '' || prompt.trim() === ''} onClick={() => void submit()}>创建</button>
        </div>
      </div>
    </div>
  )
}

/** 运行状态 → 语义色。 */
function runStatusStyle(status: string): React.CSSProperties {
  if (status === '已完成' || status === '成功') return s.runOk
  if (status === '待审批' || status === '待确认') return s.runWarn
  if (status === '已阻断' || status === '已失败' || status === '失败') return s.runErr
  return s.runIdle
}

/**
 * 任务详情弹窗（v0.3 交互，主人拍板）：点看板/列表卡片弹出圆角详情卡，
 * 替代 v0.2 的原地展开——泳道内长卡会把整列撑变形。展示全量字段、执行
 * 提示词、运行历史（最新在上），阶段动作（执行/归档/恢复）就地可用；
 * 动作后 state 刷新，弹窗内容随之更新。ESC / 点遮罩关闭。
 */
function TaskDetailModal({ task, onAction, onClose }: {
  task: TaskRecord
  onAction: (type: string, body: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; run?: unknown }>
  onClose: () => void
}): JSX.Element {
  const lastRun = task.runs.length > 0 ? task.runs[task.runs.length - 1] : undefined
  const runsDesc = [...task.runs].reverse().slice(0, 20)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = (): void => {
    void onAction('run', { id: task.id }).then((d) => {
      const r = (d as { run?: { status?: string; summary?: string } }).run
      if (r && (r.status === '已阻断' || r.status === '待审批')) {
        boardNotify(`${r.status}：${r.summary ?? '该任务需要主人批准后才会执行（可在今日待办批准）'}`)
      }
    })
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.detailModalBox} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div style={s.detailHead}>
          <h2 style={s.detailTitle}>{task.title}</h2>
          <button style={s.detailClose} onClick={onClose} title="关闭（Esc）">×</button>
        </div>
        <div style={s.detailMeta}>
          <span style={{ ...s.detailMetaItem, fontWeight: 700 }}>{task.column}</span>
          <span style={levelStyle(task.actionLevel)}>{task.actionLevel}</span>
          <span style={s.detailMetaItem}>{task.cron !== undefined && task.cron !== '' ? `⏰ ${task.cron}` : '一次性'}</span>
          {task.lastStatus !== undefined ? <span style={s.detailMetaItem}>{task.lastStatus}</span> : null}
          {task.archived === true ? <span style={s.detailMetaItem}>已归档</span> : null}
        </div>
        <div style={s.detailMeta}>
          <span style={s.detailMetaItem}>任务号 {task.id}</span>
          <span style={s.detailMetaItem}>{task.actionType} · {task.targetScope}</span>
          {task.workspaceId !== undefined ? <span style={s.detailMetaItem}>工作区 {task.workspaceId}</span> : null}
          <span style={s.detailMetaItem}>创建 {fmtTime(task.createdAt)}</span>
          <span style={s.detailMetaItem}>更新 {fmtTime(task.updatedAt)}</span>
        </div>

        <div style={s.detailLabel}>执行提示词</div>
        <div style={s.detailPrompt}>{task.prompt}</div>

        {lastRun?.summary !== undefined && lastRun.summary !== '' && (
          <>
            <div style={s.detailLabel}>最近结果</div>
            <div style={s.runSummary}>{lastRun.summary}</div>
          </>
        )}

        <div style={s.detailLabel}>运行历史（{task.runs.length} 次，最新在上）</div>
        {runsDesc.length === 0 ? (
          <div style={s.emptyRuns}>尚未运行过。</div>
        ) : (
          runsDesc.map(r => (
            <div key={r.id} style={s.runItem}>
              <div style={s.runHead}>
                <span style={runStatusStyle(r.status)}>{r.status}</span>
                <span>{fmtTime(r.startedAt)}{r.finishedAt !== undefined ? ` → ${fmtTime(r.finishedAt)}` : ''}</span>
                <span>{r.trigger}</span>
                {r.sessionId !== undefined ? <span>会话 {r.sessionId.slice(0, 8)}…</span> : null}
              </div>
              {r.summary !== undefined && r.summary !== '' ? <div style={s.runSummary}>{r.summary}</div> : null}
            </div>
          ))
        )}

        <div style={s.modalActions}>
          {task.column !== '已完成' && task.column !== '进行中' && (
            <button style={s.btn} onClick={run}>▶ 执行</button>
          )}
          {task.column === '进行中' && <span style={s.runningHint}>执行中…</span>}
          {task.column !== '进行中' && (
            <button style={s.btn2} onClick={() => void onAction('archive', { id: task.id, task: { archived: task.archived !== true } })}>
              {task.archived === true ? '恢复' : '归档'}
            </button>
          )}
          <button style={s.btn2} onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// 宿主客户端模块契约：命名导出 apply + inject 声明（DI 后才可访问 ctx.slots）。
// 注意：不要改成 default activate + slots.register({name…render}) 的形态——
// 那既没有挂进 conversation.view 槽位（看板 Tab 不渲染），也会在 DI 缺失时
// 抛 "cannot get property slots without inject"（2026-09-05 自锁同类事故）。
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      { name: 'conversation.view', id: 'task-board', order: 22, label: () => '任务看板' },
      BoardPage,
    ),
  )
  // 「插件」管理页配置区：只读状态速览（概况/治理徽标/最近完成），完整操作在会话 Tab。
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      { name: 'plugins.bundle.config', key: '@dsh-extra/dsh-task-board' },
      (props: { view: 'summary' | 'page' }) => TaskBoardPluginConfig({ view: props.view }),
    ),
  )
  // alpha.2 全局面板（特性检测双写）：宿主具备 main/sidebar.panellist slot 时，
  // 任务看板同时挂为侧边栏全局面板。alpha.1 无此 slot，静默跳过，零副作用。
  // 新 API 的注册选项在 alpha.1 时代的类型联合里不存在——用显式边界转换，
  // 运行时校验由 alpha.2 宿主完成。
  const slots = ctx.slots as ClientContext['slots'] & { spec?: (name: string) => unknown }
  if (typeof slots.spec !== 'function') return
  try {
    const registerNew = slots.register as unknown as (slot: Record<string, unknown>, component: unknown) => void
    if (slots.spec('main') !== undefined) {
      ctx.slots.inject('main', () =>
        registerNew({ name: 'main', key: 'task-board' }, BoardPage),
      )
    }
    if (slots.spec('sidebar.panellist') !== undefined) {
      ctx.slots.inject('sidebar.panellist', () =>
        registerNew(
          { name: 'sidebar.panellist', id: 'task-board', order: 22, label: () => '任务看板' },
          ({ size, active }: { size: number; active: boolean }) => boardIcon(size, active),
        ),
      )
    }
  } catch { /* 新 API 不可用时静默回退旧注册 */ }
}

/** 侧边栏面板图标（任务看板：三列板），active 时用业务主色。 */
function boardIcon(size: number, active: boolean): JSX.Element {
  const color = active ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-secondary)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="5" height="16" rx="1.2" stroke={color} strokeWidth="2" />
      <rect x="10" y="4" width="5" height="10" rx="1.2" stroke={color} strokeWidth="2" />
      <rect x="17" y="4" width="4" height="13" rx="1.2" stroke={color} strokeWidth="2" />
    </svg>
  )
}


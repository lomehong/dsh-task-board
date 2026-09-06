/**
 * 任务看板客户端（v0.2）：看板/列表双视图 + 折叠卡片 + 沉淀列收纳 + 搜索筛选 +
 * 含归档开关 + 自动归档（服务端：已完成满 7 天归档，本客户端提供「含归档」查看）。
 *
 * 呈现原则（主任拍板的 P1+P2）：看板永远只呈现「当前要关心的活」——
 * 卡片默认折叠（点标题展开 prompt）、沉淀列只显示最近 5 条、已完成满 7 天
 * 自动归档；任务量大时切「列表」视图（表格 + 排序 + 分页）全局检索。
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
  caret: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, flexShrink: 0, marginTop: 2 },
  cardTitle: { fontWeight: 600, fontSize: 13.5, flex: 1 },
  cardMeta: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 11.5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const, margin: '4px 0 6px' },
  cardDesc: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' as const, marginBottom: 6 },
  cardDetail: { borderTop: '1px dashed var(--dsw-alias-border-l2)', marginTop: 6, paddingTop: 6 },
  cardDetailLine: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 2 },
  cardActions: { display: 'flex', gap: 6, marginTop: 8 },
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

function levelStyle(level: string): React.CSSProperties {
  if (level === 'L2' || level === 'L3') return s.levelErr
  if (level === 'L1') return s.levelWarn
  return s.levelOk
}

function fmtTime(iso: string): string {
  return iso.length >= 16 ? iso.slice(0, 16).replace('T', ' ') : iso
}

function BoardPage() {
  const [state, setState] = useState<BoardState | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  // P1+P2 呈现状态
  const [view, setView] = useState<'board' | 'list'>('board')
  const [query, setQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<'全部' | TaskRecord['actionLevel']>('全部')
  const [showArchived, setShowArchived] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
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
    if (!d.ok) alert(d.error ?? '操作失败')
    await load()
    return d
  }, [load])

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

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
    const isOpen = expanded[t.id] === true
    const lastRun = t.runs.length > 0 ? t.runs[t.runs.length - 1] : undefined
    return (
      <div key={t.id} style={{ ...s.card, ...(opts.archived === true ? s.cardArchived : {}) }}>
        <div style={s.cardTitleRow} onClick={() => toggleExpand(t.id)}>
          <span style={s.caret}>{isOpen ? '▾' : '▸'}</span>
          <span style={s.cardTitle}>{t.title}</span>
        </div>
        <div style={s.cardMeta}>
          <span style={levelStyle(t.actionLevel)}>{t.actionLevel}</span>
          {t.cron !== undefined && t.cron !== '' ? <span>⏰ {t.cron}</span> : <span>一次性</span>}
          {t.lastStatus !== undefined ? <span>· {t.lastStatus}</span> : null}
          {opts.archived === true ? <span>· 已归档</span> : null}
        </div>
        {isOpen && (
          <div style={s.cardDetail}>
            <div style={s.cardDesc}>{t.prompt}</div>
            <div style={s.cardDetailLine}>任务号 {t.id} · 更新于 {fmtTime(t.updatedAt)}</div>
            {lastRun?.summary !== undefined && lastRun.summary !== '' && (
              <div style={s.cardDetailLine}>最近结果：{lastRun.summary}</div>
            )}
          </div>
        )}
        <div style={s.cardActions}>
          <button style={s.btn2} onClick={() => void action('run', { id: t.id }).then((d) => {
            // 执行结果反馈（审计 UX L-2）：治理拦截/待审批不再静默无响应
            const run = (d as { run?: { status?: string; summary?: string } }).run
            if (run && (run.status === '已阻断' || run.status === '待审批')) {
              window.alert(`${run.status}：${run.summary ?? '该任务需要主任批准后才会执行（可在今日待办批准）'}`)
            }
          })}>▶ 执行</button>
          {opts.archived === true ? (
            <button style={s.btn2} onClick={() => void action('archive', { id: t.id, task: { archived: false } })}>恢复</button>
          ) : (
            <button style={s.btn2} onClick={() => void action('archive', { id: t.id, task: { archived: true } })}>归档</button>
          )}
        </div>
      </div>
    )
  }

  const renderColumn = (col: Column): JSX.Element => {
    const list = byCol(col.id)
    const settled = col === '已完成' || col === '已失败'
    const visible = settled && settledExpanded[col] !== true ? list.slice(0, SETTLED_LIMIT) : list
    const rest = list.length - visible.length
    return (
      <div key={col} style={s.col}>
        <div style={s.colHead}>
          <span>{col.label}</span>
          <span style={s.colCount}>{list.length}</span>
        </div>
        <div style={s.colBody}>
          {list.length === 0 ? (
            <div style={s.empty}>暂无任务</div>
          ) : (
            <>
              {visible.map(t => renderCard(t))}
              {settled && rest > 0 && (
                <button style={s.moreBtn} onClick={() => setSettledExpanded(prev => ({ ...prev, [col]: true }))}>
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
            {pageRows.map(t => {
              const isOpen = expanded[`list:${t.id}`] === true
              const lastRun = t.runs.length > 0 ? t.runs[t.runs.length - 1] : undefined
              return (
                <>
                  <tr key={t.id}>
                    <td style={s.td}>{t.id}</td>
                    <td style={{ ...s.td, ...s.tdTitle }}>
                      <span style={{ ...s.cardTitleRow }} onClick={() => setExpanded(prev => ({ ...prev, [`list:${t.id}`]: !prev[`list:${t.id}`] }))}>
                        {t.title}
                      </span>
                    </td>
                    <td style={s.td}><span style={levelStyle(t.actionLevel)}>{t.actionLevel}</span></td>
                    <td style={s.td}>{t.lastStatus ?? '—'}</td>
                    <td style={s.td}>{t.column}</td>
                    <td style={s.tdTime}>{fmtTime(t.updatedAt)}</td>
                    <td style={s.td}>
                      <div style={s.cardActions}>
                        <button style={s.btn2} onClick={() => void action('run', { id: t.id })}>▶</button>
                        <button style={s.btn2} onClick={() => void action('archive', { id: t.id, task: { archived: !t.archived } })}>{t.archived === true ? '恢复' : '归档'}</button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${t.id}-detail`}>
                      <td style={s.td} colSpan={7}>
                        <div style={s.cardDesc}>{t.prompt}</div>
                        <div style={s.cardDetailLine}>最近结果：{lastRun?.summary ?? '（无）'}</div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
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
        任务中心化——布置 → 账本裁决 → 分身执行 → 自报 → 主任确认。已完成满 7 天自动归档（「含归档」可查）。
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
          onChange={(e) => { setQuery(e.target.value); setListPage(1) }}
        />
        <select
          style={s.select}
          value={levelFilter}
          onChange={(e) => { setLevelFilter(e.target.value as '全部' | TaskRecord['actionLevel']); setListPage(1) }}
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
    if (!d.ok) { alert(d.error ?? '创建失败'); return }
    onClose()
    onCreated()
  }

  return (
    <div style={s.modal} onClick={() => setShowCreate && onClose()}>
      <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.modalTitle}>新建任务</h2>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>标题（必填）</label>
          <input style={s.modalInput} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>执行提示词（必填——执行会话依赖它独立完成工作）</label>
          <textarea style={{ ...s.modalInput, minHeight: 90 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>动作类型（账本分级依据）</label>
          <input style={s.modalInput} value={actionType} onChange={(e) => setActionType(e.target.value)} />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>目标范围（账本分级依据）</label>
          <input style={s.modalInput} value={targetScope} onChange={(e) => setTargetScope(e.target.value)} />
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>动作级别</label>
          <select style={s.modalInput} value={actionLevel} onChange={(e) => setActionLevel(e.target.value as TaskRecord['actionLevel'])}>
            {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {(actionLevel === 'L2' || actionLevel === 'L3') && (
            <div style={s.modalHint}>L2/L3 创建时立即触发裁决：需主任批准后才可执行。</div>
          )}
        </div>
        <div style={s.modalField}>
          <label style={s.modalFieldLabel}>cron（可选，留空=一次性）</label>
          <input style={s.modalInput} value={cron} onChange={(e) => setCron(e.target.value)} placeholder="如：0 9 * * 1-5" />
        </div>
        <div style={s.modalActions}>
          <button style={s.btn2} onClick={onClose}>取消</button>
          <button style={s.btn} disabled={title.trim() === '' || prompt.trim() === ''} onClick={() => void submit()}>创建</button>
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
}

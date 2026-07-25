import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { updateRow, moveRow, deleteMany } from '../lib/supabase.js'
import { toCSV, downloadCSV } from '../lib/stats.js'
import { matchDate } from '../lib/datefilter.js'
import { normalizeName, DEFAULT_CHANNEL_MAP, DEFAULT_RESULT_RULES } from '../lib/parser.js'
import DateFilter from '../components/DateFilter.jsx'

const PAGE_SIZE = 100 // 한 번에 그리는 행 수 (많은 행을 한꺼번에 그리면 느려짐)

const VIEWS = {
  leads: {
    label: '공급',
    table: 'leads',
    columns: [
      { key: 'report_date', label: '일자', w: 64 },
      { key: 'manager', label: '실장', w: 76 },
      { key: 'channel', label: '채널', w: 90 },
      { key: 'customer_name', label: '고객명', w: 120 },
      { key: 'status_raw', label: '상담 내용', w: 340 },
      { key: 'result_category', label: '분류', w: 90 },
    ],
    filters: [
      { key: 'channel', label: '채널' },
      { key: 'result_category', label: '분류' },
    ],
    selects: new Set(['manager', 'channel', 'result_category']), // 드롭다운으로 편집할 컬럼
  },
  ticketing: {
    label: '티켓팅',
    table: 'ticketing',
    columns: [
      { key: 'report_date', label: '일자', w: 64 },
      { key: 'manager', label: '실장', w: 76 },
      { key: 'customer_name', label: '고객명', w: 100 },
      { key: 'area', label: '부위', w: 100 },
      { key: 'surgeon', label: '집도의', w: 56 },
      { key: 'height', label: '키', w: 44 },
      { key: 'weight', label: '몸무게', w: 52 },
      { key: 'op_date', label: 'op날짜', w: 64 },
      { key: 'pay_type', label: '결제', w: 48 },
      { key: 'amount', label: '금액', w: 60 },
    ],
    filters: [
      { key: 'area', label: '부위' },
      { key: 'surgeon', label: '집도의' },
    ],
    selects: new Set(['manager']), // 티켓팅은 실장만 드롭다운
  },
}

// 셀: 타이핑 중에는 자기 상태만 바꾸고, 입력을 멈춘 뒤(0.6초)나 포커스가 빠질 때만 상위로 알린다.
// → 글자 하나 칠 때마다 표 전체가 다시 그려지는 문제를 없앰.
// options 가 있으면 드롭다운(선택 즉시 저장), 없으면 텍스트 입력(디바운스 저장).
const Cell = memo(function Cell({ rowId, col, value, options, onCommit }) {
  const [draft, setDraft] = useState(value ?? '')
  const timer = useRef(null)
  const pending = useRef(null)      // 저장 대기 중인 값 (없으면 null)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  useEffect(() => { setDraft(value ?? ''); pending.current = null }, [value]) // 외부 변경 반영
  useEffect(() => () => {
    // 언마운트 시 대기 중인 저장이 있으면 마저 저장(디바운스 유실 방지)
    clearTimeout(timer.current)
    if (pending.current != null) commitRef.current(rowId, col.key, pending.current)
  }, [rowId, col.key])

  if (options) {
    // 드롭다운: 선택 즉시 저장
    const list = options.includes(value) || !value ? options : [value, ...options]
    return (
      <select className="cell-in cell-sel" style={{ width: col.w }} value={value ?? ''}
        onChange={(e) => onCommit(rowId, col.key, e.target.value)}>
        <option value="">(비움)</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  function change(v) {
    setDraft(v); pending.current = v
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { pending.current = null; onCommit(rowId, col.key, v) }, 600)
  }
  function blur() {
    clearTimeout(timer.current)
    if (pending.current != null) { pending.current = null; onCommit(rowId, col.key, draft) }
  }
  return (
    <input className="cell-in" style={{ width: col.w }} value={draft}
      onChange={(e) => change(e.target.value)} onBlur={blur} />
  )
})

// 행: 값이 바뀌지 않은 행은 다시 그리지 않음
const Row = memo(function Row({ row, columns, optionsByKey, checked, isDup, onToggle, onCommit }) {
  return (
    <tr className={(isDup ? 'dup ' : '') + (checked ? 'sel' : '')}>
      <td className="chk-col"><input type="checkbox" checked={checked} onChange={() => onToggle(row.id)} /></td>
      {columns.map((c) => (
        <td key={c.key}><Cell rowId={row.id} col={c} value={row[c.key]} options={optionsByKey[c.key]} onCommit={onCommit} /></td>
      ))}
    </tr>
  )
})

export default function Records({ data, onChange }) {
  const [view, setView] = useState('leads')
  const [rows, setRows] = useState([])
  const [mgrFilter, setMgrFilter] = useState('')
  const [colFilters, setColFilters] = useState({}) // 컬럼별 필터: { channel/result_category/area/surgeon → 값 }
  const [q, setQ] = useState('')
  const [dateFilter, setDateFilter] = useState({ from: '', to: '' })
  const [page, setPage] = useState(1)

  const cfg = VIEWS[view]
  const [selected, setSelected] = useState(() => new Set())
  useEffect(() => { setRows(data[view] || []) }, [data, view])
  useEffect(() => { setSelected(new Set()); setColFilters({}) }, [view]) // 탭 전환 시 선택·컬럼필터 초기화

  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows }, [rows])

  const managers = useMemo(() => [...new Set((data[view] || []).map((r) => r.manager).filter(Boolean))].sort(), [data, view])
  const filterOptions = useMemo(() => {
    const m = {}
    for (const f of cfg.filters) m[f.key] = [...new Set((data[view] || []).map((r) => r[f.key]).filter(Boolean))].sort()
    return m
  }, [data, view, cfg])
  const allDates = useMemo(() => (data[view] || []).map((r) => r.report_date), [data, view])

  // 드롭다운 편집용 선택지 (실장/채널/분류). 표준값 + 실제 데이터에 있는 값을 합쳐 누락 방지.
  const optionsByKey = useMemo(() => {
    const distinct = (arr, key) => [...new Set((arr || []).map((r) => r[key]).filter(Boolean))]
    const managers = [...new Set([...distinct(data.leads, 'manager'), ...distinct(data.ticketing, 'manager')])].sort()
    const channels = [...new Set([...Object.values(DEFAULT_CHANNEL_MAP), ...distinct(data.leads, 'channel')])].sort()
    const categories = [...new Set([...DEFAULT_RESULT_RULES.map((r) => r.category), '기타', ...distinct(data.leads, 'result_category')])]
    const all = { manager: managers, channel: channels, result_category: categories }
    const m = {}
    for (const key of cfg.selects || []) m[key] = all[key]
    return m
  }, [data, cfg])

  // 중복 표시(빨간 배경)는 저장된 is_duplicate 값이 아니라 '지금 남아있는 데이터'로 계산한다.
  // → 2건 중 1건을 지우면 남은 1건의 색이 바로 원래대로 돌아온다.
  const dupKeys = useMemo(() => {
    if (view !== 'leads') return new Set()
    const counts = new Map()
    for (const r of rows) {
      const k = normalizeName(r.customer_name)
      if (!k) continue
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k))
  }, [rows, view])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (mgrFilter && r.manager !== mgrFilter) return false
      for (const f of cfg.filters) {
        if (colFilters[f.key] && r[f.key] !== colFilters[f.key]) return false
      }
      if (!matchDate(r.report_date, dateFilter)) return false
      if (q) {
        const hay = cfg.columns.map((c) => r[c.key]).join(' ').toLowerCase()
        if (!hay.includes(q.toLowerCase())) return false
      }
      return true
    }).sort((a, b) => {
      // 최신순: 일자 내림차순 → 같은 날짜면 나중에 입력한 것(큰 id) 위
      const d = String(b.report_date || '').localeCompare(String(a.report_date || ''))
      return d !== 0 ? d : (b.id - a.id)
    })
  }, [rows, mgrFilter, colFilters, q, cfg, dateFilter])

  // 필터가 바뀌면 1페이지로
  useEffect(() => { setPage(1) }, [view, mgrFilter, colFilters, q, dateFilter])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const curPage = Math.min(page, totalPages)
  const pageRows = useMemo(
    () => filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE),
    [filtered, curPage],
  )

  const [saveState, setSaveState] = useState('') // '' | 'saving' | 'saved'

  // 셀 값 확정 → 로컬 반영 + 서버 저장 (값이 그대로면 저장하지 않음)
  const commit = useCallback(async (id, key, value) => {
    const cur = rowsRef.current.find((r) => r.id === id)
    if (cur && (cur[key] ?? '') === value) return
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)))
    setSaveState('saving')
    try {
      await updateRow(cfg.table, id, { [key]: value === '' ? null : value })
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? '' : s)), 1500)
    } catch (e) { setSaveState(''); alert('수정 저장 실패: ' + e.message) }
  }, [cfg.table])

  const moveTarget = view === 'leads' ? 'ticketing' : 'leads'
  const moveLabel = view === 'leads' ? '→ 티켓팅' : '→ 공급'

  // ── 선택(체크박스) ──────────────────────────────────────────────
  const selectedIds = useMemo(() => filtered.filter((r) => selected.has(r.id)).map((r) => r.id), [filtered, selected])
  const allChecked = filtered.length > 0 && selectedIds.length === filtered.length
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allChecked) filtered.forEach((r) => next.delete(r.id))
      else filtered.forEach((r) => next.add(r.id))
      return next
    })
  }
  const toggleOne = useCallback((id) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])
  async function bulkMove() {
    if (!selectedIds.length) return
    if (!confirm(`선택한 ${selectedIds.length}개를 ${view === 'leads' ? '티켓팅' : '공급'}으로 이동할까요?`)) return
    try {
      for (const id of selectedIds) await moveRow(cfg.table, moveTarget, id)
      setSelected(new Set()); onChange && onChange()
    } catch (e) { alert('이동 실패: ' + e.message) }
  }
  async function bulkRemove() {
    if (!selectedIds.length) return
    if (!confirm(`선택한 ${selectedIds.length}개를 삭제할까요?`)) return
    try {
      await deleteMany(cfg.table, selectedIds)
      setSelected(new Set()); onChange && onChange()
    } catch (e) { alert('삭제 실패: ' + e.message) }
  }
  function exportCSV() {
    const csv = toCSV(filtered, cfg.columns)
    downloadCSV(`${cfg.label}_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <div className="page">
      <h2>목록 · 수정</h2>
      <div className="toolbar">
        <div className="seg">
          {Object.entries(VIEWS).map(([id, v]) => (
            <button key={id} className={view === id ? 'seg-btn active' : 'seg-btn'} onClick={() => setView(id)}>{v.label} ({(data[id] || []).length})</button>
          ))}
        </div>
        <DateFilter dates={allDates} value={dateFilter} onChange={setDateFilter} />
        <select value={mgrFilter} onChange={(e) => setMgrFilter(e.target.value)}>
          <option value="">전체 실장</option>
          {managers.map((m) => <option key={m}>{m}</option>)}
        </select>
        {cfg.filters.map((f) => (
          <select key={f.key} value={colFilters[f.key] || ''} onChange={(e) => setColFilters((s) => ({ ...s, [f.key]: e.target.value }))}>
            <option value="">전체 {f.label}</option>
            {(filterOptions[f.key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
        <input className="search" placeholder="검색…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted">{filtered.length}행</span>
        <button className="btn ghost sm" disabled={!selectedIds.length} onClick={bulkMove}>{moveLabel} ({selectedIds.length})</button>
        <button className="btn danger sm" disabled={!selectedIds.length} onClick={bulkRemove}>선택 삭제 ({selectedIds.length})</button>
        {saveState === 'saving' && <span className="save-ind saving">저장 중…</span>}
        {saveState === 'saved' && <span className="save-ind saved">✓ 저장됨</span>}
        <button className="btn ghost" onClick={exportCSV}>⬇ CSV</button>
      </div>

      <div className="scroll-x">
        <table className="grid center-head">
          <thead>
            <tr>
              <th className="chk-col"><input type="checkbox" checked={allChecked} onChange={toggleAll} title="전체 선택(필터된 전체)" /></th>
              {cfg.columns.map((c) => <th key={c.key} style={{ minWidth: c.w }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <Row key={r.id} row={r} columns={cfg.columns} optionsByKey={optionsByKey} checked={selected.has(r.id)}
                isDup={dupKeys.has(normalizeName(r.customer_name))} onToggle={toggleOne} onCommit={commit} />
            ))}
            {filtered.length === 0 && <tr><td colSpan={cfg.columns.length + 1} className="muted center">데이터 없음</td></tr>}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <button className="btn ghost sm" disabled={curPage <= 1} onClick={() => setPage(1)}>« 처음</button>
          <button className="btn ghost sm" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>‹ 이전</button>
          <span className="muted">{curPage} / {totalPages} 페이지 <span className="pager-range">({(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, filtered.length)}행)</span></span>
          <button className="btn ghost sm" disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)}>다음 ›</button>
          <button className="btn ghost sm" disabled={curPage >= totalPages} onClick={() => setPage(totalPages)}>마지막 »</button>
        </div>
      )}
    </div>
  )
}

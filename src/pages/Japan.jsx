import { useEffect, useMemo, useRef, useState } from 'react'
import { updateRow, deleteMany } from '../lib/supabase.js'
import { toCSV, downloadCSV } from '../lib/stats.js'
import { matchDate } from '../lib/datefilter.js'
import DateFilter from '../components/DateFilter.jsx'
import Pager, { usePagination } from '../components/Pager.jsx'

const COLUMNS = [
  { key: 'report_date', label: '일자', w: 64 },
  { key: 'manager', label: '실장', w: 76 },
  { key: 'patient', label: '환자명/번호', w: 150 },
  { key: 'surgeon', label: '집도의', w: 60 },
  { key: 'surgery_date', label: '수술날짜', w: 90 },
  { key: 'deposit', label: '예약금', w: 90 },
  { key: 'cost_parts', label: '부위·비용', w: 160 },
  { key: 'content', label: '내용', w: 320 },
]

export default function Japan({ data, onChange }) {
  const [rows, setRows] = useState([])
  const [mgrFilter, setMgrFilter] = useState('')
  const [dateFilter, setDateFilter] = useState({ from: '', to: '' })
  const [selected, setSelected] = useState(() => new Set())
  useEffect(() => setRows(data.japan || []), [data.japan])

  const managers = useMemo(() => [...new Set((data.japan || []).map((r) => r.manager).filter(Boolean))].sort(), [data.japan])
  const allDates = useMemo(() => (data.japan || []).map((r) => r.report_date), [data.japan])
  const filtered = rows
    .filter((r) => (!mgrFilter || r.manager === mgrFilter) && matchDate(r.report_date, dateFilter))
    // 최신순: 일자 내림차순 → 같은 날짜면 나중에 입력한 것(큰 id) 위
    .sort((a, b) => {
      const d = String(b.report_date || '').localeCompare(String(a.report_date || ''))
      return d !== 0 ? d : (b.id - a.id)
    })

  const pg = usePagination(filtered.length, 'japan_page_size', `${mgrFilter}|${dateFilter.from}|${dateFilter.to}`)
  const pageRows = pg.slice(filtered)

  const timers = useRef({})
  const [saveState, setSaveState] = useState('')
  function editLocal(id, key, value) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)))
    const k = id + ':' + key
    clearTimeout(timers.current[k])
    timers.current[k] = setTimeout(() => persist(id, key, value), 600)
  }
  async function persist(id, key, value) {
    const k = id + ':' + key
    clearTimeout(timers.current[k]); delete timers.current[k]
    setSaveState('saving')
    try {
      await updateRow('japan', id, { [key]: value === '' ? null : value })
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? '' : s)), 1500)
    } catch (e) { setSaveState(''); alert('저장 실패: ' + e.message) }
  }
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
  function toggleOne(id) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  async function bulkRemove() {
    if (!selectedIds.length) return
    if (!confirm(`선택한 ${selectedIds.length}개를 삭제할까요?`)) return
    try {
      await deleteMany('japan', selectedIds)
      setSelected(new Set()); onChange && onChange()
    } catch (e) { alert('삭제 실패: ' + e.message) }
  }

  return (
    <div className="page">
      <h2>일본 상담 <span className="muted">({(data.japan || []).length}건)</span></h2>
      <div className="toolbar">
        <DateFilter dates={allDates} value={dateFilter} onChange={setDateFilter} />
        <select value={mgrFilter} onChange={(e) => setMgrFilter(e.target.value)}>
          <option value="">전체 실장</option>
          {managers.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="muted">{filtered.length}건</span>
        <button className="btn danger sm" disabled={!selectedIds.length} onClick={bulkRemove}>선택 삭제 ({selectedIds.length})</button>
        {saveState === 'saving' && <span className="save-ind saving">저장 중…</span>}
        {saveState === 'saved' && <span className="save-ind saved">✓ 저장됨</span>}
        <button className="btn ghost" onClick={() => downloadCSV(`일본상담_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(filtered, COLUMNS))}>⬇ CSV</button>
      </div>
      <div className="scroll-x">
        <table className="grid">
          <thead><tr>
            <th className="chk-col"><input type="checkbox" checked={allChecked} onChange={toggleAll} title="전체 선택" /></th>
            {COLUMNS.map((c) => <th key={c.key} style={{ minWidth: c.w }}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className={selected.has(r.id) ? 'sel' : ''}>
                <td className="chk-col"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} /></td>
                {COLUMNS.map((c) => (
                  <td key={c.key}>
                    <input className="cell-in" style={{ width: c.w }} value={r[c.key] ?? ''}
                      onChange={(e) => editLocal(r.id, c.key, e.target.value)}
                      onBlur={(e) => persist(r.id, c.key, e.target.value === '' ? null : e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={COLUMNS.length + 1} className="muted center">데이터 없음</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager total={filtered.length} page={pg.page} totalPages={pg.totalPages}
        pageSize={pg.pageSize} setPage={pg.setPage} setPageSize={pg.setPageSize} unit="건" />
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseMD, presetRange, formatRangeLabel } from '../lib/datefilter.js'

// value: { from: 'MM-DD'|'', to: 'MM-DD'|'' }
const YEAR = new Date().getFullYear()
const pad = (n) => String(n).padStart(2, '0')
const mdKey = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtMD = (md) => { const d = parseMD(md); return d ? `${d.getMonth() + 1}/${d.getDate()}` : md }

const PRESETS = [
  ['today', '오늘'], ['yesterday', '어제'],
  ['last7', '최근 7일(오늘 포함)'], ['last7excl', '최근 7일(오늘 제외)'],
  ['thisWeek', '이번주'], ['lastWeek', '지난주'],
  ['thisMonth', '이번달'], ['lastMonth', '지난달'],
  ['last30', '최근 30일(오늘 포함)'], ['last30excl', '최근 30일(오늘 제외)'],
  ['all', '전체'],
]
const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function DateFilter({ dates, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ from: '', to: '' })
  const [view, setView] = useState(() => new Date(YEAR, new Date().getMonth(), 1))
  const rootRef = useRef(null)

  const dataDays = useMemo(() => new Set((dates || []).map((md) => (md || '').trim()).filter(Boolean)), [dates])

  function openPopover() {
    const v = value || { from: '', to: '' }
    setDraft({ from: v.from || '', to: v.to || '' })
    const anchor = parseMD(v.to) || parseMD(v.from) || new Date(YEAR, new Date().getMonth(), 1)
    setView(new Date(YEAR, anchor.getMonth(), 1))
    setOpen(true)
  }

  // 바깥 클릭 시 닫기(취소와 동일 — 반영 안 함)
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function pickPreset(id) {
    const r = presetRange(id)
    setDraft(r)
    const anchor = parseMD(r.to) || parseMD(r.from)
    if (anchor) setView(new Date(YEAR, anchor.getMonth(), 1))
  }

  function clickDay(d) {
    const md = mdKey(d)
    // 시작이 없거나 이미 범위가 완성된 상태면 → 새 시작
    if (!draft.from || draft.to) { setDraft({ from: md, to: '' }); return }
    // 시작보다 앞을 찍으면 시작 재설정, 아니면 끝으로 확정
    if (parseMD(md) < parseMD(draft.from)) setDraft({ from: md, to: '' })
    else setDraft({ from: draft.from, to: md })
  }

  function apply() { onChange({ from: draft.from, to: draft.to }); setOpen(false) }

  const m = view.getMonth()
  const lead = new Date(YEAR, m, 1).getDay()
  const dim = new Date(YEAR, m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let day = 1; day <= dim; day++) cells.push(new Date(YEAR, m, day))

  const from = parseMD(draft.from), to = parseMD(draft.to)
  const todayKey = mdKey(new Date())

  function cellClass(d) {
    const t = d.getTime()
    const isEnd = (from && t === from.getTime()) || (to && t === to.getTime())
    const inRange = from && to && t >= from.getTime() && t <= to.getTime()
    let c = 'df-cell'
    if (inRange) c += ' in-range'
    if (isEnd) c += ' endpoint'
    if (mdKey(d) === todayKey) c += ' today'
    if (dataDays.has(mdKey(d))) c += ' has-data'
    return c
  }

  return (
    <div className="datefilter" ref={rootRef}>
      <button className="df-trigger" onClick={() => (open ? setOpen(false) : openPopover())}>
        📅 <span className="df-label">{formatRangeLabel(value)}</span> <span className="df-caret">▾</span>
      </button>

      {open && (
        <div className="df-pop">
          <div className="df-head">
            <span className="df-range-txt">{draft.from ? fmtMD(draft.from) : '시작'}</span>
            <span className="df-arrow">→</span>
            <span className="df-range-txt">{draft.to ? fmtMD(draft.to) : '끝'}</span>
          </div>

          <div className="df-body">
            <div className="df-presets">
              {PRESETS.map(([id, label]) => (
                <button key={id} className="df-preset" onClick={() => pickPreset(id)}>{label}</button>
              ))}
            </div>

            <div className="df-cal">
              <div className="df-cal-head">
                <button className="df-nav" onClick={() => setView(new Date(YEAR, m - 1, 1))}>‹</button>
                <span>{YEAR}년 {m + 1}월</span>
                <button className="df-nav" onClick={() => setView(new Date(YEAR, m + 1, 1))}>›</button>
              </div>
              <div className="df-dow">{DOW.map((w) => <span key={w}>{w}</span>)}</div>
              <div className="df-grid">
                {cells.map((d, i) => (d
                  ? <button key={i} className={cellClass(d)} onClick={() => clickDay(d)}>{d.getDate()}</button>
                  : <span key={i} className="df-cell empty" />))}
              </div>
            </div>
          </div>

          <div className="df-foot">
            <button className="btn ghost sm" onClick={() => setOpen(false)}>취소</button>
            <button className="btn primary sm" onClick={apply}>확인</button>
          </div>
        </div>
      )}
    </div>
  )
}

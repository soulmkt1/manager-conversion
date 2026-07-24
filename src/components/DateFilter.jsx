import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parseMD, presetRange, precedingRange, formatRangeLabel } from '../lib/datefilter.js'

// value: { from, to, cmpFrom, cmpTo }  — cmpFrom/cmpTo 는 '기간 비교'용(대쉬보드에서만 사용)
const YEAR = new Date().getFullYear()
const pad = (n) => String(n).padStart(2, '0')
const mdKey = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtFull = (md) => { const d = parseMD(md); return d ? `${YEAR}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}.` : '' }

const PRESETS = [
  ['today', '오늘'], ['yesterday', '어제'],
  ['thisWeek', '이번주'], ['lastWeek', '지난주'],
  ['last7', '최근 7일(오늘 포함)'], ['last7excl', '최근 7일(오늘 제외)'],
  ['thisMonth', '이번달'], ['lastMonth', '지난달'],
  ['last30', '최근 30일(오늘 포함)'], ['last30excl', '최근 30일(오늘 제외)'],
  ['all', '전체'],
]
const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function DateFilter({ dates, value, onChange, showCompare = false }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ from: '', to: '', cmpFrom: '', cmpTo: '' })
  const [cmpOn, setCmpOn] = useState(false)
  const [cmpAuto, setCmpAuto] = useState(true) // 사용자가 비교기간을 직접 건드리기 전까지는 자동(직전 동일기간)
  const [active, setActive] = useState('main') // 달력 클릭이 적용될 대상: 'main' | 'cmp'
  const [view, setView] = useState(() => new Date(YEAR, new Date().getMonth(), 1))
  const rootRef = useRef(null)
  const popRef = useRef(null)

  const dataDays = useMemo(() => new Set((dates || []).map((md) => (md || '').trim()).filter(Boolean)), [dates])

  function openPopover() {
    const v = value || {}
    setDraft({ from: v.from || '', to: v.to || '', cmpFrom: v.cmpFrom || '', cmpTo: v.cmpTo || '' })
    setCmpOn(!!(v.cmpFrom && v.cmpTo))
    setCmpAuto(!(v.cmpFrom && v.cmpTo))
    setActive('main')
    const anchor = parseMD(v.to) || parseMD(v.from) || new Date(YEAR, new Date().getMonth(), 1)
    setView(new Date(YEAR, Math.min(anchor.getMonth(), 10), 1))
    setOpen(true)
  }

  // 바깥 클릭 시 닫기(취소와 동일 — 반영 안 함)
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // 팝오버가 화면 밖으로 나가지 않도록 위치 보정
  // (기간 선택 버튼이 화면 오른쪽에 있으면 팝오버가 오른쪽으로 넘쳐 '확인' 버튼이 안 보였음)
  useLayoutEffect(() => {
    if (!open) return
    function fit() {
      const el = popRef.current
      if (!el) return
      const MARGIN = 12
      // 가로 스크롤이 있을 수 있어 window.innerWidth 대신 '실제로 보이는 너비'를 쓴다
      const visibleWidth = document.documentElement.clientWidth
      el.style.left = '0px'
      el.style.maxWidth = `${Math.max(280, visibleWidth - MARGIN * 2)}px` // 화면보다 넓어지지 않게
      const r = el.getBoundingClientRect()
      let shift = 0
      const overRight = r.right - (visibleWidth - MARGIN)
      if (overRight > 0) shift = -overRight            // 오른쪽으로 넘치면 왼쪽으로 당김
      if (r.left + shift < MARGIN) shift = MARGIN - r.left // 그래도 왼쪽으로 넘치면 다시 밀어냄
      el.style.left = `${shift}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open, showCompare, cmpOn])

  // 비교 ON + 자동모드면 주 기간의 '직전 동일기간'을 비교기간으로 채움
  useEffect(() => {
    if (!cmpOn || !cmpAuto) return
    const p = precedingRange({ from: draft.from, to: draft.to })
    setDraft((d) => ({ ...d, cmpFrom: p?.from || '', cmpTo: p?.to || '' }))
  }, [draft.from, draft.to, cmpOn, cmpAuto])

  function pickPreset(id) {
    const r = presetRange(id)
    setDraft((d) => ({ ...d, from: r.from, to: r.to }))
    setActive('main')
    const anchor = parseMD(r.to) || parseMD(r.from)
    if (anchor) setView(new Date(YEAR, Math.min(anchor.getMonth(), 10), 1))
  }

  function clickDay(d) {
    const md = mdKey(d)
    const [fk, tk] = active === 'main' ? ['from', 'to'] : ['cmpFrom', 'cmpTo']
    setDraft((prev) => {
      const f = prev[fk], t = prev[tk]
      if (!f || t) return { ...prev, [fk]: md, [tk]: '' }          // 새 시작
      if (parseMD(md) < parseMD(f)) return { ...prev, [fk]: md, [tk]: '' } // 시작보다 앞 → 시작 재설정
      return { ...prev, [fk]: f, [tk]: md }                         // 끝 확정
    })
    if (active === 'cmp') setCmpAuto(false)
  }

  function toggleCompare() {
    if (cmpOn) { setCmpOn(false); setCmpAuto(true); setActive('main'); setDraft((d) => ({ ...d, cmpFrom: '', cmpTo: '' })) }
    else { setCmpOn(true); setCmpAuto(true) }
  }

  function apply() {
    onChange({
      from: draft.from, to: draft.to,
      cmpFrom: cmpOn ? draft.cmpFrom : '', cmpTo: cmpOn ? draft.cmpTo : '',
    })
    setOpen(false)
  }

  // 달력 2개월치 셀 만들기
  const shiftMonth = (n) => setView((v) => new Date(YEAR, Math.max(0, Math.min(10, v.getMonth() + n)), 1))
  function monthCells(m) {
    const lead = new Date(YEAR, m, 1).getDay()
    const dim = new Date(YEAR, m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < lead; i++) cells.push(null)
    for (let day = 1; day <= dim; day++) cells.push(new Date(YEAR, m, day))
    return cells
  }

  const from = parseMD(draft.from), to = parseMD(draft.to)
  const cFrom = parseMD(draft.cmpFrom), cTo = parseMD(draft.cmpTo)
  const todayKey = mdKey(new Date())

  function cellClass(d) {
    const t = d.getTime()
    let c = 'df-cell'
    if (from && to && t >= from.getTime() && t <= to.getTime()) c += ' in-range'
    if ((from && t === from.getTime()) || (to && t === to.getTime())) c += ' endpoint'
    if (cmpOn) {
      if (cFrom && cTo && t >= cFrom.getTime() && t <= cTo.getTime()) c += ' cmp-range'
      if ((cFrom && t === cFrom.getTime()) || (cTo && t === cTo.getTime())) c += ' cmp-endpoint'
    }
    if (mdKey(d) === todayKey) c += ' today'
    if (dataDays.has(mdKey(d))) c += ' has-data'
    return c
  }

  const DateBox = ({ which, field, placeholder }) => (
    <button
      className={'df-datebox' + (active === which && open ? ' active' : '')}
      onClick={() => setActive(which)}
    >{fmtFull(draft[field]) || placeholder}</button>
  )

  return (
    <div className="datefilter" ref={rootRef}>
      <button className="df-trigger" onClick={() => (open ? setOpen(false) : openPopover())}>
        📅 <span className="df-label">{formatRangeLabel(value)}</span> <span className="df-caret">▾</span>
      </button>

      {open && (
        <div className={'df-pop' + (showCompare ? ' with-compare' : '')} ref={popRef}>
          <div className="df-body">
            <div className="df-presets">
              {PRESETS.map(([id, label]) => (
                <button key={id} className="df-preset" onClick={() => pickPreset(id)}>{label}</button>
              ))}
            </div>

            <div className="df-right">
              <div className="df-ranges">
                <div className="df-range-row">
                  <DateBox which="main" field="from" placeholder="시작" />
                  <span className="df-arrow">→</span>
                  <DateBox which="main" field="to" placeholder="끝" />
                </div>
                {showCompare && cmpOn && (
                  <>
                    <div className="df-cmp-title">기간 비교</div>
                    <div className="df-range-row">
                      <DateBox which="cmp" field="cmpFrom" placeholder="시작" />
                      <span className="df-arrow">→</span>
                      <DateBox which="cmp" field="cmpTo" placeholder="끝" />
                    </div>
                  </>
                )}
              </div>

              <div className="df-cal-head">
                <button className="df-nav" title="3개월 앞으로" onClick={() => shiftMonth(-3)}>«</button>
                <button className="df-nav" title="이전 달" onClick={() => shiftMonth(-1)}>‹</button>
                <span>{YEAR}년 {pad(view.getMonth() + 1)}월</span>
                <button className="df-nav" title="다음 달" onClick={() => shiftMonth(1)}>›</button>
                <button className="df-nav" title="3개월 뒤로" onClick={() => shiftMonth(3)}>»</button>
              </div>

              <div className="df-cal-scroll">
                {[view.getMonth(), view.getMonth() + 1].filter((m) => m <= 11).map((m) => (
                  <div className="df-month" key={m}>
                    <div className="df-month-title">{YEAR}년 {pad(m + 1)}월</div>
                    <div className="df-dow">{DOW.map((w) => <span key={w}>{w}</span>)}</div>
                    <div className="df-grid">
                      {monthCells(m).map((d, i) => (d
                        ? <button key={i} className={cellClass(d)} onClick={() => clickDay(d)}>{d.getDate()}</button>
                        : <span key={i} className="df-cell empty" />))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="df-foot">
            {showCompare && (
              <label className="df-switch-wrap" title="선택한 기간을 다른 기간과 비교합니다">
                <span>기간 비교</span>
                <span className={'df-switch' + (cmpOn ? ' on' : '')} onClick={toggleCompare} role="switch" aria-checked={cmpOn}>
                  <span className="df-switch-knob" />
                </span>
              </label>
            )}
            <div className="df-foot-btns">
              <button className="btn ghost sm" onClick={() => setOpen(false)}>취소</button>
              <button className="btn primary sm" onClick={apply}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

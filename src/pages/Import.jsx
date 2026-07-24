import { useEffect, useState } from 'react'
import { parseReport, markDuplicates } from '../lib/parser.js'
import { insertMany, fetchAll } from '../lib/supabase.js'
import { loadConfig } from '../lib/settings.js'

const RESULT_OPTIONS = ['내상·예약', '진행중', '부재', '취소', '중복', '기타']

export default function Import({ onSaved }) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState(null)
  const [conflict, setConflict] = useState(null) // { keys: ['06-29|이성희', ...] }

  useEffect(() => { loadConfig().then(setConfig) }, [])

  function analyze() {
    const r = parseReport(text, config || {})
    setParsed(r)
    setMsg('')
    setConflict(null)
  }

  function upd(table, i, field, value) {
    setParsed((p) => {
      const next = { ...p, [table]: p[table].map((row, idx) => (idx === i ? { ...row, [field]: value } : row)) }
      if (table === 'supply') markDuplicates(next.supply)
      return next
    })
  }
  function removeRow(table, i) {
    setParsed((p) => ({ ...p, [table]: p[table].filter((_, idx) => idx !== i) }))
  }

  // 저장 (이중 입력 검사 포함). p를 넘기면 그 데이터로 저장.
  async function save() {
    if (!parsed) return
    setBusy(true)
    setMsg('')
    try {
      // 이미 저장된 보고서(일자+실장)와 겹치는지 확인
      const existing = await fetchAll('summary')
      const existKeys = new Set(existing.map((s) => `${s.report_date}|${s.manager}`))
      const dupKeys = [...new Set(parsed.summary.map((s) => `${s.report_date}|${s.manager}`))]
        .filter((k) => existKeys.has(k))
      if (dupKeys.length > 0) {
        setConflict({ keys: dupKeys })
        setBusy(false)
        return
      }
      await doSave(parsed)
    } catch (e) {
      setMsg('❌ 저장 실패: ' + (e.message || e))
      setBusy(false)
    }
  }

  // 겹치는 보고서(일자+실장)를 빼고 저장
  async function saveExcludingConflicts() {
    const skip = new Set(conflict.keys)
    const keep = (r) => !skip.has(`${r.report_date}|${r.manager}`)
    const p = {
      supply: parsed.supply.filter(keep),
      ticketing: parsed.ticketing.filter(keep),
      summary: parsed.summary.filter(keep),
      japan: parsed.japan.filter(keep),
      recall: parsed.recall.filter(keep),
    }
    setBusy(true)
    try { await doSave(p) } catch (e) { setMsg('❌ 저장 실패: ' + (e.message || e)); setBusy(false) }
  }

  // 중복 감수하고 전부 저장
  async function saveAnyway() {
    setBusy(true)
    try { await doSave(parsed) } catch (e) { setMsg('❌ 저장 실패: ' + (e.message || e)); setBusy(false) }
  }

  async function doSave(p) {
    const clean = (rows, keys) => rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null])))
    await insertMany('leads', clean(p.supply, ['report_date', 'manager', 'channel', 'customer_name', 'status_raw', 'result_category', 'is_duplicate', 'note']))
    await insertMany('ticketing', clean(p.ticketing, ['report_date', 'manager', 'customer_name', 'area', 'surgeon', 'height', 'weight', 'op_date', 'pay_type', 'amount', 'raw']))
    await insertMany('summary', clean(p.summary, ['report_date', 'manager', 'supply_count', 'ticket_count', 'visit_count', 'chart_status']))
    await insertMany('japan', clean(p.japan, ['report_date', 'manager', 'patient', 'surgeon', 'surgery_date', 'deposit', 'cost_parts', 'content']))
    await insertMany('recall', clean(p.recall, ['report_date', 'manager', 'customer_name']))
    setMsg(`✅ 저장 완료: 공급 ${p.supply.length} · 티켓팅 ${p.ticketing.length} · 요약 ${p.summary.length} · 일본 ${p.japan.length} · 리콜 ${p.recall.length}`)
    setParsed(null)
    setText('')
    setConflict(null)
    setBusy(false)
    onSaved && onSaved()
  }

  return (
    <div className="page">
      <h2>보고서 입력</h2>
      <p className="muted">보고서 텍스트를 그대로 붙여넣고 <b>분석</b>을 누르면 자동으로 표로 정리됩니다.
        표에서 실장·채널·분류·중복을 고친 뒤 <b>저장</b>하세요.</p>

      <textarea
        className="paste-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="여기에 한 주 보고서 전체를 붙여넣으세요…"
      />
      <div className="row-actions">
        <button className="btn primary" onClick={analyze} disabled={!text.trim()}>분석</button>
        {parsed && <button className="btn" onClick={() => { setParsed(null); setMsg('') }}>초기화</button>}
        {parsed && <button className="btn success" onClick={save} disabled={busy}>{busy ? '저장 중…' : '💾 저장'}</button>}
      </div>

      {msg && <div className="banner info">{msg}</div>}

      {conflict && (
        <div className="banner warn">
          <div><b>⚠ 이미 저장된 보고서와 겹칩니다:</b> {conflict.keys.map((k) => k.replace('|', ' ')).join(', ')}</div>
          <div className="muted" style={{ margin: '6px 0' }}>같은 보고서를 두 번 저장하면 통계가 부풀려집니다. 어떻게 할까요?</div>
          <div className="row-actions">
            <button className="btn primary" onClick={saveExcludingConflicts} disabled={busy}>겹치는 보고서 빼고 저장 (추천)</button>
            <button className="btn" onClick={saveAnyway} disabled={busy}>중복 감수하고 모두 저장</button>
            <button className="btn ghost" onClick={() => setConflict(null)}>취소</button>
          </div>
        </div>
      )}

      {parsed?.warnings?.length > 0 && (
        <div className="banner warn">⚠ {parsed.warnings.join(' / ')}</div>
      )}

      {parsed && (
        <div className="review">
          <div className="review-summary">
            공급 <b>{parsed.supply.length}</b> · 티켓팅 <b>{parsed.ticketing.length}</b> ·
            요약(실장·일자) <b>{parsed.summary.length}</b> · 일본상담 <b>{parsed.japan.length}</b> ·
            리콜 <b>{parsed.recall.length}</b>
          </div>

          {/* 요약(선언값) */}
          <Section title={`요약 — 보고서 머리글 선언값 (${parsed.summary.length})`}>
            <table className="grid">
              <thead><tr><th>일자</th><th>실장</th><th>선언공급</th><th>선언티켓</th><th>내원</th><th>전자차트</th><th></th></tr></thead>
              <tbody>
                {parsed.summary.map((r, i) => (
                  <tr key={i}>
                    <td><In v={r.report_date} on={(v) => upd('summary', i, 'report_date', v)} w={60} /></td>
                    <td><In v={r.manager} on={(v) => upd('summary', i, 'manager', v)} w={70} /></td>
                    <td><In v={r.supply_count} on={(v) => upd('summary', i, 'supply_count', num(v))} w={50} /></td>
                    <td><In v={r.ticket_count} on={(v) => upd('summary', i, 'ticket_count', num(v))} w={50} /></td>
                    <td><In v={r.visit_count} on={(v) => upd('summary', i, 'visit_count', num(v))} w={45} /></td>
                    <td><In v={r.chart_status} on={(v) => upd('summary', i, 'chart_status', v)} w={55} /></td>
                    <td><Del on={() => removeRow('summary', i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* 공급 */}
          <Section title={`공급 (${parsed.supply.length})`} defaultOpen>
            <table className="grid">
              <thead><tr><th>일자</th><th>실장</th><th>채널</th><th>고객명</th><th>상태(원문)</th><th>결과분류</th><th>중복</th><th></th></tr></thead>
              <tbody>
                {parsed.supply.map((r, i) => (
                  <tr key={i} className={r.is_duplicate ? 'dup' : ''}>
                    <td><In v={r.report_date} on={(v) => upd('supply', i, 'report_date', v)} w={60} /></td>
                    <td><In v={r.manager} on={(v) => upd('supply', i, 'manager', v)} w={70} /></td>
                    <td><In v={r.channel} on={(v) => upd('supply', i, 'channel', v)} w={80} /></td>
                    <td><In v={r.customer_name} on={(v) => upd('supply', i, 'customer_name', v)} w={110} /></td>
                    <td><In v={r.status_raw} on={(v) => upd('supply', i, 'status_raw', v)} w={200} /></td>
                    <td>
                      <select value={r.result_category} onChange={(e) => upd('supply', i, 'result_category', e.target.value)}>
                        {RESULT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="center"><input type="checkbox" checked={!!r.is_duplicate} onChange={(e) => upd('supply', i, 'is_duplicate', e.target.checked)} /></td>
                    <td><Del on={() => removeRow('supply', i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* 티켓팅 */}
          <Section title={`티켓팅 (${parsed.ticketing.length})`} defaultOpen>
            <table className="grid">
              <thead><tr><th>일자</th><th>실장</th><th>고객명</th><th>부위</th><th>집도의</th><th>키</th><th>몸무게</th><th>op날짜</th><th>결제</th><th>금액</th><th></th></tr></thead>
              <tbody>
                {parsed.ticketing.map((r, i) => (
                  <tr key={i}>
                    <td><In v={r.report_date} on={(v) => upd('ticketing', i, 'report_date', v)} w={60} /></td>
                    <td><In v={r.manager} on={(v) => upd('ticketing', i, 'manager', v)} w={70} /></td>
                    <td><In v={r.customer_name} on={(v) => upd('ticketing', i, 'customer_name', v)} w={90} /></td>
                    <td><In v={r.area} on={(v) => upd('ticketing', i, 'area', v)} w={90} /></td>
                    <td><In v={r.surgeon} on={(v) => upd('ticketing', i, 'surgeon', v)} w={45} /></td>
                    <td><In v={r.height} on={(v) => upd('ticketing', i, 'height', num(v))} w={40} /></td>
                    <td><In v={r.weight} on={(v) => upd('ticketing', i, 'weight', num(v))} w={45} /></td>
                    <td><In v={r.op_date} on={(v) => upd('ticketing', i, 'op_date', v)} w={55} /></td>
                    <td><In v={r.pay_type} on={(v) => upd('ticketing', i, 'pay_type', v)} w={45} /></td>
                    <td><In v={r.amount} on={(v) => upd('ticketing', i, 'amount', v)} w={55} /></td>
                    <td><Del on={() => removeRow('ticketing', i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {parsed.japan.length > 0 && (
            <Section title={`일본상담 (${parsed.japan.length}) — 저장 후 일본상담 탭에서 확인/수정`}>
              <ul className="preview-list">
                {parsed.japan.map((r, i) => <li key={i}><b>{r.patient || '(무명)'}</b> · {r.surgery_date} · {r.surgeon} <span className="muted">{r.content?.slice(0, 60)}</span></li>)}
              </ul>
            </Section>
          )}
          {parsed.recall.length > 0 && (
            <Section title={`리콜 (${parsed.recall.length})`}>
              <div className="chips">{parsed.recall.map((r, i) => <span key={i} className="chip">{r.manager}·{r.customer_name}</span>)}</div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function num(v) {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

function In({ v, on, w }) {
  return <input className="cell-in" style={{ width: w }} value={v ?? ''} onChange={(e) => on(e.target.value)} />
}
function Del({ on }) {
  return <button className="del-btn" title="삭제" onClick={on}>✕</button>
}
function Section({ title, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="section">
      <button className="section-head" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {title}</button>
      {open && <div className="section-body scroll-x">{children}</div>}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { saveSettings, updateRow, fetchTrash, restoreRow } from '../lib/supabase.js'
import { loadConfig, defaultConfig, mapToRows, rowsToMap } from '../lib/settings.js'
import { reparseLead } from '../lib/parser.js'

export default function Settings({ data, onChange }) {
  const [sub, setSub] = useState('channel') // 'channel' | 'trash'
  const [channelRows, setChannelRows] = useState([])
  const [rules, setRules] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadConfig().then((cfg) => {
      setChannelRows(mapToRows(cfg.channelMap))
      setRules(cfg.resultRules)
    })
  }, [])

  const currentConfig = () => ({ channelMap: rowsToMap(channelRows), resultRules: rules })

  // ── 채널 매핑 ──
  const setCh = (i, key, v) => setChannelRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)))
  const addCh = () => setChannelRows((rs) => [...rs, { token: '', label: '' }])
  const delCh = (i) => setChannelRows((rs) => rs.filter((_, idx) => idx !== i))

  // ── 결과분류 키워드 ──
  const addKw = (ci, kw) => {
    const w = (kw || '').trim()
    if (!w) return
    setRules((rs) => rs.map((r, idx) => (idx === ci && !r.keywords.includes(w) ? { ...r, keywords: [...r.keywords, w] } : r)))
  }
  const delKw = (ci, ki) => setRules((rs) => rs.map((r, idx) => (idx === ci ? { ...r, keywords: r.keywords.filter((_, k) => k !== ki) } : r)))

  async function save() {
    setBusy(true); setMsg('')
    try {
      await saveSettings(currentConfig())
      setMsg('✅ 설정을 저장했습니다. 다음 입력부터 적용됩니다.')
    } catch (e) { setMsg('❌ 저장 실패: ' + e.message) }
    finally { setBusy(false) }
  }

  function resetDefault() {
    if (!confirm('기본값으로 되돌릴까요? (저장 전까지는 반영 안 됨)')) return
    const d = defaultConfig()
    setChannelRows(mapToRows(d.channelMap))
    setRules(d.resultRules)
  }

  // 기존 저장된 공급 데이터에 현재 규칙 다시 적용
  async function reapply() {
    const cfg = currentConfig()
    const leads = data.leads || []
    if (!confirm(`저장된 공급 ${leads.length}건에 현재 규칙을 다시 적용할까요?\n(먼저 위에서 저장을 권장합니다)`)) return
    setBusy(true); setMsg('적용 중…')
    let changed = 0
    try {
      for (const lead of leads) {
        const rp = reparseLead(lead.customer_name, lead.status_raw, lead.channel, cfg)
        const patch = {}
        if (rp.channel !== (lead.channel || '')) patch.channel = rp.channel
        if (rp.customer_name !== lead.customer_name) patch.customer_name = rp.customer_name
        if (rp.status_raw !== (lead.status_raw || '')) patch.status_raw = rp.status_raw
        if (rp.result_category !== lead.result_category) patch.result_category = rp.result_category
        if (Object.keys(patch).length) { await updateRow('leads', lead.id, patch); changed++ }
      }
      setMsg(`✅ 완료: ${changed}건 정리됨`)
      onChange && onChange()
    } catch (e) { setMsg('❌ 적용 실패: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="page">
      <h2>관리 · 규칙 설정</h2>
      <div className="seg">
        <button className={sub === 'channel' ? 'seg-btn active' : 'seg-btn'} onClick={() => setSub('channel')}>채널 매핑</button>
        <button className={sub === 'trash' ? 'seg-btn active' : 'seg-btn'} onClick={() => setSub('trash')}>삭제 데이터</button>
      </div>

      {sub === 'channel' && (
        <>
          <p className="muted">채널 매핑과 결과분류 키워드를 직접 정할 수 있습니다. 저장하면 <b>다음 입력부터</b> 적용되며,
            <b>기존 데이터에 다시 적용</b> 버튼으로 이미 저장된 공급 데이터도 한 번에 정리할 수 있습니다.</p>

          <div className="row-actions">
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? '처리 중…' : '💾 설정 저장'}</button>
            <button className="btn success" onClick={reapply} disabled={busy}>♻ 기존 공급 데이터에 다시 적용</button>
            <button className="btn ghost" onClick={resetDefault} disabled={busy}>기본값으로</button>
          </div>
          {msg && <div className="banner info">{msg}</div>}

          <div className="card">
            <h3>채널 매핑 <span className="muted">— 고객명 옆의 '지','플' 같은 출처 표시 → 채널명</span></h3>
            <table className="grid" style={{ maxWidth: 480 }}>
              <thead><tr><th>표시(토큰)</th><th>→ 채널명</th><th></th></tr></thead>
              <tbody>
                {channelRows.map((r, i) => (
                  <tr key={i}>
                    <td><input className="cell-in" style={{ width: 90 }} value={r.token} onChange={(e) => setCh(i, 'token', e.target.value)} placeholder="예: 지" /></td>
                    <td><input className="cell-in" style={{ width: 160 }} value={r.label} onChange={(e) => setCh(i, 'label', e.target.value)} placeholder="예: 지오" /></td>
                    <td><button className="del-btn" onClick={() => delCh(i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn" onClick={addCh}>+ 채널 추가</button>
          </div>

          <div className="card">
            <h3>결과분류 규칙 <span className="muted">— 상태 문구에 이 단어가 들어가면 해당 분류 (위에서부터 우선)</span></h3>
            {rules.map((rule, ci) => (
              <div className="rule-block" key={rule.category}>
                <div className="rule-cat">{rule.category}</div>
                <div className="chips">
                  {rule.keywords.map((kw, ki) => (
                    <span key={ki} className="chip kw">{kw}<button className="chip-x" onClick={() => delKw(ci, ki)}>×</button></span>
                  ))}
                  <KwAdd onAdd={(w) => addKw(ci, w)} />
                </div>
              </div>
            ))}
            <p className="muted" style={{ marginTop: 8 }}>· '기타'는 어디에도 해당하지 않을 때 자동 분류됩니다.</p>
          </div>
        </>
      )}

      {sub === 'trash' && <TrashPanel onChange={onChange} />}
    </div>
  )
}

// 삭제 데이터(휴지통) — 목록·수정/일본상담에서 삭제한 데이터를 복원
function TrashPanel({ onChange }) {
  const [leads, setLeads] = useState([])
  const [tickets, setTickets] = useState([])
  const [japan, setJapan] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    setBusy(true)
    try {
      const [l, t, j] = await Promise.all([fetchTrash('leads'), fetchTrash('ticketing'), fetchTrash('japan')])
      setLeads(l); setTickets(t); setJapan(j)
    } catch (e) { setMsg('불러오기 실패: ' + e.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])

  async function restore(table, id) {
    try {
      await restoreRow(table, id)
      setMsg('✅ 복원했습니다.')
      await load()
      onChange && onChange()
    } catch (e) { setMsg('복원 실패: ' + e.message) }
  }

  const empty = leads.length === 0 && tickets.length === 0 && japan.length === 0

  return (
    <div>
      <p className="muted">목록·수정과 일본상담에서 삭제한 데이터입니다. <b>복원</b>을 누르면 원래 목록으로 되돌아갑니다.</p>
      {msg && <div className="banner info">{msg}</div>}
      {busy && <div className="muted">불러오는 중…</div>}
      {!busy && empty && <div className="banner info">삭제된 데이터가 없습니다.</div>}

      {leads.length > 0 && (
        <div className="card">
          <h3>삭제된 공급 <span className="muted">({leads.length})</span></h3>
          <div className="scroll-x">
            <table className="grid center-all">
              <thead><tr><th>일자</th><th>실장</th><th>채널</th><th>고객명</th><th>상태</th><th>분류</th><th>복원</th></tr></thead>
              <tbody>
                {leads.map((r) => (
                  <tr key={r.id}>
                    <td>{r.report_date}</td><td>{r.manager}</td><td>{r.channel}</td>
                    <td>{r.customer_name}</td><td>{r.status_raw}</td><td>{r.result_category}</td>
                    <td><button className="btn success sm" onClick={() => restore('leads', r.id)}>복원</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tickets.length > 0 && (
        <div className="card">
          <h3>삭제된 티켓팅 <span className="muted">({tickets.length})</span></h3>
          <div className="scroll-x">
            <table className="grid center-all">
              <thead><tr><th>일자</th><th>실장</th><th>고객명</th><th>부위</th><th>집도의</th><th>op날짜</th><th>금액</th><th>복원</th></tr></thead>
              <tbody>
                {tickets.map((r) => (
                  <tr key={r.id}>
                    <td>{r.report_date}</td><td>{r.manager}</td><td>{r.customer_name}</td><td>{r.area}</td>
                    <td>{r.surgeon}</td><td>{r.op_date}</td><td>{r.amount}</td>
                    <td><button className="btn success sm" onClick={() => restore('ticketing', r.id)}>복원</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {japan.length > 0 && (
        <div className="card">
          <h3>삭제된 일본상담 <span className="muted">({japan.length})</span></h3>
          <div className="scroll-x">
            <table className="grid center-all">
              <thead><tr><th>일자</th><th>실장</th><th>환자명/번호</th><th>집도의</th><th>수술날짜</th><th>예약금</th><th>부위·비용</th><th>복원</th></tr></thead>
              <tbody>
                {japan.map((r) => (
                  <tr key={r.id}>
                    <td>{r.report_date}</td><td>{r.manager}</td><td>{r.patient}</td><td>{r.surgeon}</td>
                    <td>{r.surgery_date}</td><td>{r.deposit}</td><td>{r.cost_parts}</td>
                    <td><button className="btn success sm" onClick={() => restore('japan', r.id)}>복원</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function KwAdd({ onAdd }) {
  const [v, setV] = useState('')
  function submit(e) { e.preventDefault(); onAdd(v); setV('') }
  return (
    <form onSubmit={submit} style={{ display: 'inline-flex', gap: 4 }}>
      <input className="cell-in kw-in" value={v} onChange={(e) => setV(e.target.value)} placeholder="+ 단어 추가" />
    </form>
  )
}

import { useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { statsByManager, statsByDate, statsByChannel, statsByResult } from '../lib/stats.js'
import { filterData, formatRangeLabel } from '../lib/datefilter.js'
import DateFilter from '../components/DateFilter.jsx'
import { exportDashboardPDF } from '../lib/pdf.js'

const COLORS = ['#4f7cff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#eab308']

export default function Dashboard({ data, loading }) {
  const [filter, setFilter] = useState({ from: '', to: '', cmpFrom: '', cmpTo: '' })
  const [pdfBusy, setPdfBusy] = useState(false)
  const captureRef = useRef(null)

  const allDates = useMemo(() => [...(data.leads || []), ...(data.ticketing || [])].map((r) => r.report_date), [data])
  const fd = useMemo(() => filterData(data, filter), [data, filter])

  const mgr = useMemo(() => statsByManager(fd.leads, fd.ticketing, fd.summary), [fd])
  const byDate = useMemo(() => statsByDate(fd.leads, fd.ticketing), [fd])
  const byChannel = useMemo(() => statsByChannel(fd.leads), [fd])
  const byResult = useMemo(() => statsByResult(fd.leads), [fd])

  const totalSupply = fd.leads.length
  const totalTickets = mgr.reduce((s, r) => s + r.tickets, 0)
  const totalVisit = mgr.reduce((s, r) => s + r.visit, 0)
  const totalCancel = mgr.reduce((s, r) => s + r.cancel, 0)
  const overallConv = totalSupply ? ((totalTickets / totalSupply) * 100).toFixed(1) : '0.0'

  // 비교 기간 대비 증감 — 사용자가 지정한 '기간 비교' 구간이 있을 때만 계산
  const prev = useMemo(() => {
    if (!filter.from && !filter.to) return null
    const pv = (filter.cmpFrom && filter.cmpTo)
      ? { from: filter.cmpFrom, to: filter.cmpTo }
      : null
    if (!pv) return null
    const pd = filterData(data, pv)
    const pm = statsByManager(pd.leads, pd.ticketing, pd.summary)
    const pSupply = pd.leads.length
    const pTickets = pm.reduce((s, r) => s + r.tickets, 0)
    return {
      label: `${formatRangeLabel(pv)} 대비`,
      supply: pSupply,
      tickets: pTickets,
      visit: pm.reduce((s, r) => s + r.visit, 0),
      cancel: pm.reduce((s, r) => s + r.cancel, 0),
      conv: pSupply ? (pTickets / pSupply) * 100 : 0,
      hasData: pSupply > 0,
    }
  }, [data, filter])

  async function downloadPDF() {
    setPdfBusy(true)
    try { await exportDashboardPDF(captureRef.current) }
    catch (e) { alert('PDF 생성 실패: ' + (e.message || e)) }
    finally { setPdfBusy(false) }
  }

  const head = (
    <div className="page-head">
      <h2>대쉬보드</h2>
      <div className="head-controls">
        <DateFilter dates={allDates} value={filter} onChange={setFilter} showCompare />
        <button className="btn primary" onClick={downloadPDF} disabled={pdfBusy}>{pdfBusy ? 'PDF 생성 중…' : '⬇ PDF 다운로드'}</button>
      </div>
    </div>
  )

  if (!loading && (data.leads || []).length === 0) {
    return <div className="page">{head}<p className="muted">아직 데이터가 없습니다. <b>입력</b> 탭에서 보고서를 붙여넣어 저장해보세요.</p></div>
  }

  return (
    <div className="page" ref={captureRef}>
      {head}
      {totalSupply === 0 && <div className="banner info">선택한 기간에 데이터가 없습니다.</div>}

      <div className="kpis">
        <Kpi label="총 공급" value={totalSupply} delta={prev?.hasData ? totalSupply - prev.supply : null} prevLabel={prev?.label} />
        <Kpi label="총 티켓팅(고객수)" value={totalTickets} delta={prev?.hasData ? totalTickets - prev.tickets : null} prevLabel={prev?.label} />
        <Kpi label="총 내원" value={totalVisit} delta={prev?.hasData ? totalVisit - prev.visit : null} prevLabel={prev?.label} />
        <Kpi label="총 취소" value={totalCancel} delta={prev?.hasData ? totalCancel - prev.cancel : null} prevLabel={prev?.label} invert />
        <Kpi label="전체 전환율" value={overallConv + '%'} accent
          delta={prev?.hasData ? +(((totalSupply ? (totalTickets / totalSupply) * 100 : 0) - prev.conv).toFixed(1)) : null}
          prevLabel={prev?.label} suffix="%p" />
      </div>

      <div className="card">
        <h3>실장별 전환율</h3>
        <div className="chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mgr} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="manager" />
              <YAxis unit="%" />
              <Tooltip formatter={(v) => (typeof v === 'number' ? v.toFixed(1) + '%' : v)} />
              <Bar dataKey="convRate" name="전환율" radius={[6, 6, 0, 0]}>
                {mgr.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="grid tight">
          <thead><tr><th>실장</th><th>공급</th><th>티켓팅(고객)</th><th>내원</th><th>내원율</th><th>전환율</th><th>취소</th><th>취소율</th></tr></thead>
          <tbody>
            {mgr.map((r) => (
              <tr key={r.manager}>
                <td>{r.manager}</td><td>{r.supply}</td><td>{r.tickets}</td><td>{r.visit}</td>
                <td className="num">{r.visitRate.toFixed(1)}%</td>
                <td className="num strong">{r.convRate.toFixed(1)}%</td>
                <td className="num cancel">{r.cancel}</td>
                <td className="num cancel">{r.cancelRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>날짜별 추이</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={byDate} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="supply" name="공급" stroke="#4f7cff" strokeWidth={2} />
                <Line type="monotone" dataKey="tickets" name="티켓팅" stroke="#22c55e" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3>공급 결과 분포</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byResult} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {byResult.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>채널별 공급 · 예약전환</h3>
        <div className="chart">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byChannel} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="channel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="supply" name="공급" fill="#4f7cff" radius={[6, 6, 0, 0]} />
              <Bar dataKey="booked" name="내상·예약" fill="#22c55e" radius={[6, 6, 0, 0]} />
              <Bar dataKey="cancel" name="취소" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="grid tight">
          <thead><tr><th>채널</th><th>공급</th><th>내상·예약</th><th>취소</th><th>예약전환율</th><th>취소율</th></tr></thead>
          <tbody>
            {byChannel.map((r) => (
              <tr key={r.channel}>
                <td>{r.channel}</td><td>{r.supply}</td><td>{r.booked}</td>
                <td className="num cancel">{r.cancel}</td>
                <td className="num">{r.rate.toFixed(1)}%</td>
                <td className="num cancel">{r.cancelRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// delta: 이전 기간 대비 증감(null이면 표시 안 함). invert: 증가가 나쁜 지표(취소).
function Kpi({ label, value, accent, delta, prevLabel, suffix = '', invert = false }) {
  let deltaEl = null
  if (delta != null) {
    const up = delta > 0
    const good = delta === 0 ? null : invert ? !up : up
    const cls = delta === 0 ? 'flat' : good ? 'up' : 'down'
    const arrow = delta === 0 ? '—' : up ? '▲' : '▼'
    deltaEl = (
      <div className={'kpi-delta ' + cls} title={prevLabel}>
        {arrow} {Math.abs(delta)}{suffix} <span className="kpi-delta-label">{prevLabel}</span>
      </div>
    )
  }
  return (
    <div className={accent ? 'kpi accent' : 'kpi'}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {deltaEl}
    </div>
  )
}

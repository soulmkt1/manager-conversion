// 대시보드 통계 계산 (공급/티켓팅/요약 데이터로부터)
import { normalizeName } from './parser.js'

// 실장별 공급/티켓팅(고객수)/내원/취소/전환율
export function statsByManager(leads, tickets, summary) {
  const map = {}
  const ensure = (m) => (map[m] = map[m] || { manager: m, supply: 0, ticketCustomers: new Set(), visit: 0, cancel: 0 })
  for (const l of leads) {
    const r = ensure(l.manager || '(미지정)')
    r.supply++
    if (l.result_category === '취소') r.cancel++
  }
  for (const t of tickets) ensure(t.manager || '(미지정)').ticketCustomers.add(normalizeName(t.customer_name) || t.id)
  for (const s of summary) {
    if (s.visit_count != null) ensure(s.manager || '(미지정)').visit += Number(s.visit_count) || 0
  }
  return Object.values(map)
    .map((r) => ({
      manager: r.manager,
      supply: r.supply,
      tickets: r.ticketCustomers.size,
      visit: r.visit,
      cancel: r.cancel,
      convRate: r.supply ? (r.ticketCustomers.size / r.supply) * 100 : 0,
      visitRate: r.supply ? (r.visit / r.supply) * 100 : 0,
      cancelRate: r.supply ? (r.cancel / r.supply) * 100 : 0,
    }))
    .sort((a, b) => b.convRate - a.convRate)
}

// 날짜별 공급/티켓팅 추이
export function statsByDate(leads, tickets) {
  const map = {}
  const ensure = (d) => (map[d] = map[d] || { date: d, supply: 0, tickets: 0 })
  for (const l of leads) ensure(l.report_date || '(미지정)').supply++
  for (const t of tickets) ensure(t.report_date || '(미지정)').tickets++
  return Object.values(map).sort((a, b) => (a.date < b.date ? -1 : 1))
}

// 채널별 공급/예약전환/취소
export function statsByChannel(leads) {
  const map = {}
  for (const l of leads) {
    const c = l.channel || '(미상)'
    map[c] = map[c] || { channel: c, supply: 0, booked: 0, cancel: 0 }
    map[c].supply++
    if (l.result_category === '내상·예약') map[c].booked++
    if (l.result_category === '취소') map[c].cancel++
  }
  return Object.values(map)
    .map((r) => ({
      ...r,
      rate: r.supply ? (r.booked / r.supply) * 100 : 0,
      cancelRate: r.supply ? (r.cancel / r.supply) * 100 : 0,
    }))
    .sort((a, b) => b.supply - a.supply)
}

// 결과분류 분포
export function statsByResult(leads) {
  const order = ['내상·예약', '진행중', '부재', '취소', '불량', '중복', '기타']
  const map = {}
  for (const l of leads) map[l.result_category || '기타'] = (map[l.result_category || '기타'] || 0) + 1
  return order.filter((k) => map[k]).map((k) => ({ name: k, value: map[k] }))
}

// CSV 문자열 생성
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const header = columns.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n')
  return '﻿' + header + '\n' + body // BOM: 엑셀 한글 깨짐 방지
}

export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

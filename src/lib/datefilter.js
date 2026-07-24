// 날짜 필터 (시작~끝 범위) — report_date 는 'MM-DD' 형식.
// 연도가 없으므로 현재 연도로 해석해 실제 달력 기준으로 범위를 판정한다.
// 필터 모델: { from: 'MM-DD'|'', to: 'MM-DD'|'' }  (from/to 둘 다 비면 '전체')

const YEAR = new Date().getFullYear()

export function parseMD(md) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec((md || '').trim())
  if (!m) return null
  return new Date(YEAR, +m[1] - 1, +m[2])
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// 그 날짜가 속한 주의 월요일 (달력 기준, 월~일)
export function weekStart(d) {
  const x = new Date(d)
  const off = (x.getDay() + 6) % 7 // 월=0 … 일=6
  x.setDate(x.getDate() - off)
  return x
}

// report_date 가 필터 범위 [from, to] (양끝 포함) 안에 드는지
export function matchDate(md, filter) {
  if (!filter || (!filter.from && !filter.to)) return true
  const d = parseMD(md)
  if (!d) return false
  if (filter.from) { const f = parseMD(filter.from); if (f && d < f) return false }
  if (filter.to) { const t = parseMD(filter.to); if (t && d > t) return false }
  return true
}

// 데이터 묶음(leads/ticketing/summary/japan/recall)을 필터로 거른다
export function filterData(data, filter) {
  if (!filter || (!filter.from && !filter.to)) return data
  const f = (arr) => (arr || []).filter((r) => matchDate(r.report_date, filter))
  return {
    leads: f(data.leads), ticketing: f(data.ticketing), summary: f(data.summary),
    japan: f(data.japan), recall: f(data.recall),
  }
}

// 프리셋 → { from, to } (MM-DD). 실제 오늘 기준.
export function presetRange(id) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const R = (a, b) => ({ from: key(a), to: key(b) })
  switch (id) {
    case 'today': return R(today, today)
    case 'yesterday': { const y = addDays(today, -1); return R(y, y) }
    case 'last7': return R(addDays(today, -6), today)                 // 오늘 포함 7일
    case 'last7excl': return R(addDays(today, -7), addDays(today, -1)) // 오늘 제외 7일
    case 'last30': return R(addDays(today, -29), today)
    case 'last30excl': return R(addDays(today, -30), addDays(today, -1))
    case 'thisWeek': { const ws = weekStart(today); return R(ws, addDays(ws, 6)) }
    case 'lastWeek': { const ws = addDays(weekStart(today), -7); return R(ws, addDays(ws, 6)) }
    case 'thisMonth': { const s = new Date(today.getFullYear(), today.getMonth(), 1); const e = new Date(today.getFullYear(), today.getMonth() + 1, 0); return R(s, e) }
    case 'lastMonth': { const s = new Date(today.getFullYear(), today.getMonth() - 1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return R(s, e) }
    case 'all':
    default: return { from: '', to: '' }
  }
}

// 선택 구간과 같은 길이의 바로 앞 구간 (대쉬보드 '직전 동일기간 대비'용)
export function precedingRange(filter) {
  if (!filter || (!filter.from && !filter.to)) return null
  const f = parseMD(filter.from), t = parseMD(filter.to)
  if (!f || !t) return null
  const days = Math.round((t - f) / 86400000) + 1
  const pTo = addDays(f, -1)
  const pFrom = addDays(pTo, -(days - 1))
  return { from: key(pFrom), to: key(pTo) }
}

// 트리거 버튼용 라벨 ('전체 기간' / '7/7 ~ 7/13' / '7/7')
export function formatRangeLabel(filter) {
  if (!filter || (!filter.from && !filter.to)) return '전체 기간'
  const fmt = (md) => { const d = parseMD(md); return d ? `${d.getMonth() + 1}/${d.getDate()}` : md }
  if (filter.from && filter.to) {
    return filter.from === filter.to ? fmt(filter.from) : `${fmt(filter.from)} ~ ${fmt(filter.to)}`
  }
  return fmt(filter.from || filter.to)
}

// 실제 보고서 파일로 파서 정확도를 눈으로 검증하는 스크립트
//   node src/lib/parser.test.mjs "경로/보고서.txt"
import { readFileSync } from 'node:fs'
import { parseReport, findDuplicateGroups } from './parser.js'

const path =
  process.argv[2] || 'C:/Users/user/Desktop/6월 4주차 db전환율.txt'

const text = readFileSync(path, 'utf8')
const r = parseReport(text)

const line = '─'.repeat(60)
console.log(line)
console.log('요약 (보고서 머리글 선언값 vs 파싱된 행 수)')
console.log(line)

// 실장+날짜별 파싱된 공급/티켓팅 행 수 집계
const cnt = (arr, k) => arr.reduce((m, x) => ((m[k(x)] = (m[k(x)] || 0) + 1), m), {})
const supplyByMD = cnt(r.supply, (x) => `${x.report_date}|${x.manager}`)
const ticketByMD = cnt(r.ticketing, (x) => `${x.report_date}|${x.manager}`)

console.log(
  '날짜   실장            선언공급  파싱공급  선언티켓  파싱티켓  내원  차트'
)
for (const s of r.summary) {
  const key = `${s.report_date}|${s.manager}`
  const ps = supplyByMD[key] || 0
  const pt = ticketByMD[key] || 0
  const flag = s.supply_count != null && ps !== s.supply_count ? ' ⚠' : ''
  console.log(
    `${(s.report_date || '??').padEnd(6)} ${(s.manager || '?').padEnd(14)} ` +
      `${String(s.supply_count ?? '-').padStart(6)}  ${String(ps).padStart(6)}  ` +
      `${String(s.ticket_count ?? '-').padStart(6)}  ${String(pt).padStart(6)}  ` +
      `${String(s.visit_count ?? '-').padStart(4)}  ${s.chart_status || '-'}${flag}`
  )
}

console.log('\n' + line)
console.log('전체 집계')
console.log(line)
console.log('인식된 보고서(요약) 수 :', r.summary.length)
console.log('공급 행                :', r.supply.length)
console.log('티켓팅 행              :', r.ticketing.length)
console.log('일본상담 건            :', r.japan.length)
console.log('리콜 행                :', r.recall.length)
console.log('경고                   :', r.warnings.length ? r.warnings : '없음')

console.log('\n' + line)
console.log('실장별 전환율 (파싱 기준: 티켓팅고객수 / 공급수)')
console.log(line)
const byMgr = {}
for (const s of r.supply) {
  byMgr[s.manager] = byMgr[s.manager] || { supply: 0, tickets: new Set() }
  byMgr[s.manager].supply++
}
for (const t of r.ticketing) {
  byMgr[t.manager] = byMgr[t.manager] || { supply: 0, tickets: new Set() }
  byMgr[t.manager].tickets.add(t.customer_name)
}
for (const [m, v] of Object.entries(byMgr)) {
  const rate = v.supply ? ((v.tickets.size / v.supply) * 100).toFixed(1) : '0.0'
  console.log(`${m.padEnd(14)} 공급 ${String(v.supply).padStart(3)}  티켓고객 ${String(v.tickets.size).padStart(2)}  전환율 ${rate}%`)
}

console.log('\n' + line)
console.log('중복 고객 그룹 (상위 15)')
console.log(line)
const groups = findDuplicateGroups(r.supply)
console.log('중복 그룹 수:', groups.length)
for (const g of groups.slice(0, 15)) {
  console.log(
    `· ${g.name}  ×${g.rows.length}  →  ` +
      g.rows.map((x) => `${x.manager}(${x.channel || '?'})`).join(', ')
  )
}

console.log('\n' + line)
console.log('공급 샘플 20행 (분류 확인용)')
console.log(line)
for (const s of r.supply.slice(0, 20)) {
  console.log(
    `[${s.result_category.padEnd(5)}] ${s.manager.padEnd(6)} ${(s.channel || '-').padEnd(6)} ${s.customer_name.padEnd(12)} | ${s.status_raw}`
  )
}

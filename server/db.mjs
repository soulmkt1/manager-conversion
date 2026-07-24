// 로컬 데이터베이스 (Node 내장 SQLite — 추가 설치 불필요)
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// 호스팅(Railway 등)에서는 DATA_DIR로 영구 볼륨 경로를 지정 → 재배포해도 데이터 유지.
// 로컬에서는 미지정이라 기존 server/data 그대로 사용.
const dataDir = process.env.DATA_DIR || join(here, 'data')
mkdirSync(dataDir, { recursive: true })

export const DB_PATH = join(dataDir, 'app.db')
const db = new DatabaseSync(DB_PATH)

// 테이블별 컬럼 화이트리스트 (SQL 인젝션 방지 + 저장 컬럼 정의)
export const TABLES = {
  leads: ['report_date', 'manager', 'channel', 'customer_name', 'status_raw', 'result_category', 'is_duplicate', 'note'],
  ticketing: ['report_date', 'manager', 'customer_name', 'area', 'surgeon', 'height', 'weight', 'op_date', 'pay_type', 'amount', 'raw'],
  summary: ['report_date', 'manager', 'supply_count', 'ticket_count', 'visit_count', 'chart_status'],
  japan: ['report_date', 'manager', 'patient', 'surgeon', 'surgery_date', 'deposit', 'cost_parts', 'content'],
  recall: ['report_date', 'manager', 'customer_name'],
}

db.exec(`
  create table if not exists leads (
    id integer primary key autoincrement,
    report_date text, manager text, channel text, customer_name text,
    status_raw text, result_category text, is_duplicate integer default 0, note text,
    created_at text default (datetime('now'))
  );
  create table if not exists ticketing (
    id integer primary key autoincrement,
    report_date text, manager text, customer_name text, area text, surgeon text,
    height numeric, weight numeric, op_date text, pay_type text, amount text, raw text,
    created_at text default (datetime('now'))
  );
  create table if not exists summary (
    id integer primary key autoincrement,
    report_date text, manager text, supply_count integer, ticket_count integer,
    visit_count integer, chart_status text, created_at text default (datetime('now'))
  );
  create table if not exists japan (
    id integer primary key autoincrement,
    report_date text, manager text, patient text, surgeon text, surgery_date text,
    deposit text, cost_parts text, content text, created_at text default (datetime('now'))
  );
  create table if not exists recall (
    id integer primary key autoincrement,
    report_date text, manager text, customer_name text, created_at text default (datetime('now'))
  );
  create table if not exists app_settings (
    key text primary key, value text
  );
`)

// ── 설정(관리 페이지) 저장 ──────────────────────────────────────
export function getSetting(key) {
  const row = db.prepare('select value from app_settings where key=?').get(key)
  if (!row) return null
  try { return JSON.parse(row.value) } catch { return null }
}
export function setSetting(key, value) {
  db.prepare(
    'insert into app_settings (key, value) values (?, ?) on conflict(key) do update set value=excluded.value'
  ).run(key, JSON.stringify(value))
  return { ok: true }
}

const valid = (t) => Object.prototype.hasOwnProperty.call(TABLES, t)

// 소프트 삭제(휴지통) 지원 테이블: 삭제 시 실제로 지우지 않고 deleted=1 표시
const SOFT = new Set(['leads', 'ticketing', 'japan', 'recall'])
function ensureColumn(table, col, def) {
  const cols = db.prepare(`pragma table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(col)) db.exec(`alter table ${table} add column ${col} ${def}`)
}
for (const t of SOFT) ensureColumn(t, 'deleted', 'integer default 0')

export function all(table) {
  if (!valid(table)) throw new Error('unknown table')
  const where = SOFT.has(table) ? ' where deleted=0' : ''
  return db.prepare(`select * from ${table}${where} order by id asc`).all()
}

// 휴지통(삭제된 행) 조회
export function trash(table) {
  if (!SOFT.has(table)) return []
  return db.prepare(`select * from ${table} where deleted=1 order by id desc`).all()
}
// 복원
export function restore(table, id) {
  if (!SOFT.has(table)) throw new Error('restore not supported')
  const info = db.prepare(`update ${table} set deleted=0 where id=?`).run(id)
  return { changes: info.changes }
}

export function insertMany(table, rows) {
  if (!valid(table)) throw new Error('unknown table')
  const cols = TABLES[table]
  const stmt = db.prepare(
    `insert into ${table} (${cols.join(',')}) values (${cols.map(() => '?').join(',')})`
  )
  const insertAll = db.prepare('select changes()') // noop to keep style
  let count = 0
  db.exec('begin')
  try {
    for (const r of rows) {
      const values = cols.map((c) => coerce(c, r[c]))
      stmt.run(...values)
      count++
    }
    db.exec('commit')
  } catch (e) {
    db.exec('rollback')
    throw e
  }
  void insertAll
  return { count }
}

export function update(table, id, patch) {
  if (!valid(table)) throw new Error('unknown table')
  const cols = TABLES[table].filter((c) => c in patch)
  if (cols.length === 0) return { changes: 0 }
  const set = cols.map((c) => `${c}=?`).join(',')
  const values = cols.map((c) => coerce(c, patch[c]))
  const info = db.prepare(`update ${table} set ${set} where id=?`).run(...values, id)
  return { changes: info.changes }
}

// 날짜 범위로 완전 삭제 (재임포트용 정리)
export function deleteByDateRange(table, from, to) {
  if (!valid(table)) throw new Error('unknown table')
  const info = db.prepare(`delete from ${table} where report_date >= ? and report_date <= ?`).run(from, to)
  return info.changes
}

export function remove(table, id) {
  if (!valid(table)) throw new Error('unknown table')
  // 소프트 삭제 테이블은 휴지통으로(복원 가능), 그 외는 실제 삭제
  if (SOFT.has(table)) {
    const info = db.prepare(`update ${table} set deleted=1 where id=?`).run(id)
    return { changes: info.changes }
  }
  const info = db.prepare(`delete from ${table} where id=?`).run(id)
  return { changes: info.changes }
}

// 값 정규화: boolean → 0/1, undefined → null
function coerce(col, v) {
  if (col === 'is_duplicate') return v ? 1 : 0
  if (v === undefined) return null
  return v
}

// ── 공급 ↔ 티켓팅 이동 (관리자 수동 이동) ────────────────────────
function mapForMove(to, row) {
  if (to === 'ticketing') {
    return {
      report_date: row.report_date, manager: row.manager, customer_name: row.customer_name,
      area: '', surgeon: '', height: null, weight: null, op_date: '', pay_type: '', amount: '',
      raw: row.status_raw || row.raw || '',
    }
  }
  // to === 'leads'
  return {
    report_date: row.report_date, manager: row.manager, channel: row.channel || '',
    customer_name: row.customer_name,
    status_raw: row.raw || row.status_raw || row.area || '',
    result_category: '내상·예약', is_duplicate: 0, note: '티켓팅에서 이동',
  }
}

export function moveRow(from, to, id) {
  if (!valid(from) || !valid(to) || from === to) throw new Error('invalid move')
  if (!((from === 'leads' && to === 'ticketing') || (from === 'ticketing' && to === 'leads')))
    throw new Error('공급↔티켓팅 이동만 지원합니다.')
  const row = db.prepare(`select * from ${from} where id=?`).get(id)
  if (!row) throw new Error('행을 찾을 수 없습니다.')
  insertMany(to, [mapForMove(to, row)])
  db.prepare(`delete from ${from} where id=?`).run(id) // 이동이므로 원본은 완전 삭제
  return { ok: true }
}

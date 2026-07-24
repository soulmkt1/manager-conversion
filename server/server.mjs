// 로컬 웹서버: 대시보드(정적 파일) 서빙 + 데이터 API + 공용 비밀번호 인증
import express from 'express'
import crypto from 'node:crypto'
import os from 'node:os'
import { readFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dbx from './db.mjs'
import { DB_PATH } from './db.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// ── 자동 백업: 서버 시작 시 오늘자 백업 생성, 14일 지난 백업은 삭제 ──
try {
  const backupDir = join(dirname(DB_PATH), 'backups')
  mkdirSync(backupDir, { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  const target = join(backupDir, `app-${today}.db`)
  if (existsSync(DB_PATH) && !existsSync(target)) {
    copyFileSync(DB_PATH, target)
    console.log(`[백업] 오늘자 백업 생성: backups/app-${today}.db`)
  }
  for (const f of readdirSync(backupDir)) {
    const m = f.match(/^app-(\d{4}-\d{2}-\d{2})\.db$/)
    if (m && Date.now() - new Date(m[1]).getTime() > 14 * 86400000) {
      unlinkSync(join(backupDir, f))
      console.log(`[백업] 14일 경과 백업 삭제: ${f}`)
    }
  }
} catch (e) { console.warn('[백업] 실패(무시하고 계속):', e.message) }

// ── 설정 (비밀번호/포트) ────────────────────────────────────────
const configPath = join(here, 'config.json')
let config = { password: 'topline1234', port: 8787 }
if (existsSync(configPath)) {
  try { config = { ...config, ...JSON.parse(readFileSync(configPath, 'utf8')) } } catch { /* keep defaults */ }
}
const PORT = process.env.PORT || config.port || 8787
// 비밀번호는 환경변수(APP_PASSWORD) 우선 → 호스팅 시 저장소에 평문으로 넣지 않음
const PASSWORD = process.env.APP_PASSWORD || config.password
// 토큰 = 비밀번호 기반 해시 (서버 재시작해도 유지 → 재로그인 불필요)
const TOKEN = crypto.createHash('sha256').update('db-dash|' + PASSWORD).digest('hex')

const app = express()
app.set('trust proxy', 1) // Railway 등 프록시 뒤에서 실제 클라이언트 IP 인식
app.use(express.json({ limit: '8mb' }))

// ── 인증 ────────────────────────────────────────────────────────
// 로그인 무차별 대입 차단: IP별로 5분간 10회 실패 시 잠시 차단
const loginFails = new Map() // ip -> { count, first }
const MAX_FAILS = 10
const FAIL_WINDOW = 5 * 60 * 1000
function loginBlocked(ip) {
  const rec = loginFails.get(ip)
  if (!rec) return false
  if (Date.now() - rec.first > FAIL_WINDOW) { loginFails.delete(ip); return false }
  return rec.count >= MAX_FAILS
}
function noteFail(ip) {
  const rec = loginFails.get(ip)
  if (!rec || Date.now() - rec.first > FAIL_WINDOW) loginFails.set(ip, { count: 1, first: Date.now() })
  else rec.count++
}
app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown'
  if (loginBlocked(ip)) return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 5분 후 다시 시도하세요.' })
  if ((req.body?.password || '') === PASSWORD) { loginFails.delete(ip); return res.json({ token: TOKEN }) }
  noteFail(ip)
  res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' })
})

function requireAuth(req, res, next) {
  const h = req.headers.authorization || ''
  if (h === 'Bearer ' + TOKEN) return next()
  res.status(401).json({ error: '인증이 필요합니다.' })
}

// ── 설정 (관리 페이지) ──────────────────────────────────────────
app.get('/api/settings', requireAuth, (_req, res) => {
  res.json(dbx.getSetting('parser_config') || {})
})
app.put('/api/settings', requireAuth, (req, res) => {
  try { res.json(dbx.setSetting('parser_config', req.body || {})) }
  catch (e) { res.status(400).json({ error: String(e.message || e) }) }
})

// ── 데이터 CRUD ─────────────────────────────────────────────────
const dist = join(root, 'dist')

app.get('/api/data/:table', requireAuth, (req, res) => {
  try { res.json(dbx.all(req.params.table)) }
  catch (e) { res.status(400).json({ error: String(e.message || e) }) }
})
app.post('/api/data/:table', requireAuth, (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : [req.body]
    res.json(dbx.insertMany(req.params.table, rows))
  } catch (e) { res.status(400).json({ error: String(e.message || e) }) }
})
app.patch('/api/data/:table/:id', requireAuth, (req, res) => {
  try { res.json(dbx.update(req.params.table, Number(req.params.id), req.body || {})) }
  catch (e) { res.status(400).json({ error: String(e.message || e) }) }
})
app.delete('/api/data/:table/:id', requireAuth, (req, res) => {
  try { res.json(dbx.remove(req.params.table, Number(req.params.id))) }
  catch (e) { res.status(400).json({ error: String(e.message || e) }) }
})

// 휴지통 조회 / 복원
app.get('/api/trash/:table', requireAuth, (req, res) => {
  try { res.json(dbx.trash(req.params.table)) }
  catch (e) { res.status(400).json({ error: String(e.message || e) }) }
})
app.post('/api/restore/:table/:id', requireAuth, (req, res) => {
  try { res.json(dbx.restore(req.params.table, Number(req.params.id))) }
  catch (e) { res.status(400).json({ error: String(e.message || e) }) }
})

// 공급 ↔ 티켓팅 이동
app.post('/api/move/:from/:to/:id', requireAuth, (req, res) => {
  try { res.json(dbx.moveRow(req.params.from, req.params.to, Number(req.params.id))) }
  catch (e) { res.status(400).json({ error: String(e.message || e) }) }
})

// ── 정적 파일 (빌드된 대시보드) + SPA 폴백 ──────────────────────
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(join(dist, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => res.status(500).send('먼저 "npm run build" 로 대시보드를 빌드하세요.'))
}

app.listen(PORT, () => {
  const nets = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address)
    }
  }
  console.log('\n========================================')
  console.log('  DB 전환율 대시보드 서버 실행 중')
  console.log('========================================')
  console.log(`  이 PC에서:      http://localhost:${PORT}`)
  for (const ip of ips) console.log(`  같은 네트워크:  http://${ip}:${PORT}`)
  console.log(`  공용 비밀번호:  ${process.env.APP_PASSWORD ? '(환경변수 APP_PASSWORD로 설정됨)' : config.password + '   (server/config.json 에서 변경)'}`)
  console.log('  종료하려면 이 창을 닫으세요.')
  console.log('========================================\n')
})

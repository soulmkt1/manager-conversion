// 로컬 서버 API 클라이언트 (기존 Supabase 클라이언트를 대체 — export 이름은 동일 유지)
const BASE = '/api'

let token = (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) || ''
const listeners = new Set()
function notify() {
  const session = token ? { token } : null
  listeners.forEach((cb) => cb(session))
}

export const isConfigured = true
export const SHARED_EMAIL = '' // 로컬 버전에서는 사용 안 함

// ── 인증 (공용 비밀번호) ────────────────────────────────────────
export async function signIn(password) {
  try {
    const r = await fetch(BASE + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!r.ok) return { error: { message: '비밀번호가 올바르지 않습니다.' } }
    const data = await r.json()
    token = data.token
    localStorage.setItem('auth_token', token)
    notify()
    return { error: null }
  } catch (e) {
    return { error: { message: '서버에 연결할 수 없습니다.' } }
  }
}
export async function signOut() {
  token = ''
  localStorage.removeItem('auth_token')
  notify()
}
export async function getSession() {
  return token ? { token } : null
}
export function onAuthChange(cb) {
  listeners.add(cb)
  return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
}

// ── 공통 요청 ───────────────────────────────────────────────────
async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(opts.headers || {}) },
  })
  if (r.status === 401) { await signOut(); throw new Error('인증이 만료되었습니다. 다시 로그인하세요.') }
  if (!r.ok) {
    let msg = r.statusText
    try { msg = (await r.json()).error || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (r.status === 204) return null
  return r.json()
}

// ── 데이터 CRUD ─────────────────────────────────────────────────
export async function fetchAll(table) {
  return req('/data/' + table)
}
export async function insertMany(table, rows) {
  if (!rows || rows.length === 0) return []
  return req('/data/' + table, { method: 'POST', body: JSON.stringify(rows) })
}
export async function updateRow(table, id, patch) {
  return req('/data/' + table + '/' + id, { method: 'PATCH', body: JSON.stringify(patch) })
}
export async function deleteRow(table, id) {
  return req('/data/' + table + '/' + id, { method: 'DELETE' })
}
export async function deleteMany(table, ids) {
  for (const id of ids || []) await deleteRow(table, id)
}

// 휴지통(삭제 데이터) 조회 / 복원
export async function fetchTrash(table) {
  return req('/trash/' + table)
}
export async function restoreRow(table, id) {
  return req('/restore/' + table + '/' + id, { method: 'POST' })
}

// 공급 ↔ 티켓팅 이동
export async function moveRow(from, to, id) {
  return req('/move/' + from + '/' + to + '/' + id, { method: 'POST' })
}

// ── 관리 페이지 설정 ────────────────────────────────────────────
export async function getSettings() {
  return req('/settings')
}
export async function saveSettings(config) {
  return req('/settings', { method: 'PUT', body: JSON.stringify(config) })
}

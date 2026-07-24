// 관리 페이지 설정 로드/기본값 병합
import { getSettings } from './supabase.js'
import { DEFAULT_CHANNEL_MAP, DEFAULT_RESULT_RULES } from './parser.js'

export function defaultConfig() {
  return {
    channelMap: { ...DEFAULT_CHANNEL_MAP },
    resultRules: DEFAULT_RESULT_RULES.map((r) => ({ category: r.category, keywords: [...r.keywords] })),
  }
}

// 저장된 설정을 불러오되, 비어있으면 기본값 사용
export async function loadConfig() {
  try {
    const saved = await getSettings()
    if (saved && saved.channelMap && saved.resultRules) return saved
  } catch { /* 서버 미연결 등 → 기본값 */ }
  return defaultConfig()
}

// { 플: '플러스친구' } ↔ [{ token:'플', label:'플러스친구' }]
export const mapToRows = (m) => Object.entries(m || {}).map(([token, label]) => ({ token, label }))
export const rowsToMap = (rows) => {
  const m = {}
  for (const r of rows) { if (r.token && r.token.trim()) m[r.token.trim()] = (r.label || '').trim() }
  return m
}

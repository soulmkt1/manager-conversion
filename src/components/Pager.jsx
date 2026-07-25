import { useEffect, useState } from 'react'

export const PAGE_SIZES = [10, 30, 50, 100, 200] // 페이지당 행 수 선택지

// 숫자 페이지 버튼 목록: 적으면 전부, 많으면 1 … (현재 주변) … 마지막 형태
export function getPageItems(cur, total, span = 5) {
  if (total <= span + 2) return Array.from({ length: total }, (_, i) => i + 1)
  let start = Math.max(1, cur - Math.floor(span / 2))
  let end = start + span - 1
  if (end > total) { end = total; start = end - span + 1 }
  const items = []
  if (start > 1) { items.push(1); if (start > 2) items.push('…') }
  for (let p = start; p <= end; p++) items.push(p)
  if (end < total) { if (end < total - 1) items.push('…'); items.push(total) }
  return items
}

// 페이지네이션 상태 훅.
//   total    : 필터된 전체 개수
//   storageKey: 페이지당 개수를 기억할 localStorage 키 (화면별로 다르게)
//   resetKey : 값이 바뀌면 1페이지로 되돌림 (필터 변경 감지용 문자열)
export function usePagination(total, storageKey, resetKey) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey))
    return PAGE_SIZES.includes(saved) ? saved : 100
  })
  useEffect(() => { setPage(1) }, [resetKey])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const curPage = Math.min(page, totalPages)
  const setPageSize = (n) => { setPageSizeState(n); setPage(1); localStorage.setItem(storageKey, String(n)) }
  return {
    page: curPage, setPage, pageSize, setPageSize, totalPages,
    slice: (arr) => arr.slice((curPage - 1) * pageSize, curPage * pageSize),
  }
}

// 페이저 UI (범위 표시 + 숫자 버튼 + 페이지당 개수 선택)
export default function Pager({ total, page, totalPages, pageSize, setPage, setPageSize, unit = '행' }) {
  return (
    <div className="pager">
      <span className="muted pager-range">
        총 {total}{unit}{total > 0 && <> · {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}{unit}</>}
      </span>

      {totalPages > 1 && (
        <div className="pager-nav">
          <button className="pager-arrow" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          {getPageItems(page, totalPages).map((it, i) => (
            it === '…'
              ? <span key={'e' + i} className="pager-ellipsis">…</span>
              : <button key={it} className={'pager-num' + (it === page ? ' active' : '')} onClick={() => setPage(it)}>{it}</button>
          ))}
          <button className="pager-arrow" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}

      <label className="pager-size">
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / 페이지</option>)}
        </select>
      </label>
    </div>
  )
}

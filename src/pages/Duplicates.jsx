import { useMemo } from 'react'
import { findDuplicateGroups } from '../lib/parser.js'
import { deleteRow } from '../lib/supabase.js'

export default function Duplicates({ data, onChange }) {
  const groups = useMemo(() => findDuplicateGroups(data.leads), [data.leads])

  async function remove(id) {
    if (!confirm('이 공급 행을 삭제할까요? (중복 정리)')) return
    try { await deleteRow('leads', id); onChange && onChange() } catch (e) { alert('삭제 실패: ' + e.message) }
  }

  return (
    <div className="page">
      <h2>중복 고객 <span className="muted">({groups.length}그룹)</span></h2>
      <p className="muted">같은 이름이 여러 실장/여러 번 잡힌 경우입니다. 남길 행만 두고 나머지는 삭제하세요.</p>

      {groups.length === 0 && <div className="banner info">중복으로 보이는 고객이 없습니다. 👍</div>}

      {groups.map((g) => (
        <div className="dup-group" key={g.key}>
          <div className="dup-title">{g.name} <span className="badge">×{g.rows.length}</span></div>
          <table className="grid center-all">
            <thead><tr><th>일자</th><th>실장</th><th>채널</th><th>상태</th><th>분류</th><th>삭제</th></tr></thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.report_date}</td>
                  <td>{r.manager}</td>
                  <td>{r.channel}</td>
                  <td>{r.status_raw}</td>
                  <td>{r.result_category}</td>
                  <td><button className="del-btn" onClick={() => remove(r.id)}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

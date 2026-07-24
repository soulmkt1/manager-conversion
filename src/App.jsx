import { useEffect, useState, useCallback } from 'react'
import { getSession, onAuthChange, signOut, fetchAll, isConfigured } from './lib/supabase.js'
import Login from './pages/Login.jsx'
import Import from './pages/Import.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Records from './pages/Records.jsx'
import Duplicates from './pages/Duplicates.jsx'
import Japan from './pages/Japan.jsx'
import Recall from './pages/Recall.jsx'
import Settings from './pages/Settings.jsx'

const TABS = [
  { id: 'dashboard', icon: '📊', label: '대쉬보드' },
  { id: 'import', icon: '➕', label: '입력' },
  { id: 'records', icon: '📋', label: '목록 · 수정' },
  { id: 'duplicates', icon: '🔁', label: '중복' },
  { id: 'japan', icon: '🇯🇵', label: '일본상담' },
  { id: 'recall', icon: '📞', label: '리콜' },
  { id: 'settings', icon: '⚙️', label: '관리' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [data, setData] = useState({ leads: [], ticketing: [], summary: [], japan: [], recall: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSession().then((s) => {
      setSession(s)
      setReady(true)
    })
    const { data: sub } = onAuthChange((s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reload = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError('')
    try {
      const [leads, ticketing, summary, japan, recall] = await Promise.all([
        fetchAll('leads'),
        fetchAll('ticketing'),
        fetchAll('summary'),
        fetchAll('japan'),
        fetchAll('recall'),
      ])
      setData({ leads, ticketing, summary, japan, recall })
    } catch (e) {
      setError('데이터를 불러오지 못했습니다: ' + (e.message || e))
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (session) reload()
  }, [session, reload])

  if (!isConfigured) {
    return (
      <div className="setup-warning">
        <h2>⚙️ 설정이 필요합니다</h2>
        <p>Supabase 연결 정보가 없습니다. <code>.env</code> 파일에 <code>VITE_SUPABASE_URL</code>,
          <code>VITE_SUPABASE_ANON_KEY</code>, <code>VITE_APP_EMAIL</code> 을 채워주세요.</p>
        <p><code>README-설치.md</code> 파일의 안내를 따라주세요.</p>
      </div>
    )
  }

  if (!ready) return <div className="center-msg">불러오는 중…</div>
  if (!session) return <Login />

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">실장별 DB<br />전환율 대쉬보드</div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="tab" onClick={reload} disabled={loading}>
            <span className="tab-icon">↻</span>
            <span className="tab-label">{loading ? '새로고침…' : '새로고침'}</span>
          </button>
          <button className="tab" onClick={() => signOut()}>
            <span className="tab-icon">⏻</span>
            <span className="tab-label">로그아웃</span>
          </button>
        </div>
      </aside>

      <div className="main">
        {error && <div className="banner error">{error}</div>}

        <main className="content">
        {tab === 'dashboard' && <Dashboard data={data} loading={loading} />}
        {tab === 'import' && <Import onSaved={reload} />}
        {tab === 'records' && <Records data={data} onChange={reload} />}
        {tab === 'duplicates' && <Duplicates data={data} onChange={reload} />}
        {tab === 'japan' && <Japan data={data} onChange={reload} />}
        {tab === 'recall' && <Recall data={data} onChange={reload} />}
          {tab === 'settings' && <Settings data={data} onChange={reload} />}
        </main>
      </div>
    </div>
  )
}

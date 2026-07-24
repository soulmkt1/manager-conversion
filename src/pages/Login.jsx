import { useState } from 'react'
import { signIn } from '../lib/supabase.js'

export default function Login() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await signIn(pw)
    setBusy(false)
    if (error) setErr('비밀번호가 올바르지 않습니다.')
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>DB 전환율 대시보드</h1>
        <p className="muted">공용 비밀번호를 입력하세요.</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="공용 비밀번호"
          autoFocus
        />
        {err && <div className="form-err">{err}</div>}
        <button className="btn primary" disabled={busy || !pw}>
          {busy ? '확인 중…' : '입장'}
        </button>
      </form>
    </div>
  )
}

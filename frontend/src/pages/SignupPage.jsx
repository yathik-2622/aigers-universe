import React, { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { signup } from '../api/auth.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function SignupPage() {
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const [form, setForm] = useState({ display_name: '', email: '' })
  const [busy, setBusy] = useState(false)

  if (ready && user?.user_id) return <Navigate to="/dashboard" replace />

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await signup(form)
      toast.success('Account created. Please sign in.')
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Sign up failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg bg-noise px-6 text-ink">
      <Link
        to="/"
        className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-muted backdrop-blur transition hover:border-accent/35 hover:text-ink"
      >
        <ArrowLeft size={15} />
        Landing page
      </Link>

      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-line bg-panel/70 p-8 shadow-2xl shadow-black/20 backdrop-blur">
        <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-accent">Create workspace identity</div>
        <h1 className="font-display text-3xl tracking-tight">Sign up before entering AIger</h1>
        <p className="mt-3 text-sm text-muted">Create your account with the same work email used in project invites so shared workflows become visible automatically.</p>
        <div className="mt-6 space-y-4">
          <input
            value={form.display_name}
            onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
            placeholder="Your name"
            className="w-full rounded-xl border border-line bg-elev/60 px-4 py-3 text-sm outline-none focus:border-accent/40"
          />
          <input
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="Work email"
            className="w-full rounded-xl border border-line bg-elev/60 px-4 py-3 text-sm outline-none focus:border-accent/40"
          />
        </div>
        <button disabled={busy || !form.display_name.trim() || !form.email.trim()} className="mt-6 w-full rounded-xl bg-accent py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Creating account...' : 'Sign up'}
        </button>
        <div className="mt-5 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </form>
    </div>
  )
}

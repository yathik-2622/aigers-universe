import React, { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, ready, login } = useAuth()
  const [form, setForm] = useState({ display_name: '', email: '' })
  const [busy, setBusy] = useState(false)

  if (ready && user?.user_id) return <Navigate to="/dashboard" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await login(form)
      toast.success('Signed in')
      navigate('/dashboard', { replace: true })
    } catch {
      toast.error('Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg bg-noise text-ink flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-line bg-panel/70 backdrop-blur p-8 shadow-2xl shadow-black/20">
        <div className="text-[11px] uppercase tracking-[0.18em] text-accent mb-2">Secure workspace access</div>
        <h1 className="font-display text-3xl tracking-tight">Sign in to resume your workflows</h1>
        <p className="text-sm text-muted mt-3">Your runs, uploaded documents, and pending reviews are linked to your Mongo user record.</p>
        <div className="mt-6 space-y-4">
          <input
            value={form.display_name}
            onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))}
            placeholder="Your name"
            className="w-full rounded-xl border border-line bg-elev/60 px-4 py-3 text-sm outline-none focus:border-accent/40"
          />
          <input
            value={form.email}
            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Work email (optional)"
            className="w-full rounded-xl border border-line bg-elev/60 px-4 py-3 text-sm outline-none focus:border-accent/40"
          />
        </div>
        <button disabled={busy || !form.display_name.trim()} className="mt-6 w-full rounded-xl bg-accent py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Signing in…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}

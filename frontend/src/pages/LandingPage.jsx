import React from 'react'
import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg bg-noise text-ink flex items-center justify-center px-6">
      <div className="max-w-5xl w-full grid lg:grid-cols-[1.2fr_0.8fr] gap-8 items-center">
        <div>
          <div className="inline-flex items-center px-3 py-1 rounded-full border border-accent/30 bg-accent/10 text-[11px] uppercase tracking-[0.2em] text-accent mb-5">
            Policy-aware contract workflows
          </div>
          <h1 className="font-display text-5xl leading-[1] tracking-tight max-w-3xl">
            Upload contracts, detect violations, and resume reviews from Mongo-backed state.
          </h1>
          <p className="text-muted text-[15px] leading-relaxed mt-5 max-w-2xl">
            AIger&apos;s Universe now supports policy-guided review flows, redline-ready reports, and user-linked workflow history so review work survives logout and backend restarts.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/login" className="px-5 py-3 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90">Sign in</Link>
            <Link to="/login" className="px-5 py-3 rounded-xl border border-line bg-panel/60 text-sm font-medium hover:border-accent/40">Log in</Link>
          </div>
        </div>
        <div className="rounded-3xl border border-line bg-panel/70 backdrop-blur p-6 shadow-2xl shadow-black/20">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-3">What this flow now supports</div>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <div className="rounded-xl border border-line bg-elev/50 p-4">Readable markdown reports with redline suggestions and PII findings.</div>
            <div className="rounded-xl border border-line bg-elev/50 p-4">Policy library selection per workflow so compliance steps can refer to explicit rules.</div>
            <div className="rounded-xl border border-line bg-elev/50 p-4">User-linked workflow history in Mongo, with resume after interruption.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

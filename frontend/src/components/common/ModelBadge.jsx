import React from 'react'
import clsx from 'clsx'

function styleForModel(model = '') {
  const value = model.toLowerCase()
  if (value.includes('gpt-5')) return 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300'
  if (value.includes('o3') || value.includes('o4')) return 'border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-300'
  if (value.includes('gpt-4.1')) return 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300'
  if (value.includes('gpt-4o')) return 'border-sky-400/35 bg-sky-400/10 text-sky-300'
  if (value.includes('claude')) return 'border-amber-400/35 bg-amber-400/10 text-amber-300'
  if (value.includes('gemini')) return 'border-violet-400/35 bg-violet-400/10 text-violet-300'
  if (value.includes('llama')) return 'border-rose-400/35 bg-rose-400/10 text-rose-300'
  return 'border-white/15 bg-white/5 text-muted'
}

export default function ModelBadge({ model, className }) {
  return (
    <span className={clsx('px-2 py-0.5 text-[10px] font-mono uppercase rounded-full border tracking-wide', styleForModel(model), className)}>
      {model}
    </span>
  )
}

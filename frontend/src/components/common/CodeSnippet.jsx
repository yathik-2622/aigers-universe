import React, { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import Prism from 'prismjs'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-markdown'

const LANGUAGE_ALIASES = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  html: 'markup',
  xml: 'markup',
  md: 'markdown',
  tool: 'json',
  'tool args': 'json',
  'tool result': 'json',
}

function normalizeCode(value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return raw
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\/\/n/g, '\n')
}

function inferLanguage(code, language) {
  const normalized = (language || '').toLowerCase().trim()
  if (normalized) return LANGUAGE_ALIASES[normalized] || normalized
  const text = code.trim()
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) return 'json'
  if (/^(curl|npm|pnpm|yarn|python|pip|uvicorn|pytest)\b/m.test(text)) return 'bash'
  if (/^\s*(def|from\s+[\w.]+\s+import|import\s+[\w.]+|async\s+def|class\s+\w+[\(:])/m.test(text)) return 'python'
  if (/^\s*(import\s+.*\s+from\s+['"]|export|const|let|function|class)\b/m.test(text)) return 'javascript'
  return 'text'
}

function highlightedHtml(code, language) {
  const grammar = Prism.languages[language]
  if (!grammar) return Prism.util.encode(code)
  return Prism.highlight(code, grammar, language)
}

function badgeClass(language) {
  if (['json', 'yaml'].includes(language)) return 'border-amber-300/20 bg-amber-300/10 text-amber-200'
  if (['python', 'bash', 'shell'].includes(language)) return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
  if (['javascript', 'jsx', 'typescript', 'tsx'].includes(language)) return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200'
  if (['sql', 'go', 'java', 'ruby'].includes(language)) return 'border-violet-300/20 bg-violet-300/10 text-violet-200'
  if (['markup', 'css', 'markdown'].includes(language)) return 'border-rose-300/20 bg-rose-300/10 text-rose-200'
  return 'border-white/10 bg-black/20 text-muted'
}

export default function CodeSnippet({ code, language = '' }) {
  const [copied, setCopied] = useState(false)
  const normalized = useMemo(() => normalizeCode(code || ''), [code])
  const lang = useMemo(() => inferLanguage(normalized, language), [normalized, language])
  const html = useMemo(() => highlightedHtml(normalized, lang), [normalized, lang])
  const lines = normalized.split('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(normalized)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="group overflow-hidden rounded-xl border border-white/10 bg-[#070b13] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-3 py-2">
        <div className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent2" />
          <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${badgeClass(lang)}`}>
            {lang}
          </span>
          <span className="font-mono text-[10px] text-muted">{lines.length} lines</span>
        </div>
        <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted hover:border-accent/30 hover:text-ink">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <pre className={`language-${lang} m-0 min-w-full p-0 font-mono text-[12px] leading-6`}>
          <code className={`language-${lang} block p-4`} dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </div>
  )
}

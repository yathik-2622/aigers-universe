import React from 'react'

const KEYWORDS = new Set(['from', 'import', 'async', 'await', 'def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'try', 'except', 'with', 'const', 'let', 'function', 'new'])

function tokenizeLine(line) {
  const tokens = []
  let i = 0
  while (i < line.length) {
    const current = line[i]
    const next = line[i + 1]

    if (current === '#' || (current === '/' && next === '/')) {
      tokens.push({ type: 'comment', value: line.slice(i) })
      break
    }

    if (current === '"' || current === '\'') {
      let j = i + 1
      while (j < line.length) {
        if (line[j] === current && line[j - 1] !== '\\') {
          j += 1
          break
        }
        j += 1
      }
      tokens.push({ type: 'string', value: line.slice(i, j) })
      i = j
      continue
    }

    if (/\d/.test(current)) {
      let j = i + 1
      while (j < line.length && /[\d.]/.test(line[j])) j += 1
      tokens.push({ type: 'number', value: line.slice(i, j) })
      i = j
      continue
    }

    if (/[A-Za-z_]/.test(current)) {
      let j = i + 1
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j += 1
      const value = line.slice(i, j)
      tokens.push({ type: KEYWORDS.has(value) ? 'keyword' : 'plain', value })
      i = j
      continue
    }

    tokens.push({ type: 'plain', value: current })
    i += 1
  }
  return tokens
}

function tokenClass(type) {
  if (type === 'keyword') return 'text-[#ff7b72]'
  if (type === 'string') return 'text-[#7ee787]'
  if (type === 'number') return 'text-[#79c0ff]'
  if (type === 'comment') return 'text-muted'
  return ''
}


function renderLine(line, idx) {
  const tokens = tokenizeLine(line)
  return (
    <div key={idx} className="grid grid-cols-[42px_1fr] gap-3">
      <div className="text-right text-muted select-none">{idx + 1}</div>

      <div className="whitespace-pre-wrap break-words">
        {tokens.length === 0 ? '\u00a0' : tokens.map((token, tokenIdx) => (
          <span key={`${idx}-${tokenIdx}`} className={tokenClass(token.type)}>
            {token.value}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function CodeSnippet({ code, language = '' }) {
  return (
    <div className="overflow-auto rounded-[22px] border border-line bg-panel px-4 py-4 font-mono text-[12px] leading-6 text-ink">
      {language ? <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-muted">{language}</div> : null}

      {(code || '').split('\n').map(renderLine)}
    </div>
  )
}

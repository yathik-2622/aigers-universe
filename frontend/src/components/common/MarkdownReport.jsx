import React from 'react'
import CodeSnippet from './CodeSnippet.jsx'

function parseInline(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-elev/70 border border-line">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export default function MarkdownReport({ markdown }) {
  const lines = markdown.split('\n')
  const blocks = []
  let list = []
  let code = []
  let inCode = false

  const flushList = () => {
    if (!list.length) return
    blocks.push({ type: 'list', items: list })
    list = []
  }

  lines.forEach((line) => {
    if (line.startsWith('```')) {
      flushList()
      if (inCode) {
        blocks.push({ type: 'code', text: code.join('\n') })
        code = []
        inCode = false
      } else {
        inCode = true
      }
      return
    }
    if (inCode) {
      code.push(line)
      return
    }
    if (line.startsWith('- ')) {
      list.push(line.slice(2))
      return
    }
    flushList()
    if (!line.trim()) {
      blocks.push({ type: 'space' })
    } else if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) })
    } else if (/^\d+\.\s/.test(line)) {
      blocks.push({ type: 'callout', text: line })
    } else if (/^(Note|Warning|Risk|Action|Recommendation):/i.test(line)) {
      blocks.push({ type: 'callout', text: line })
    } else {
      blocks.push({ type: 'p', text: line })
    }
  })
  flushList()

  return (
    <div className="space-y-4 text-[14px] leading-7 text-ink">
      {blocks.map((block, idx) => {
        if (block.type === 'space') return <div key={idx} className="h-1" />
        if (block.type === 'h1') return <h1 key={idx} className="font-display text-3xl tracking-tight text-white" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'h2') return <h2 key={idx} className="font-display text-xl tracking-tight pt-2 text-[#8de8ff]" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'h3') return <h3 key={idx} className="font-semibold text-base pt-1 text-[#ffd580]" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'list') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-2 text-[#ccd6ea]">
              {block.items.map((item, itemIdx) => <li key={itemIdx} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />)}
            </ul>
          )
        }
        if (block.type === 'code') return <CodeSnippet key={idx} code={block.text} />
        if (block.type === 'callout') return <div key={idx} className="rounded-2xl border border-accent/20 bg-[linear-gradient(135deg,rgba(92,225,230,0.12),rgba(255,255,255,0.03))] px-4 py-3 text-[#e3ecff] shadow-[0_12px_30px_rgba(0,0,0,0.18)]" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        return <p key={idx} className="text-[#c5cee0]" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
      })}
    </div>
  )
}

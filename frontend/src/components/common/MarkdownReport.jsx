import React, { Fragment, useMemo } from 'react'
import CodeSnippet from './CodeSnippet.jsx'

function escapeHtml(value) {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function parseInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.92em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function normalizeContent(markdown) {
  const raw = typeof markdown === 'string' ? markdown : JSON.stringify(markdown, null, 2)
  if (!raw.includes('\n') && raw.includes('\\n')) return raw.replace(/\\n/g, '\n')
  return raw.replace(/\/\/n/g, '\n')
}

function looksLikeJson(text) {
  const trimmed = (text || '').trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

function tryPrettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return ''
  }
}

function isMarkdownTableLine(line) {
  return line.includes('|') && line.trim().startsWith('|')
}

function parseMarkdownTable(lines) {
  const rows = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
  if (rows.length < 2) return null
  const separator = rows[1]
  if (!separator.every((cell) => /^:?-{2,}:?$/.test(cell || ''))) return null
  return {
    headers: rows[0],
    rows: rows.slice(2),
  }
}

function parseErDiagram(source) {
  const entities = {}
  const relations = []
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean)
  let currentEntity = ''
  let insideEntity = false

  for (const line of lines) {
    if (line === 'erDiagram') continue
    if (line.endsWith('{')) {
      currentEntity = line.replace('{', '').trim()
      insideEntity = true
      entities[currentEntity] = entities[currentEntity] || []
      continue
    }
    if (line === '}') {
      insideEntity = false
      currentEntity = ''
      continue
    }
    if (insideEntity && currentEntity) {
      entities[currentEntity].push(line)
      continue
    }
    const match = line.match(/^([A-Za-z0-9_]+)\s+([|}{o\-\.]+)\s+([A-Za-z0-9_]+)\s*:\s*(.+)$/)
    if (match) {
      relations.push({ from: match[1], connector: match[2], to: match[3], label: match[4] })
    }
  }

  return { entities, relations }
}

function ErDiagramView({ source }) {
  const parsed = useMemo(() => parseErDiagram(source), [source])
  const entityEntries = Object.entries(parsed.entities)

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-[#d8eefe]">
        Mermaid `erDiagram` detected. The schema is rendered as structured entities and relationships below.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {entityEntries.map(([name, fields]) => (
          <div key={name} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{name}</div>
            <div className="mt-3 space-y-2">
              {fields.map((field, index) => (
                <div key={`${name}-${index}`} className="rounded-2xl bg-white/[0.04] px-3 py-2 font-mono text-xs text-[#dbe7f7]">
                  {field}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {parsed.relations.length ? (
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Relationships</div>
          <div className="mt-3 space-y-2">
            {parsed.relations.map((relation, index) => (
              <div key={`${relation.from}-${relation.to}-${index}`} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2 text-sm text-[#dbe7f7]">
                <span className="font-semibold text-accent">{relation.from}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-xs text-muted">{relation.connector}</span>
                <span className="font-semibold text-accent2">{relation.to}</span>
                <span className="text-muted">{relation.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <CodeSnippet code={source} language="mermaid" />
    </div>
  )
}

function TableBlock({ table }) {
  return (
    <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-white/[0.03]">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-white/[0.05] text-left text-[#eef5ff]">
            {table.headers.map((header, index) => (
              <th key={index} className="border-b border-white/10 px-4 py-3 font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-white/5 text-[#ced8eb]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseBlocks(content) {
  const lines = content.split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      blocks.push({ type: 'space' })
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const language = line.replace(/```/, '').trim()
      const code = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      const text = code.join('\n')
      blocks.push(language === 'mermaid' && text.includes('erDiagram') ? { type: 'er', text } : { type: 'code', text, language })
      continue
    }

    if (isMarkdownTableLine(line)) {
      const tableLines = []
      while (index < lines.length && isMarkdownTableLine(lines[index])) {
        tableLines.push(lines[index])
        index += 1
      }
      const table = parseMarkdownTable(tableLines)
      if (table) {
        blocks.push({ type: 'table', table })
        continue
      }
      blocks.push({ type: 'p', text: tableLines.join('\n') })
      continue
    }

    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) })
      index += 1
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
      index += 1
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
      index += 1
      continue
    }
    if (line.startsWith('- ')) {
      const items = []
      while (index < lines.length && lines[index].startsWith('- ')) {
        items.push(lines[index].slice(2))
        index += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (index < lines.length && /^\d+\.\s/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s/, ''))
        index += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !lines[index].startsWith('#') && !lines[index].startsWith('```') && !lines[index].startsWith('- ') && !/^\d+\.\s/.test(lines[index]) && !isMarkdownTableLine(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'p', text: paragraph.join('\n') })
  }

  return blocks
}

export default function MarkdownReport({ markdown }) {
  const normalized = normalizeContent(markdown)
  const prettyJson = looksLikeJson(normalized) ? tryPrettyJson(normalized) : ''

  if (prettyJson) {
    return <CodeSnippet code={prettyJson} language="json" />
  }

  const blocks = parseBlocks(normalized)

  return (
    <div className="space-y-4 text-[14px] leading-7 text-ink">
      {blocks.map((block, idx) => {
        if (block.type === 'space') return <div key={idx} className="h-1" />
        if (block.type === 'h1') return <h1 key={idx} className="font-display text-3xl tracking-tight text-ink" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'h2') return <h2 key={idx} className="font-display pt-2 text-xl tracking-tight text-accent2" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'h3') return <h3 key={idx} className="pt-1 text-base font-semibold text-[#ffd580]" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'code') return <CodeSnippet key={idx} code={block.text} language={block.language} />
        if (block.type === 'er') return <ErDiagramView key={idx} source={block.text} />
        if (block.type === 'table') return <TableBlock key={idx} table={block.table} />
        if (block.type === 'ul') {
          return (
            <ul key={idx} className="list-disc space-y-2 pl-5 text-[#ccd6ea]">
              {block.items.map((item, itemIdx) => <li key={itemIdx} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />)}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={idx} className="list-decimal space-y-2 pl-5 text-[#ccd6ea]">
              {block.items.map((item, itemIdx) => <li key={itemIdx} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />)}
            </ol>
          )
        }
        return (
          <Fragment key={idx}>
            <p className="whitespace-pre-wrap text-[#c5cee0]" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
          </Fragment>
        )
      })}
    </div>
  )
}

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Bot, CloudSun, Database, FileSearch, Globe, Paperclip, Search, Send, ShieldCheck, Sparkles, TriangleAlert, Upload, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { sendToolChat } from '../api/toolChat.js'
import { listTools } from '../api/platform.js'
import { importGithubRepo, listDocuments, uploadDocument } from '../api/documents.js'

const TOOL_GUIDES = {
  semantic_search: {
    icon: Search,
    title: 'Semantic Search',
    purpose: 'Search uploaded documents and indexed chunks by meaning, not exact keywords.',
    input: 'Ask for a topic, clause, obligation, or fact you expect to exist in uploaded documents.',
    output: 'Returns ranked matches with chunk text and metadata you can use for downstream review.',
    example: 'Find clauses about termination notice periods in my uploaded contracts.',
  },
  knowledge_base_search: {
    icon: Search,
    title: 'Knowledge Base Search',
    purpose: 'Search any uploaded KB material across modernization, architecture, contracts, or policy use cases.',
    input: 'Ask for architecture notes, migration risks, domain terms, known issues, or requirement snippets.',
    output: 'Returns semantically matched KB chunks with metadata and rank order.',
    example: 'Search my modernization KB for service boundaries and current deployment constraints.',
  },
  policy_library_search: {
    icon: BookOpen,
    title: 'Policy Library Search',
    purpose: 'Search uploaded governance policies and policy rules that should guide agent decisions.',
    input: 'Describe the policy topic, risk area, or requirement you want to retrieve.',
    output: 'Returns matching policy rules with severity, description, and guidance.',
    example: 'Search my uploaded policies for PII masking requirements.',
  },
  rules_engine_check: {
    icon: ShieldCheck,
    title: 'Rules Engine Check',
    purpose: 'Check text against stored governance rules and produce pass, fail, or review findings.',
    input: 'Provide the contract text, clause, or paragraph you want checked against compliance rules.',
    output: 'Returns matched rules, violation status, and reasons for each relevant rule.',
    example: 'Check this NDA clause against confidentiality and retention policies.',
  },
  risk_scorer: {
    icon: TriangleAlert,
    title: 'Risk Scorer',
    purpose: 'Estimate operational and business risk with a score, level, and key concerns.',
    input: 'Provide the clause or document section plus any extra business context that changes risk.',
    output: 'Returns score, RED/AMBER/GREEN level, rationale, and key concerns.',
    example: 'Score the risk of this land contract where dates and payment terms are incomplete.',
  },
  document_store: {
    icon: Database,
    title: 'Document Store',
    purpose: 'Store or retrieve structured agent-side records from Mongo-backed collections.',
    input: 'Specify whether you want to store data or retrieve data from a named collection.',
    output: 'Returns saved IDs or retrieved records depending on the action.',
    example: 'Retrieve saved clause-review notes from collection compliance_reviews.',
  },
  wikipedia_search: {
    icon: Globe,
    title: 'Wikipedia Search',
    purpose: 'Get fast public background context and source links before deeper official-doc research.',
    input: 'Ask for a topic, technology, company, or domain concept.',
    output: 'Returns titles, short descriptions, and article URLs.',
    example: 'Search Wikipedia for strangler fig application modernization pattern.',
  },
  webpage_fetch: {
    icon: FileSearch,
    title: 'Webpage Fetch',
    purpose: 'Fetch and clean public pages such as official docs, standards, migration guides, or vendor references.',
    input: 'Provide a direct URL you want normalized into readable text.',
    output: 'Returns cleaned text content, source URL, and content length.',
    example: 'Fetch https://docs.langflow.org/concepts-playground and summarize the key operator workflow.',
  },
  weather_current: {
    icon: CloudSun,
    title: 'Weather Current',
    purpose: 'Fetch live current weather without a paid key using Open-Meteo.',
    input: 'Provide latitude and longitude, or ask with coordinates embedded in the prompt.',
    output: 'Returns realtime temperature, humidity, wind, precipitation, and units.',
    example: 'Get current weather for 12.9716, 77.5946.',
  },
  openweather_current: {
    icon: CloudSun,
    title: 'OpenWeather Current',
    purpose: 'Fetch live current weather from OpenWeather when your platform has an API key configured.',
    input: 'Provide latitude, longitude, and optional units.',
    output: 'Returns the provider payload including weather conditions, clouds, visibility, and location metadata.',
    example: 'Use OpenWeather for 40.7128, -74.0060 in metric units.',
  },
  serpapi_search: {
    icon: Globe,
    title: 'SerpAPI Search',
    purpose: 'Run live search-engine retrieval with production SERP coverage for modernization, vendor, and documentation research.',
    input: 'Give a focused search query and optional location bias.',
    output: 'Returns organic results with title, link, snippet, and search metadata.',
    example: 'Search for official AWS modernization assessment documentation.',
  },
}

const STARTER_PROMPTS = [
  'Search my uploaded policies for PII handling guidance.',
  'Find clauses about property transfer and payment obligations in my uploaded documents.',
  'Check this clause against compliance rules: Seller may retain copies of purchaser identity documents indefinitely.',
  'Score the risk of a contract with missing dates, unnamed parties, and blank payment fields.',
]

export default function ToolPlaygroundPage() {
  const [toolItems, setToolItems] = useState([])
  const [preferredTool, setPreferredTool] = useState('')
  const [input, setInput] = useState(STARTER_PROMPTS[0])
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [documents, setDocuments] = useState([])
  const [category, setCategory] = useState('general')
  const [repoUrl, setRepoUrl] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    listTools().then((d) => setToolItems(d.items || [])).catch(() => {})
    listDocuments().then((d) => setDocuments(d.documents || [])).catch(() => {})
  }, [])

  const visibleGuides = useMemo(
    () => toolItems.map((tool) => {
      const guide = TOOL_GUIDES[tool.name] || {
        icon: Wrench,
        title: tool.name.replaceAll('_', ' '),
        purpose: tool.description || 'Platform MCP tool.',
        input: 'Provide the parameters described in the prompt or tool documentation.',
        output: 'Returns the tool payload from the backend.',
        example: `Use ${tool.name} for the current task.`,
      }
      return { key: tool.name, category: tool.category, requiresKey: ['serpapi_search', 'openweather_current'].includes(tool.name), ...guide }
    }),
    [toolItems],
  )

  const submit = async (message = input) => {
    if (!message.trim()) return
    const nextMessages = [...messages, { role: 'user', content: message }]
    setMessages(nextMessages)
    setBusy(true)
    try {
      const res = await sendToolChat({ messages: nextMessages, preferred_tool: preferredTool || null })
      setMessages([...nextMessages, { role: 'assistant', content: res.reply || 'Tool call completed.', tool_results: res.tool_results || [] }])
      if (message === input) setInput('')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Tool playground request failed')
    } finally {
      setBusy(false)
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadDocument(file, category)
      toast.success(`${res.filename} uploaded for semantic search`)
      setInput((prev) => `${prev}${prev ? '\n\n' : ''}Use the uploaded document ${res.filename} in the next tool step.`)
      const docs = await listDocuments()
      setDocuments(docs.documents || [])
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const importRepo = async () => {
    if (!repoUrl.trim()) return toast.error('Enter a GitHub repository URL')
    setUploading(true)
    try {
      const res = await importGithubRepo(repoUrl.trim(), category)
      toast.success(`Imported ${res.files_indexed} repo files into KB`)
      const docs = await listDocuments()
      setDocuments(docs.documents || [])
      setRepoUrl('')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'GitHub import failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-8 h-full min-h-0 max-w-[1540px]">
      <div className="grid xl:grid-cols-[0.92fr_1.38fr] gap-5 h-full min-h-0">
        <section className="min-h-0 overflow-y-auto pr-1 space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-accent" />
              <div className="font-display text-lg">Enterprise Tool Guide</div>
            </div>
            <div className="text-sm text-muted leading-relaxed">
              Ask in plain English, or force a specific tool when you need deterministic inspection. Each card tells operators what input to give and what result shape to expect.
            </div>
            <div className="mt-5">
              <label className="text-[11px] uppercase tracking-widest text-muted block mb-2">Preferred tool</label>
              <select value={preferredTool} onChange={(e) => setPreferredTool(e.target.value)} className="glass-select w-full px-4 py-2.5 text-sm outline-none focus:border-accent/40">
                <option value="">Auto-select best tool</option>
                {toolItems.map((tool) => <option key={tool.name} value={tool.name}>{tool.name}</option>)}
              </select>
            </div>
            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-widest text-muted block mb-2">KB upload category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="glass-select w-full px-4 py-2.5 text-sm outline-none focus:border-accent/40">
                <option value="general">General</option>
                <option value="modernization">Modernization</option>
                <option value="architecture">Architecture</option>
                <option value="compliance">Compliance</option>
                <option value="contracts">Contracts</option>
                <option value="repo-context">Repo Context</option>
              </select>
            </div>
            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-widest text-muted block mb-2">GitHub repo import</label>
              <div className="flex gap-2">
                <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-accent/40" />
                <button onClick={importRepo} disabled={uploading} className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">Import</button>
              </div>
              <div className="mt-2 text-[11px] text-muted">Public repos work immediately. Private repos can be imported when `GITHUB_TOKEN` is configured on the backend.</div>
            </div>
          </div>

          <div className="grid gap-3">
            {visibleGuides.map(({ key, icon: Icon, title, purpose, input: guideInput, output, example, category, requiresKey }) => (
              <div key={key} className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.14)]">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl border border-accent/30 bg-accent/10 flex items-center justify-center">
                    <Icon size={16} className="text-accent" />
                  </div>
                  <div>
                    <div className="font-medium">{title}</div>
                    <div className="text-[11px] font-mono text-muted">{key}{category ? ` · ${category}` : ''}</div>
                  </div>
                  {requiresKey && <div className="ml-auto rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-warn">Key required</div>}
                </div>
                <div className="space-y-2 text-[13px] text-muted leading-relaxed">
                  <div><span className="text-ink font-medium">Use when:</span> {purpose}</div>
                  <div><span className="text-ink font-medium">Input:</span> {guideInput}</div>
                  <div><span className="text-ink font-medium">Output:</span> {output}</div>
                  <button onClick={() => setInput(example)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[12px] text-ink hover:border-accent/40">
                    Example prompt: {example}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.14)]">
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={16} className="text-accent2" />
              <div className="font-display text-lg">Quick starters</div>
            </div>
            <div className="grid gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button key={prompt} onClick={() => submit(prompt)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm hover:border-accent/40">
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.14)]">
            <div className="font-display text-lg mb-3">Your KB history</div>
            <div className="space-y-2">
              {documents.slice(0, 8).map((doc) => (
                <div key={doc.document_id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <div className="font-medium truncate">{doc.filename}</div>
                  <div className="text-[11px] text-muted">{doc.category || 'general'} · {doc.file_type} · {doc.chunk_count} chunks</div>
                </div>
              ))}
              {documents.length === 0 && <div className="text-sm text-muted">No uploaded knowledge-base files yet.</div>}
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] flex flex-col h-full min-h-0 shadow-[0_24px_80px_rgba(0,0,0,0.18)] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-accent/10 via-transparent to-accent2/10">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-accent" />
              <div className="font-display text-xl">MCP Tool Chat</div>
            </div>
            <div className="text-[12px] text-muted mt-1">
              Use this like a production operator console: ask, inspect tool outputs, and validate platform tool behavior before wiring tools into agents or workflows.
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 bg-[radial-gradient(circle_at_top,_rgba(0,213,255,0.08),_transparent_30%)]">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-muted">
                Start by selecting a tool or using one of the guided prompts. This chat shows both the assistant explanation and the raw tool payload returned by the backend.
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`rounded-2xl border p-4 ${msg.role === 'user' ? 'border-accent/30 bg-accent/10 ml-14' : 'border-white/10 bg-white/5 mr-14'}`}>
                <div className="text-[11px] uppercase tracking-widest text-muted mb-2">{msg.role === 'user' ? 'Operator' : 'Tool assistant'}</div>
                <div className="text-sm whitespace-pre-wrap leading-6">{msg.content}</div>
                {msg.tool_results?.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {msg.tool_results.map((item, toolIdx) => (
                      <div key={`${item.tool}-${toolIdx}`} className="rounded-xl border border-white/10 bg-[#0b1120]/75 overflow-hidden">
                        <div className="px-3 py-2 border-b border-white/10 text-[11px] font-mono text-accent flex items-center justify-between">
                          <span>{item.tool}</span>
                          <span>{Object.keys(item.args || {}).length} args</span>
                        </div>
                        <div className="grid md:grid-cols-2 gap-px bg-white/10">
                          <div className="bg-white/5 p-3">
                            <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Input sent</div>
                            <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(item.args, null, 2)}</pre>
                          </div>
                          <div className="bg-white/5 p-3">
                            <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Output received</div>
                            <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(item.result, null, 2)}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-white/10 bg-[#0b1120]/85">
            <input ref={fileInput} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleUpload} />
            <div className="flex items-end gap-3">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} placeholder="Ask a tool to search policies, score risk, validate clauses, or inspect stored records..." className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40 resize-none" />
              <div className="flex flex-col gap-2">
                <button onClick={() => fileInput.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-muted hover:text-ink disabled:opacity-50">
                  {uploading ? <Paperclip size={14} /> : <Upload size={14} />} {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button disabled={busy} onClick={() => submit()} className="rounded-full bg-accent text-white px-5 py-3 text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
                  <Send size={14} /> {busy ? 'Running...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

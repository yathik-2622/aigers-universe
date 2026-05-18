import React, { useEffect, useMemo, useState } from 'react'
import { BookOpen, Bot, Database, Search, Send, ShieldCheck, Sparkles, TriangleAlert, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { sendToolChat } from '../api/toolChat.js'
import { listTools } from '../api/platform.js'

const TOOL_GUIDES = {
  semantic_search: {
    icon: Search,
    title: 'Semantic Search',
    purpose: 'Search uploaded documents and indexed chunks by meaning, not exact keywords.',
    input: 'Ask for a topic, clause, obligation, or fact you expect to exist in uploaded documents.',
    output: 'Returns ranked matches with chunk text and metadata you can use for downstream review.',
    example: 'Find clauses about termination notice periods in my uploaded contracts.',
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
}

const STARTER_PROMPTS = [
  'Search my uploaded policies for PII handling guidance.',
  'Find clauses about property transfer and payment obligations in my uploaded documents.',
  'Check this clause against compliance rules: Seller may retain copies of purchaser identity documents indefinitely.',
  'Score the risk of a contract with missing dates, unnamed parties, and blank payment fields.',
]

export default function ToolPlaygroundPage() {
  const [tools, setTools] = useState([])
  const [preferredTool, setPreferredTool] = useState('')
  const [input, setInput] = useState(STARTER_PROMPTS[0])
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listTools().then(d => setTools(d.tools || [])).catch(() => {})
  }, [])

  const visibleGuides = useMemo(
    () => tools.filter((tool) => TOOL_GUIDES[tool]).map((tool) => ({ key: tool, ...TOOL_GUIDES[tool] })),
    [tools],
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

  return (
    <div className="p-8 max-w-[1500px]">
      <div className="grid xl:grid-cols-[0.95fr_1.35fr] gap-5">
        <section className="space-y-4">
          <div className="rounded-[28px] border border-line bg-panel/70 p-5 shadow-2xl shadow-black/15">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-accent" />
              <div className="font-display text-lg">Enterprise Tool Guide</div>
            </div>
            <div className="text-sm text-muted leading-relaxed">
              Ask in plain English, or force a specific tool when you need deterministic inspection. Each card below tells the user what input to give and what result shape to expect.
            </div>
            <div className="mt-5">
              <label className="text-[11px] uppercase tracking-widest text-muted block mb-2">Preferred tool</label>
              <select value={preferredTool} onChange={(e) => setPreferredTool(e.target.value)} className="w-full rounded-xl border border-line bg-elev/50 px-3 py-2.5 text-sm outline-none focus:border-accent/40">
                <option value="">Auto-select best tool</option>
                {tools.map(tool => <option key={tool} value={tool}>{tool}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3">
            {visibleGuides.map(({ key, icon: Icon, title, purpose, input: guideInput, output, example }) => (
              <div key={key} className="rounded-[24px] border border-line bg-panel/60 p-4 shadow-xl shadow-black/10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl border border-accent/30 bg-accent/10 flex items-center justify-center">
                    <Icon size={16} className="text-accent" />
                  </div>
                  <div>
                    <div className="font-medium">{title}</div>
                    <div className="text-[11px] font-mono text-muted">{key}</div>
                  </div>
                </div>
                <div className="space-y-2 text-[13px] text-muted leading-relaxed">
                  <div><span className="text-ink font-medium">Use when:</span> {purpose}</div>
                  <div><span className="text-ink font-medium">Input:</span> {guideInput}</div>
                  <div><span className="text-ink font-medium">Output:</span> {output}</div>
                  <button onClick={() => setInput(example)} className="w-full rounded-xl border border-line bg-elev/50 px-3 py-2 text-left text-[12px] text-ink hover:border-accent/40">
                    Example prompt: {example}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[28px] border border-line bg-panel/60 p-5 shadow-2xl shadow-black/10">
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={16} className="text-accent2" />
              <div className="font-display text-lg">Quick starters</div>
            </div>
            <div className="grid gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button key={prompt} onClick={() => submit(prompt)} className="rounded-xl border border-line bg-elev/40 px-3 py-2 text-left text-sm hover:border-accent/40">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-line bg-panel/70 flex flex-col min-h-[760px] shadow-2xl shadow-black/15 overflow-hidden">
          <div className="px-6 py-5 border-b border-line bg-gradient-to-r from-accent/10 via-transparent to-accent2/10">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-accent" />
              <div className="font-display text-xl">MCP Tool Chat</div>
            </div>
            <div className="text-[12px] text-muted mt-1">
              Use this like a production operator console: ask, inspect tool outputs, and validate what the platform tools are doing before wiring them into agents or workflows.
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[radial-gradient(circle_at_top,_rgba(31,111,235,0.08),_transparent_35%)]">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line bg-elev/30 p-6 text-sm text-muted">
                Start by selecting a tool or using one of the guided prompts. This chat will show both the assistant explanation and the raw tool payload returned by the backend.
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`rounded-2xl border p-4 ${msg.role === 'user' ? 'border-accent/30 bg-accent/10 ml-14' : 'border-line bg-elev/40 mr-14'}`}>
                <div className="text-[11px] uppercase tracking-widest text-muted mb-2">{msg.role === 'user' ? 'Operator' : 'Tool assistant'}</div>
                <div className="text-sm whitespace-pre-wrap leading-6">{msg.content}</div>
                {msg.tool_results?.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {msg.tool_results.map((item, toolIdx) => (
                      <div key={`${item.tool}-${toolIdx}`} className="rounded-xl border border-line bg-panel/70 overflow-hidden">
                        <div className="px-3 py-2 border-b border-line text-[11px] font-mono text-accent flex items-center justify-between">
                          <span>{item.tool}</span>
                          <span>{Object.keys(item.args || {}).length} args</span>
                        </div>
                        <div className="grid md:grid-cols-2 gap-px bg-line">
                          <div className="bg-elev/40 p-3">
                            <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Input sent</div>
                            <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(item.args, null, 2)}</pre>
                          </div>
                          <div className="bg-elev/40 p-3">
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

          <div className="p-4 border-t border-line bg-panel/80">
            <div className="flex items-end gap-3">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} placeholder="Ask a tool to search policies, score risk, validate clauses, or inspect stored records..." className="flex-1 rounded-2xl border border-line bg-elev/50 px-4 py-3 text-sm outline-none focus:border-accent/40 resize-none" />
              <button disabled={busy} onClick={() => submit()} className="rounded-2xl bg-accent text-white px-5 py-3.5 text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
                <Send size={14} /> {busy ? 'Running...' : 'Send'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

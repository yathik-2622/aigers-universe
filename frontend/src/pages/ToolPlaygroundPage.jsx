import React, { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { sendToolChat } from '../api/toolChat.js'
import { listTools } from '../api/platform.js'

export default function ToolPlaygroundPage() {
  const [tools, setTools] = useState([])
  const [preferredTool, setPreferredTool] = useState('')
  const [input, setInput] = useState('Search my policies for PII handling guidance')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { listTools().then(d => setTools(d.tools || [])).catch(() => {}) }, [])

  const submit = async () => {
    if (!input.trim()) return
    const nextMessages = [...messages, { role: 'user', content: input }]
    setMessages(nextMessages)
    setBusy(true)
    try {
      const res = await sendToolChat({ messages: nextMessages, preferred_tool: preferredTool || null })
      setMessages([...nextMessages, { role: 'assistant', content: res.reply || 'Tool call completed.', tool_results: res.tool_results || [] }])
    } finally {
      setBusy(false)
      setInput('')
    }
  }

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-4">
        <section className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="font-display text-lg mb-3">Tool Guide</div>
          <div className="text-sm text-muted leading-relaxed space-y-3">
            <p>Use this playground like a Langflow-style tool playground: ask for a tool action in plain language, optionally force a tool, and inspect the tool output returned by the backend.</p>
            <p>Good prompts: "Search my uploaded policies for confidentiality rules", "Run the risk scorer on this clause", "Check this paragraph against compliance rules".</p>
          </div>
          <div className="mt-5">
            <label className="text-[11px] uppercase tracking-widest text-muted block mb-2">Preferred tool</label>
            <select value={preferredTool} onChange={(e) => setPreferredTool(e.target.value)} className="w-full rounded-lg border border-line bg-elev/50 px-3 py-2 text-sm outline-none focus:border-accent/40">
              <option value="">Auto-select</option>
              {tools.map(tool => <option key={tool} value={tool}>{tool}</option>)}
            </select>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-panel/60 flex flex-col min-h-[560px]">
          <div className="px-5 py-4 border-b border-line">
            <div className="font-display text-lg">MCP Tool Chat</div>
            <div className="text-[12px] text-muted mt-1">Interact with the platform tools from the UI.</div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.length === 0 && <div className="text-sm text-muted">Start a conversation to inspect tool behavior and policy retrieval.</div>}
            {messages.map((msg, idx) => (
              <div key={idx} className={`rounded-xl border p-3 ${msg.role === 'user' ? 'border-accent/30 bg-accent/10 ml-12' : 'border-line bg-elev/40 mr-12'}`}>
                <div className="text-[11px] uppercase tracking-widest text-muted mb-2">{msg.role}</div>
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                {msg.tool_results?.length > 0 && (
                  <pre className="mt-3 text-[11px] whitespace-pre-wrap break-all rounded-lg border border-line bg-panel/60 p-3">{JSON.stringify(msg.tool_results, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-line flex items-end gap-3">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder="Ask the platform tools to do something..." className="flex-1 rounded-xl border border-line bg-elev/50 px-3 py-2 text-sm outline-none focus:border-accent/40 resize-none" />
            <button disabled={busy} onClick={submit} className="rounded-xl bg-accent text-white px-4 py-3 text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
              <Send size={14} /> {busy ? 'Running...' : 'Send'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

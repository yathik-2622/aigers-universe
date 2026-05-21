import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FileUp,
  Globe2,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import CustomSelect from '../components/common/CustomSelect.jsx'
import CodeSnippet from '../components/common/CodeSnippet.jsx'
import MarkdownReport from '../components/common/MarkdownReport.jsx'
import ModalShell from '../components/common/ModalShell.jsx'
import { listModels, listTools } from '../api/platform.js'
import {
  createChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  streamChatMessage,
  updateChatSession,
  uploadChatFiles,
} from '../api/toolChat.js'
import { normalizeModelOptions } from '../lib/modelOptions.js'

const MODES = {
  platform: {
    label: 'AIger Copilot',
    icon: Sparkles,
    placeholder: 'Ask about AIger, its workflows, architecture, agents, tools, A2A, KB, HITL, or what to use for your exact use case...',
    starters: [
      'I have a Java monolith repo. Which AIger agents, tools, and workflow should I use for modernization?',
      'Explain AIger technical architecture from frontend to backend and runtime orchestration.',
      'What should I upload to workflow inputs versus the reusable knowledge base?',
      'Design the best platform workflow for contract risk review with HITL approvals.',
    ],
  },
  general: {
    label: 'General Reasoning',
    icon: BrainCircuit,
    placeholder: 'Ask for coding help, architecture planning, migration strategy, debugging, or broader technical reasoning...',
    starters: [
      'Compare Java Spring Boot and FastAPI for an enterprise modernization roadmap.',
      'Generate a migration validation checklist for moving a service from MySQL to PostgreSQL.',
      'Create a phased rollout plan for converting a Streamlit internal tool into Next.js.',
      'Help me reason through a codebase restructuring plan with risks and dependencies.',
    ],
  },
}

const HISTORY_KEY = 'aigers.copilot.history.collapsed'

function formatSessionTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return value
  }
}

function buildAssistantDraft(messageId, mode, modelName) {
  return {
    message_id: messageId,
    role: 'assistant',
    content: '',
    citations: [],
    tool_results: [],
    follow_up_questions: [],
    processing_logs: [],
    created_at: new Date().toISOString(),
    streaming: true,
    mode,
    model_name: modelName,
  }
}

function updateMessage(messages, messageId, updater) {
  return (messages || []).map((item) => (item.message_id === messageId ? updater(item) : item))
}

function findLatestStreamingMessageId(messages) {
  const items = messages || []
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.streaming) return items[index].message_id
  }
  return ''
}

function ActionIcon({ icon: Icon, label, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-muted transition hover:border-accent/30 hover:text-ink ${className}`}
    >
      <Icon size={14} />
    </button>
  )
}

function MetaTag({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted">
      <span>{label}</span>
      <span className="text-[#dbe6f7]">{value}</span>
    </span>
  )
}

function MessageTools({ message, onCopy, onRegenerate, onOpenCitation, onFollowUp, canRegenerate }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <ActionIcon icon={Copy} label="Copy response" onClick={() => onCopy(message.content)} />
      {canRegenerate && <ActionIcon icon={RefreshCcw} label="Regenerate response" onClick={onRegenerate} />}
      {(message.follow_up_questions || []).map((question) => (
        <button
          key={`${message.message_id}-${question}`}
          type="button"
          onClick={() => onFollowUp(question)}
          className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-muted transition hover:border-accent/30 hover:text-ink"
        >
          {question}
        </button>
      ))}
      {(message.citations || []).map((citation, index) => (
        <button
          key={`${message.message_id}-citation-${index}`}
          type="button"
          onClick={() => onOpenCitation(citation)}
          className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/14"
        >
          <Globe2 size={12} />
          {citation.label || `Citation ${index + 1}`}
        </button>
      ))}
    </div>
  )
}

function MessageMeta({ message }) {
  const usedTools = [...new Set((message.tool_results || []).map((item) => item.tool).filter(Boolean))]
  const toolLabel = usedTools.length
    ? usedTools.join(', ')
    : message.preferred_tool
      ? `${message.preferred_tool} requested`
      : 'auto / none'
  const modeLabel = message.mode === 'general' ? 'General' : 'AIger Copilot'

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <MetaTag label="Mode" value={modeLabel} />
      <MetaTag label="Model" value={message.model_name || 'gpt-4o'} />
      <MetaTag label="Tool" value={toolLabel} />
    </div>
  )
}

function ProcessingPanel({ logs, active = false, onOpenLiveTrace }) {
  const [open, setOpen] = useState(active)
  const latestLog = logs?.[logs.length - 1]

  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  if (!logs?.length) return null

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted transition hover:text-ink"
        >
          <LoaderCircle size={13} className={active ? 'animate-spin text-accent' : 'text-accent'} />
          {active ? 'Reasoning live' : 'Reasoning log'}
          <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={onOpenLiveTrace}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted transition hover:border-accent/30 hover:text-ink"
        >
          <Eye size={12} />
          Open live trace
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {active && latestLog && (
            <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-[#d7eff7]">
              <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
                <span className="inline-flex h-2 w-2 rounded-full bg-accent animate-pulse" />
                Live activity
              </div>
              <div className="mt-2 font-medium">{latestLog.label}</div>
              <div className="mt-1 leading-6 text-[#c0d8e6]">{latestLog.detail}</div>
            </div>
          )}
          {logs.map((log) => (
            <div key={log.step_id} className="rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-muted backdrop-blur-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-accent">{log.label}</div>
              <div className="mt-1 leading-6">{log.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ToolActivity({ items }) {
  if (!items?.length) return null
  return (
    <div className="mt-4">
      <details className="group">
        <summary className="list-none inline-flex cursor-pointer items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted transition hover:text-ink">
          <Wrench size={13} className="text-accent2" />
          Tool activity
          <ChevronDown size={13} className="transition group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-2">
          {items.map((item, index) => (
            <div key={`${item.tool}-${index}`} className="rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-muted backdrop-blur-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-accent">{item.tool}</div>
              <div className="mt-3 space-y-3">
                <CodeSnippet code={JSON.stringify(item.args || {}, null, 2)} language="tool args" />
                <CodeSnippet code={JSON.stringify(item.result || {}, null, 2)} language="tool result" />
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function AssistantMessage({ message, onCopy, onRegenerate, onOpenCitation, onFollowUp, onOpenReasoning }) {
  return (
    <div className="mx-auto w-full max-w-4xl py-7">
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-sm">
          <Bot size={15} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <ProcessingPanel logs={message.processing_logs} active={!!message.streaming} onOpenLiveTrace={() => onOpenReasoning(message.message_id)} />
          {message.content && (
            <div className="mt-4">
              <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted">Response</div>
              <MarkdownReport markdown={message.content} />
            </div>
          )}
          <ToolActivity items={message.tool_results} />
          {!message.streaming && <MessageMeta message={message} />}
          {!message.streaming && (
            <MessageTools
              message={message}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              onOpenCitation={onOpenCitation}
              onFollowUp={onFollowUp}
              canRegenerate
            />
          )}
        </div>
      </div>
    </div>
  )
}

function UserMessage({ message, onCopy }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl justify-end py-6">
      <div className="max-w-[78%]">
        <div className="mb-2 text-right text-[11px] uppercase tracking-[0.22em] text-muted">You</div>
        <div className="whitespace-pre-wrap text-[15px] leading-7 text-ink">{message.content}</div>
        <div className="mt-3 flex justify-end">
          <ActionIcon icon={Copy} label="Copy message" onClick={() => onCopy(message.content)} />
        </div>
      </div>
    </div>
  )
}

export default function ToolPlaygroundPage() {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [session, setSession] = useState(null)
  const [tools, setTools] = useState([])
  const [models, setModels] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [hydrating, setHydrating] = useState(true)
  const [historyCollapsed, setHistoryCollapsed] = useState(() => {
    try { return localStorage.getItem(HISTORY_KEY) === '1' } catch { return false }
  })
  const [search, setSearch] = useState('')
  const [activeCitation, setActiveCitation] = useState(null)
  const [activeReasoningMessageId, setActiveReasoningMessageId] = useState('')
  const [renamingSessionId, setRenamingSessionId] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [draftMode, setDraftMode] = useState('platform')
  const [draftModel, setDraftModel] = useState('gpt-4o')
  const [draftTool, setDraftTool] = useState('')
  const fileInputRef = useRef(null)
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const prevMessageCountRef = useRef(0)

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, historyCollapsed ? '1' : '0') } catch {}
  }, [historyCollapsed])

  useEffect(() => {
    let mounted = true
    Promise.all([listTools(), listModels(), listChatSessions()])
      .then(async ([toolData, modelData, sessionData]) => {
        if (!mounted) return
        const modelItems = normalizeModelOptions(modelData.models || [])
        const sessionItems = sessionData.sessions || []
        setTools(toolData.items || [])
        setModels(modelItems)
        setDraftModel(modelItems[0]?.value || 'gpt-4o')
        setSessions(sessionItems)
        const firstId = sessionItems[0]?.session_id || ''
        if (firstId) {
          setActiveSessionId(firstId)
          const detail = await getChatSession(firstId)
          if (!mounted) return
          setSession(detail.session)
          prevMessageCountRef.current = detail.session.messages?.length || 0
          setDraftMode(detail.session.mode || 'platform')
          setDraftModel(detail.session.model_name || modelItems[0]?.value || 'gpt-4o')
          setDraftTool(detail.session.preferred_tool ?? '')
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setHydrating(false)
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    const nextCount = session?.messages?.length || 0
    const previousCount = prevMessageCountRef.current
    if (container && nextCount > previousCount) {
      container.scrollTop = container.scrollHeight
    }
    prevMessageCountRef.current = nextCount
  }, [session?.messages?.length])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  const currentMode = session?.mode || draftMode
  const currentModel = session?.model_name || draftModel || models[0]?.value || 'gpt-4o'
  const currentTool = session?.preferred_tool ?? draftTool ?? ''
  const placeholder = MODES[currentMode]?.placeholder || MODES.platform.placeholder
  const starterPrompts = MODES[currentMode]?.starters || MODES.platform.starters

  const visibleSessions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter((item) => `${item.title || ''} ${item.last_message_preview || ''}`.toLowerCase().includes(query))
  }, [sessions, search])

  const currentToolNames = useMemo(() => {
    const enabled = new Set(session?.enabled_tools || tools.map((tool) => tool.name))
    return tools.filter((tool) => enabled.has(tool.name))
  }, [session?.enabled_tools, tools])

  const modeOptions = useMemo(() => (
    Object.entries(MODES).map(([value, meta]) => ({ value, label: meta.label }))
  ), [])

  const modelOptions = useMemo(() => models || [], [models])

  const toolOptions = useMemo(() => ([
    { value: '', label: 'Auto tool', meta: 'system' },
    ...currentToolNames.map((tool) => ({ value: tool.name, label: tool.name, meta: tool.category || 'tool' })),
  ]), [currentToolNames])
  const activeReasoningMessage = useMemo(
    () => (session?.messages || []).find((item) => item.message_id === activeReasoningMessageId) || null,
    [activeReasoningMessageId, session?.messages],
  )

  const syncSessionPreview = (sessionId, patch) => {
    setSessions((prev) => prev.map((item) => (item.session_id === sessionId ? { ...item, ...patch } : item)))
  }

  const ensureSession = async (modeName = currentMode) => {
    if (session?.session_id) return session
    setCreating(true)
    try {
      const created = await createChatSession({
        title: 'New AIger chat',
        mode: modeName,
        model_name: draftModel || models[0]?.value || 'gpt-4o',
        preferred_tool: draftTool || null,
        enabled_tools: tools.map((tool) => tool.name),
      })
      setSession(created.session)
      setActiveSessionId(created.session.session_id)
      setSessions((prev) => [created.session, ...prev.filter((item) => item.session_id !== created.session.session_id)])
      setDraftTool(created.session.preferred_tool ?? draftTool ?? '')
      return created.session
    } finally {
      setCreating(false)
    }
  }

  const createFreshSession = async (modeName = currentMode) => {
    setCreating(true)
    try {
      const created = await createChatSession({
        title: 'New AIger chat',
        mode: modeName,
        model_name: currentModel,
        preferred_tool: currentTool || null,
        enabled_tools: tools.map((tool) => tool.name),
      })
      setSession(created.session)
      setActiveSessionId(created.session.session_id)
      setSessions((prev) => [created.session, ...prev.filter((item) => item.session_id !== created.session.session_id)])
      setDraftMode(created.session.mode || modeName)
      setDraftModel(created.session.model_name || currentModel)
      setDraftTool(created.session.preferred_tool ?? '')
      setInput('')
      setRenamingSessionId('')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create chat')
    } finally {
      setCreating(false)
    }
  }

  const openSession = async (id) => {
    if (busy) return
    setActiveSessionId(id)
    try {
      const detail = await getChatSession(id)
      setSession(detail.session)
      prevMessageCountRef.current = detail.session.messages?.length || 0
      setDraftMode(detail.session.mode || 'platform')
      setDraftModel(detail.session.model_name || models[0]?.value || 'gpt-4o')
      setDraftTool(detail.session.preferred_tool ?? '')
      setRenamingSessionId('')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to open chat')
    }
  }

  const removeSession = async (id) => {
    try {
      await deleteChatSession(id)
      const remaining = sessions.filter((item) => item.session_id !== id)
      setSessions(remaining)
      if (activeSessionId === id) {
        const nextId = remaining[0]?.session_id || ''
        setActiveSessionId(nextId)
        if (nextId) {
          const detail = await getChatSession(nextId)
          setSession(detail.session)
          prevMessageCountRef.current = detail.session.messages?.length || 0
          setDraftMode(detail.session.mode || 'platform')
          setDraftModel(detail.session.model_name || models[0]?.value || 'gpt-4o')
          setDraftTool(detail.session.preferred_tool ?? '')
        } else {
          setSession(null)
          setDraftMode('platform')
          setDraftTool('')
        }
      }
      toast.success('Chat deleted')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete chat')
    }
  }

  const patchSession = async (patch) => {
    if (!activeSessionId || !session) {
      if (patch.mode !== undefined) setDraftMode(patch.mode)
      if (patch.model_name !== undefined) setDraftModel(patch.model_name)
      if (patch.preferred_tool !== undefined) setDraftTool(patch.preferred_tool ?? '')
      return
    }
    setSession((prev) => (prev ? { ...prev, ...patch } : prev))
    syncSessionPreview(activeSessionId, patch)
    try {
      const response = await updateChatSession(activeSessionId, patch)
      setSession(response.session)
      setDraftTool(response.session.preferred_tool ?? '')
      syncSessionPreview(activeSessionId, response.session)
    } catch {}
  }

  const saveRename = async (sessionId) => {
    const title = renameDraft.trim()
    if (!title) {
      setRenamingSessionId('')
      return
    }
    try {
      const response = await updateChatSession(sessionId, { title })
      setSessions((prev) => prev.map((item) => (item.session_id === sessionId ? response.session : item)))
      if (activeSessionId === sessionId) setSession(response.session)
      setRenamingSessionId('')
      toast.success('Chat renamed')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to rename chat')
    }
  }

  const submit = async (message = input) => {
    const trimmed = message.trim()
    if (!trimmed || busy) return
    const active = await ensureSession(currentMode)
    const userDraftId = `draft_user_${Date.now()}`
    setBusy(true)
    setSession((prev) => ({
      ...(prev || active),
      messages: [
        ...((prev?.messages || active.messages || [])),
        {
          message_id: userDraftId,
          role: 'user',
          content: trimmed,
          created_at: new Date().toISOString(),
        },
      ],
    }))
    syncSessionPreview(active.session_id, {
      last_message_preview: trimmed.slice(0, 120),
      updated_at: new Date().toISOString(),
    })
    if (message === input) setInput('')

    try {
      await streamChatMessage(active.session_id, {
        content: trimmed,
        mode: currentMode,
        model_name: currentModel,
        preferred_tool: currentTool,
        enabled_tools: session?.enabled_tools || tools.map((tool) => tool.name),
      }, {
        onAssistantStart: (payload) => {
          setSession((prev) => ({
            ...(prev || active),
            messages: [
              ...((prev?.messages || active.messages || [])),
              {
                ...buildAssistantDraft(payload.message_id, payload.mode, payload.model_name),
                preferred_tool: currentTool ?? '',
              },
            ],
          }))
        },
        onLog: (payload) => {
          setSession((prev) => prev ? ({
            ...prev,
            messages: updateMessage(prev.messages, findLatestStreamingMessageId(prev.messages), (item) => ({
              ...item,
              processing_logs: [...(item.processing_logs || []), payload],
            })),
          }) : prev)
        },
        onTool: (payload) => {
          setSession((prev) => prev ? ({
            ...prev,
            messages: updateMessage(prev.messages, findLatestStreamingMessageId(prev.messages), (item) => ({
              ...item,
              tool_results: [...(item.tool_results || []), payload],
            })),
          }) : prev)
        },
        onContentDelta: (payload) => {
          setSession((prev) => prev ? ({
            ...prev,
            messages: updateMessage(prev.messages, payload.message_id, (item) => ({
              ...item,
              content: payload.content,
            })),
          }) : prev)
        },
        onFinal: (payload) => {
          setSession(payload.session)
          setDraftTool(payload.session.preferred_tool ?? '')
          prevMessageCountRef.current = payload.session.messages?.length || 0
          setSessions((prev) => [payload.session, ...prev.filter((item) => item.session_id !== payload.session.session_id)])
          setActiveSessionId(payload.session.session_id)
        },
      })
    } catch (err) {
      toast.error(err?.message || err?.response?.data?.detail || 'Chat request failed')
      setSession((prev) => prev ? { ...prev, messages: (prev.messages || []).filter((msg) => msg.message_id !== userDraftId && !msg.streaming) } : prev)
    } finally {
      setBusy(false)
    }
  }

  const regenerateAssistant = async (assistantMessage) => {
    const index = session?.messages?.findIndex((item) => item.message_id === assistantMessage.message_id) ?? -1
    if (index <= 0) return
    const previousUser = [...session.messages].slice(0, index).reverse().find((item) => item.role === 'user')
    if (previousUser?.content) await submit(previousUser.content)
  }

  const handleUploadClick = async () => {
    const active = await ensureSession(currentMode)
    if (!active?.session_id) return
    fileInputRef.current?.click()
  }

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const active = await ensureSession(currentMode)
    setUploading(true)
    try {
      const response = await uploadChatFiles(active.session_id, files)
      setSession(response.session)
      setSessions((prev) => [response.session, ...prev.filter((item) => item.session_id !== response.session.session_id)])
      toast.success(`${response.uploaded?.length || files.length} file(s) attached`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'File upload failed')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value || '')
      toast.success('Copied')
    } catch {
      toast.error('Copy failed')
    }
  }

  if (hydrating) {
    return (
      <div className="flex h-full items-center justify-center bg-[#05070f]">
        <div className="inline-flex items-center gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-muted backdrop-blur-xl">
          <LoaderCircle size={16} className="animate-spin text-accent" />
          Loading AIger Copilot...
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-[#05070f] text-ink">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.xml,.yaml,.yml,.py,.js,.ts,.tsx,.jsx,.java,.go,.rb,.sql,.ini,.cfg,.toml"
        className="hidden"
        onChange={uploadFiles}
      />

      <aside className={`${historyCollapsed ? 'w-[76px]' : 'w-[312px]'} shrink-0 bg-black/40 backdrop-blur-2xl transition-[width] duration-200 flex flex-col`}>
        <div className="flex h-16 items-center justify-between px-4">
          <div className={`flex items-center gap-3 overflow-hidden transition ${historyCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 shadow-[0_0_36px_rgba(0,213,255,0.12)]">
              <Bot size={15} className="text-accent" />
            </div>
            <div>
              <div className="font-display text-lg tracking-tight">AIger</div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-muted">Copilot</div>
            </div>
          </div>
          <ActionIcon icon={historyCollapsed ? ChevronRight : ChevronLeft} label="Toggle history" onClick={() => setHistoryCollapsed((value) => !value)} />
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => createFreshSession(currentMode)}
            disabled={creating || busy}
            className={`w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm transition hover:border-accent/30 disabled:opacity-50 ${historyCollapsed ? 'inline-flex justify-center' : 'inline-flex items-center gap-2'}`}
          >
            <Plus size={14} />
            {!historyCollapsed && 'New chat'}
          </button>
          {!historyCollapsed && (
            <div className="relative mt-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                className="w-full rounded-2xl border border-white/8 bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-ink outline-none transition focus:border-accent/35"
              />
            </div>
          )}
        </div>

        {!historyCollapsed && <div className="px-4 pb-2 text-xs uppercase tracking-[0.22em] text-muted">Recents</div>}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
          {!historyCollapsed && visibleSessions.map((item) => {
            const Icon = item.mode === 'general' ? BrainCircuit : Sparkles
            const active = activeSessionId === item.session_id
            return (
              <div key={item.session_id} className={`group relative mb-1.5 rounded-2xl transition ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}>
                <button
                  type="button"
                  onClick={() => openSession(item.session_id)}
                  className="flex w-full items-start gap-3 px-3 py-3 pr-20 text-left"
                >
                  <Icon size={14} className={`mt-0.5 shrink-0 ${item.mode === 'general' ? 'text-accent2' : 'text-accent'}`} />
                  <div className="min-w-0 flex-1">
                    {renamingSessionId === item.session_id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => saveRename(item.session_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(item.session_id)
                          if (e.key === 'Escape') setRenamingSessionId('')
                        }}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-ink outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <div className="truncate text-sm text-ink">{item.title || 'New AIger chat'}</div>
                        <div className="mt-1 truncate text-xs text-muted">{item.last_message_preview || formatSessionTime(item.updated_at)}</div>
                      </>
                    )}
                  </div>
                </button>
                {renamingSessionId !== item.session_id && (
                  <div className={`absolute right-2 top-2 flex gap-1 transition ${active || historyCollapsed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <ActionIcon
                      icon={Pencil}
                      label="Rename chat"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenamingSessionId(item.session_id)
                        setRenameDraft(item.title || 'New AIger chat')
                      }}
                    />
                    <ActionIcon
                      icon={Trash2}
                      label="Delete chat"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSession(item.session_id)
                      }}
                      className="hover:border-bad/30"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 md:px-8">
          {(!session?.messages || session.messages.length === 0) ? (
            <div className="flex min-h-full items-center justify-center py-12">
              <div className="w-full max-w-4xl">
                <div className="mb-8 text-center">
                  <div className="font-display text-[clamp(2rem,5vw,3.6rem)] tracking-[-0.045em]">What should AIger help you solve?</div>
                  <div className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
                    Use platform mode for grounded answers about AIger, its architecture, agents, and workflows. Switch to general reasoning when you want broader coding or migration help.
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => submit(prompt)}
                      className="rounded-[26px] border border-white/8 bg-white/[0.03] px-5 py-5 text-left text-sm leading-7 text-[#dce6f7] backdrop-blur-xl transition hover:border-accent/30 hover:bg-white/[0.05]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="pb-12 pt-8">
              {(session.messages || []).map((message) => (
                message.role === 'user'
                  ? <UserMessage key={message.message_id} message={message} onCopy={copyText} />
                  : (
                    <AssistantMessage
                      key={message.message_id}
                      message={message}
                      onCopy={copyText}
                      onRegenerate={() => regenerateAssistant(message)}
                      onOpenCitation={setActiveCitation}
                      onFollowUp={submit}
                      onOpenReasoning={setActiveReasoningMessageId}
                    />
                  )
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pb-5 pt-3 md:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,34,0.9),rgba(10,14,24,0.9))] shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3 md:px-5">
                <CustomSelect
                  label="Mode"
                  value={currentMode}
                  options={modeOptions}
                  onChange={(value) => patchSession({ mode: value })}
                  className="w-[158px] max-w-full"
                  buttonClassName="min-h-[38px] rounded-full px-3 py-1.5 text-xs"
                  maxVisibleOptions={4}
                />
                <CustomSelect
                  label="Model"
                  value={currentModel}
                  options={modelOptions}
                  onChange={(value) => patchSession({ model_name: value })}
                  className="w-[178px] max-w-full"
                  buttonClassName="min-h-[38px] rounded-full px-3 py-1.5 text-xs"
                  menuPlacement="up"
                  maxVisibleOptions={5}
                />
                <CustomSelect
                  label="Tool"
                  value={currentTool}
                  options={toolOptions}
                  onChange={(value) => patchSession({ preferred_tool: value })}
                  className="w-[186px] max-w-full"
                  buttonClassName="min-h-[38px] rounded-full px-3 py-1.5 text-xs"
                  menuPlacement="up"
                  maxVisibleOptions={5}
                />
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={uploading || busy}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 text-xs text-muted transition hover:border-accent/30 hover:text-ink disabled:opacity-50"
                >
                  {uploading ? <LoaderCircle size={13} className="animate-spin" /> : <FileUp size={13} />}
                  {uploading ? 'Uploading...' : `Files ${(session?.attachments || []).length ? `(${session.attachments.length})` : ''}`}
                </button>
              </div>
              <div className="px-4 pb-3 pt-1 md:px-5">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholder}
                  rows={1}
                  className="max-h-[140px] min-h-[36px] w-full resize-none overflow-y-auto bg-transparent px-1 py-1.5 text-[14px] leading-6 text-ink outline-none placeholder:text-[#8d97ab]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit()
                    }
                  }}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-[11px] text-muted">
                    {(session?.attachments || []).length > 0
                      ? `${session.attachments.length} file(s) attached to this chat session`
                      : 'This chat keeps conversation memory and can use installed agents, tools, and platform context.'}
                  </div>
                  <button
                    type="button"
                    onClick={() => submit()}
                    disabled={busy || creating}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
                    {busy ? 'Streaming...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ModalShell
        open={!!activeReasoningMessage}
        onClose={() => setActiveReasoningMessageId('')}
        title="Live reasoning trace"
        subtitle={activeReasoningMessage?.streaming ? 'Streaming step-by-step backend activity' : 'Captured reasoning steps for this response'}
        width="max-w-3xl"
      >
        <div className="bg-[radial-gradient(circle_at_top,rgba(0,213,255,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] p-6">
          <div className="flex flex-wrap items-center gap-2">
            <MetaTag label="Mode" value={activeReasoningMessage?.mode === 'general' ? 'General' : 'AIger Copilot'} />
            <MetaTag label="Model" value={activeReasoningMessage?.model_name || 'gpt-4o'} />
            <MetaTag label="State" value={activeReasoningMessage?.streaming ? 'streaming' : 'complete'} />
          </div>
          {activeReasoningMessage?.processing_logs?.length > 0 && (
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm text-[#d7eff7]">
              <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
                <span className={`inline-flex h-2 w-2 rounded-full bg-accent ${activeReasoningMessage?.streaming ? 'animate-pulse' : ''}`} />
                {activeReasoningMessage?.streaming ? 'Live backend activity' : 'Final backend activity'}
              </div>
              <div className="mt-2 font-medium">
                {activeReasoningMessage.processing_logs[activeReasoningMessage.processing_logs.length - 1]?.label}
              </div>
              <div className="mt-1 leading-6 text-[#c0d8e6]">
                {activeReasoningMessage.processing_logs[activeReasoningMessage.processing_logs.length - 1]?.detail}
              </div>
            </div>
          )}
          <div className="mt-5 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {(activeReasoningMessage?.processing_logs || []).map((log, index) => (
              <div key={log.step_id || `${log.label}-${index}`} className="rounded-2xl border border-white/10 bg-[#0a1020]/80 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-accent">{log.label}</div>
                <div className="mt-2 leading-6 text-[#d1dcef]">{log.detail}</div>
              </div>
            ))}
            {!(activeReasoningMessage?.processing_logs || []).length && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-muted">
                Waiting for reasoning steps...
              </div>
            )}
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={!!activeCitation}
        onClose={() => setActiveCitation(null)}
        title={activeCitation?.label || 'Citation'}
        subtitle={activeCitation?.source_type || 'Source reference'}
        width="max-w-3xl"
      >
        {activeCitation && (
          <div className="bg-[radial-gradient(circle_at_top,rgba(0,213,255,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] p-6">
            {activeCitation.url && (
              <a
                href={activeCitation.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:opacity-90"
              >
                <Globe2 size={12} />
                Open source
              </a>
            )}
            <div className="mt-5">
              <MarkdownReport markdown={activeCitation.excerpt || 'No excerpt available.'} />
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  )
}

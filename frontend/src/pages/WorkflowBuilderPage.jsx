import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Briefcase, ChevronDown, ChevronUp, Cpu, Eye, FileText, Github, Play, Save, Sparkles, Upload } from 'lucide-react'
import { ReactFlowProvider } from 'reactflow'
import { toast } from 'sonner'
import { listProjects } from '../api/projects.js'
import { listAgents, registerAgent } from '../api/platform.js'
import { importGithubRepo, importWorkflowGithubRepo, uploadDocument, uploadWorkflowInput, listDocuments } from '../api/documents.js'
import { autoBuildWorkflow, createWorkflow, getWorkflow, runWorkflow, updateWorkflow } from '../api/workflows.js'
import CustomSelect from '../components/common/CustomSelect.jsx'
import FrameworkBadge from '../components/common/FrameworkBadge.jsx'
import DocumentViewerModal from '../components/common/DocumentViewerModal.jsx'
import ModalShell from '../components/common/ModalShell.jsx'
import WorkflowCanvas from '../components/flow/WorkflowCanvas.jsx'
import { getCurrentProjectId, setCurrentProjectId } from '../lib/projectStorage.js'

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

function TypedStreamLine({ text, tone }) {
  const [visibleCount, setVisibleCount] = useState(0)
  const finished = visibleCount >= text.length

  useEffect(() => {
    setVisibleCount(0)
    const interval = window.setInterval(() => {
      setVisibleCount((current) => {
        if (current >= text.length) {
          window.clearInterval(interval)
          return current
        }
        return current + 2
      })
    }, 18)
    return () => window.clearInterval(interval)
  }, [text])

  const className = tone === 'ok'
    ? 'text-emerald-200'
    : tone === 'warn'
      ? 'text-amber-200'
      : tone === 'bad'
        ? 'text-rose-200'
        : tone === 'accent'
          ? 'text-cyan-200'
          : 'text-slate-200'

  return <div className={`whitespace-pre-wrap ${className}`}>{text.slice(0, visibleCount)}{finished ? null : <span className="animate-pulse text-white/60">|</span>}</div>
}

export default function WorkflowBuilderPage() {
  const { workflowId } = useParams()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [docs, setDocs] = useState([])
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(getCurrentProjectId())
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [workflowInput, setWorkflowInput] = useState('')
  const [workflowFiles, setWorkflowFiles] = useState([])
  const [workflowInputDocs, setWorkflowInputDocs] = useState([])
  const [workflowRepoUrl, setWorkflowRepoUrl] = useState('')
  const [workflowRepoImport, setWorkflowRepoImport] = useState(null)
  const [docCategory, setDocCategory] = useState('general')
  const [kbMode, setKbMode] = useState('upload')
  const [repoUrl, setRepoUrl] = useState('')
  const [kbFileUploading, setKbFileUploading] = useState(false)
  const [kbRepoImporting, setKbRepoImporting] = useState(false)
  const [workflowFileUploading, setWorkflowFileUploading] = useState(false)
  const [workflowRepoImporting, setWorkflowRepoImporting] = useState(false)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [name, setName] = useState('Untitled workflow')
  const [savedId, setSavedId] = useState(workflowId || null)
  const [activeDocumentId, setActiveDocumentId] = useState('')
  const [autoPrompt, setAutoPrompt] = useState('')
  const [autoPlan, setAutoPlan] = useState(null)
  const [autoBuilding, setAutoBuilding] = useState(false)
  const [installingMissing, setInstallingMissing] = useState(false)
  const [constructingCanvas, setConstructingCanvas] = useState(false)
  const [creatingSuggestedAgents, setCreatingSuggestedAgents] = useState(false)
  const [buildPhase, setBuildPhase] = useState('')
  const [orchestratorStream, setOrchestratorStream] = useState([])
  const [showOrchestratorPanel, setShowOrchestratorPanel] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [plannerEditMode, setPlannerEditMode] = useState(false)
  const [plannerPromptDraft, setPlannerPromptDraft] = useState('')
  const [plannerNameDraft, setPlannerNameDraft] = useState('')
  const [focusedNodeId, setFocusedNodeId] = useState('')
  const fileInput = useRef(null)
  const workflowFileInput = useRef(null)

  const pushOrchestratorLine = (tone, text) => {
    setOrchestratorStream((current) => {
      const line = { id: `${Date.now()}-${current.length}`, tone, text }
      return [...current.slice(-15), line]
    })
  }

  const refresh = async () => {
    const [a, d, pr] = await Promise.all([listAgents(), listDocuments(), listProjects()])
    setAgents(a.agents || [])
    setDocs(d.documents || [])
    setProjects(pr.projects || [])
  }

  const animateCanvasBuild = async (plan) => {
    const planNodes = plan.nodes || []
    const planEdges = plan.edges || []
    setConstructingCanvas(true)
    setBuildPhase('Preparing workspace')
    pushOrchestratorLine('info', 'Preparing workflow canvas and reserving orchestration slots.')
    setNodes([])
    setEdges([])
    await sleep(260)
    const nextNodes = []
    const nextEdges = []
    for (let index = 0; index < planNodes.length; index += 1) {
      const node = planNodes[index]
      setBuildPhase(`Placing ${node.data?.name || 'agent'} on canvas`)
      pushOrchestratorLine('accent', `Placing ${node.data?.name || 'agent'} on the canvas.`)
      setFocusedNodeId(node.id)
      nextNodes.push(node)
      setNodes([...nextNodes])
      await sleep(260)
      if (planEdges[index - 1]) {
        setBuildPhase(`Linking ${planNodes[index - 1]?.data?.name || 'agent'} to ${node.data?.name || 'agent'}`)
        pushOrchestratorLine('ok', `Linking ${planNodes[index - 1]?.data?.name || 'agent'} -> ${node.data?.name || 'agent'}.`)
        nextEdges.push(planEdges[index - 1])
        setEdges([...nextEdges])
        await sleep(180)
      }
    }
    setBuildPhase('Workflow ready')
    pushOrchestratorLine('ok', 'Workflow graph assembled and ready for review.')
    await sleep(320)
    setConstructingCanvas(false)
    setBuildPhase('')
    setFocusedNodeId('')
  }

  const applyAutoPlan = async (plan, promptText) => {
    setAutoPlan(plan)
    setPlannerPromptDraft(promptText.trim())
    setPlannerNameDraft(plan.workflow_name || 'Auto-built workflow')
    setPlannerEditMode(false)
    setShowPlanModal(true)
  }

  const buildFromPrompt = async (autoInstallMissing = false) => {
    const promptText = autoPrompt.trim() || workflowInput.trim()
    if (promptText.length < 12) return toast.error('Describe the workflow goal in a little more detail first')
    setOrchestratorStream([])
    setShowOrchestratorPanel(true)
    pushOrchestratorLine('accent', `Interpreting intent from prompt: "${promptText.slice(0, 140)}${promptText.length > 140 ? '...' : ''}"`)
    if (autoInstallMissing) {
      setBuildPhase('Installing required agents and rebuilding workflow')
      setInstallingMissing(true)
      pushOrchestratorLine('warn', 'Missing capabilities detected earlier. Replanning with marketplace installation enabled.')
    } else {
      setBuildPhase('Analyzing your request and mapping the right agents')
      setAutoBuilding(true)
      pushOrchestratorLine('info', 'Checking installed agents and marketplace coverage.')
    }
    try {
      const plan = await autoBuildWorkflow({
        prompt: promptText,
        project_id: projectId || null,
        auto_install_missing: autoInstallMissing,
      })
      pushOrchestratorLine('ok', `Planner resolved ${plan.selected_agent_ids?.length || 0} installed agent(s) and ${plan.missing_templates?.length || 0} missing template(s).`)
      if ((plan.market_research || []).length > 0) {
        pushOrchestratorLine('accent', `Live market research returned ${plan.market_research.length} grounded finding(s).`)
      } else {
        pushOrchestratorLine('warn', 'Live market research was unavailable, so the planner fell back to readiness heuristics.')
      }
      if ((plan.agent_creation_suggestions || []).length > 0) {
        pushOrchestratorLine('info', `Prepared ${plan.agent_creation_suggestions.length} custom agent draft suggestion(s) for uncovered capabilities.`)
      }
      await applyAutoPlan(plan, promptText)
      if (plan.missing_templates?.length) {
        toast.message('Required agents are available in Marketplace and ready to install')
      } else {
        toast.success(`Workflow assembled with ${plan.selected_agent_ids?.length || 0} agent${(plan.selected_agent_ids?.length || 0) === 1 ? '' : 's'}`)
      }
      await refresh()
    } catch (err) {
      pushOrchestratorLine('bad', err?.response?.data?.detail || err?.message || 'Planner failed before the workflow could be assembled.')
      toast.error(err?.response?.data?.detail || 'Auto-build failed')
    } finally {
      setAutoBuilding(false)
      setInstallingMissing(false)
      if (!constructingCanvas) setBuildPhase('')
    }
  }

  const acceptPlanner = async () => {
    if (!autoPlan) return
    const acceptedPlan = {
      ...autoPlan,
      workflow_name: plannerNameDraft.trim() || autoPlan.workflow_name || 'Auto-built workflow',
    }
    setName(acceptedPlan.workflow_name)
    if (plannerPromptDraft.trim()) setWorkflowInput(plannerPromptDraft.trim())
    setSavedId(null)
    setShowPlanModal(false)
    setPlannerEditMode(false)
    setShowOrchestratorPanel(false)
    if (acceptedPlan.ready) {
      await animateCanvasBuild(acceptedPlan)
      toast.success('Workflow accepted and built on canvas')
    }
  }

  const rejectPlanner = () => {
    setShowPlanModal(false)
    setPlannerEditMode(false)
    setAutoPlan(null)
    setPlannerPromptDraft('')
    setPlannerNameDraft('')
    toast.message('Planner draft dismissed')
  }

  const replanPlanner = async () => {
    const nextPrompt = plannerPromptDraft.trim() || autoPrompt.trim() || workflowInput.trim()
    if (nextPrompt.length < 12) return toast.error('Add a clearer workflow goal before replanning')
    setAutoPrompt(nextPrompt)
    setShowPlanModal(false)
    setPlannerEditMode(false)
    await buildFromPrompt(false)
  }

  const createSuggestedAgentDrafts = async () => {
    const suggestions = autoPlan?.agent_creation_suggestions || []
    if (!suggestions.length) return
    setCreatingSuggestedAgents(true)
    pushOrchestratorLine('warn', 'Creating suggested custom agent drafts from the planner recommendations.')
    try {
      for (const suggestion of suggestions) {
        await registerAgent({
          name: suggestion.name,
          framework: suggestion.framework || 'langgraph',
          description: suggestion.description || suggestion.rationale || '',
          system_prompt: suggestion.system_prompt || suggestion.rationale || 'Custom orchestrator agent draft',
          model_name: suggestion.model_name || 'gpt-4o',
          tools: suggestion.tools || [],
          hitl_enabled: !!suggestion.hitl_enabled,
          tags: suggestion.tags || [],
          a2a_enabled: true,
          a2a_mode: 'local',
          remote_agent_card_url: '',
        })
      }
      toast.success(`Created ${suggestions.length} suggested agent draft${suggestions.length === 1 ? '' : 's'}`)
      pushOrchestratorLine('ok', `Created ${suggestions.length} suggested custom agent draft(s).`)
      await refresh()
      await buildFromPrompt(false)
    } catch (err) {
      pushOrchestratorLine('bad', err?.response?.data?.detail || 'Suggested agent draft creation failed.')
      toast.error(err?.response?.data?.detail || 'Failed to create suggested agent drafts')
    } finally {
      setCreatingSuggestedAgents(false)
    }
  }

  useEffect(() => {
    refresh()
    if (workflowId) {
      getWorkflow(workflowId).then((wf) => {
        setName(wf.name)
        setSavedId(wf.workflow_id)
        setWorkflowInput(wf.description || '')
        setProjectId(wf.project_id || getCurrentProjectId())
        if (wf.canvas?.nodes) setNodes(wf.canvas.nodes)
        if (wf.canvas?.edges) setEdges(wf.canvas.edges)
      }).catch(() => {})
    }
  }, [workflowId])

  const orderedAgentIds = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x)
    return sorted.map((n) => n.data.agent_id).filter(Boolean)
  }, [nodes])

  const onDragStart = (e, agent) => {
    e.dataTransfer.setData('application/agent', JSON.stringify(agent))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setKbFileUploading(true)
    try {
      const res = await uploadDocument(file, docCategory)
      toast.success(`Uploaded ${res.filename} (${res.chunk_count} chunks indexed)`)
      setSelectedDocId(res.document_id)
      refresh()
    } catch {
      toast.error('Upload failed')
    } finally {
      setKbFileUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleRepoImport = async () => {
    if (!repoUrl.trim()) return toast.error('Enter a GitHub repository URL')
    setKbRepoImporting(true)
    try {
      const res = await importGithubRepo(repoUrl.trim(), docCategory)
      toast.success(`Imported ${res.files_indexed} repo files`)
      setSelectedDocId(res.document_id)
      setRepoUrl('')
      refresh()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'GitHub import failed')
    } finally {
      setKbRepoImporting(false)
    }
  }

  const uploadWorkflowFilesNow = async () => {
    if (workflowFiles.length === 0) return workflowInputDocs
    setWorkflowFileUploading(true)
    try {
      const uploaded = []
      for (const file of workflowFiles) {
        const res = await uploadWorkflowInput(file, 'workflow-input')
        uploaded.push(res)
      }
      setWorkflowInputDocs((prev) => [...prev, ...uploaded])
      setWorkflowFiles([])
      toast.success(`Uploaded ${uploaded.length} workflow input file${uploaded.length > 1 ? 's' : ''}`)
      return [...workflowInputDocs, ...uploaded]
    } catch {
      toast.error('Workflow input upload failed')
      return workflowInputDocs
    } finally {
      setWorkflowFileUploading(false)
      if (workflowFileInput.current) workflowFileInput.current.value = ''
    }
  }

  const handleWorkflowRepoImport = async () => {
    if (!workflowRepoUrl.trim()) return toast.error('Enter a GitHub repository URL')
    setWorkflowRepoImporting(true)
    try {
      const res = await importWorkflowGithubRepo(workflowRepoUrl.trim(), 'workflow-input')
      setWorkflowRepoImport(res)
      toast.success(`Imported ${res.files_indexed} workflow repo files`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Workflow GitHub import failed')
    } finally {
      setWorkflowRepoImporting(false)
    }
  }

  const ensureWorkflowRepoImport = async () => {
    const trimmed = workflowRepoUrl.trim()
    if (!trimmed) return workflowRepoImport
    if (workflowRepoImport?.repo_url === trimmed) return workflowRepoImport
    setWorkflowRepoImporting(true)
    try {
      const res = await importWorkflowGithubRepo(trimmed, 'workflow-input')
      setWorkflowRepoImport(res)
      toast.success(`Imported ${res.files_indexed} workflow repo files`)
      return res
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Workflow GitHub import failed')
      return null
    } finally {
      setWorkflowRepoImporting(false)
    }
  }

  const save = async () => {
    if (orderedAgentIds.length < 2) return toast.error('Add at least 2 agents to the canvas')
    try {
      const body = {
        name,
        description: workflowInput,
        project_id: projectId || null,
        agents: orderedAgentIds,
        input_type: 'document',
        policy_ids: [],
        canvas: { nodes, edges },
      }
      const res = savedId ? await updateWorkflow(savedId, body) : await createWorkflow(body)
      toast.success(savedId ? 'Workflow updated' : 'Workflow saved')
      setSavedId(res.workflow_id)
      navigate(`/builder/${res.workflow_id}`, { replace: true })
      return res.workflow_id
    } catch {
      toast.error('Save failed')
    }
  }

  const run = async () => {
    let id = savedId
    if (!id) {
      id = await save()
      if (!id) return
    }
    const needsKbDocument = kbMode !== 'tools'
    if (needsKbDocument && !selectedDocId && docs.length === 0) return toast.error('Upload or import a knowledge-base source first')
    const docId = needsKbDocument ? (selectedDocId || docs[0]?.document_id) : ''
    const uploadedWorkflowDocs = await uploadWorkflowFilesNow()
    if (workflowFiles.length > 0 && uploadedWorkflowDocs.length === workflowInputDocs.length) return
    const workflowRepoDoc = await ensureWorkflowRepoImport()
    if (workflowRepoUrl.trim() && !workflowRepoDoc) return
    try {
      const res = await runWorkflow(id, {
        input_data: {
          document_id: docId,
          filename: docs.find((d) => d.document_id === docId)?.filename || '',
          user_prompt: workflowInput,
          kb_mode: kbMode,
          repo_url: kbMode === 'github' ? repoUrl.trim() : '',
          workflow_inputs: {
            text: workflowInput,
            upload_document_ids: uploadedWorkflowDocs.map((doc) => doc.document_id),
            repo_document_id: workflowRepoDoc?.document_id || '',
            repo_url: workflowRepoDoc?.repo_url || workflowRepoUrl.trim(),
          },
        },
      })
      toast.success('Workflow started')
      navigate(`/runs/${res.run_id}`)
    } catch {
      toast.error('Run failed to start')
    }
  }

  return (
    <div data-testid="builder-page" className="flex h-[calc(100vh-77px)]">
      <aside className="w-[320px] shrink-0 border-r border-line bg-panel/55 backdrop-blur p-4 overflow-y-auto">
        <div className="rounded-2xl border border-accent/20 bg-[linear-gradient(180deg,rgba(92,225,230,0.12),rgba(255,255,255,0.03))] p-4 mb-6 shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent mb-3">
            <Sparkles size={12} /> Orchestrator AI
          </div>
          <div className="font-display text-lg font-semibold tracking-tight">Describe the outcome and let the platform assemble the workflow.</div>
          <div className="text-[12px] text-muted mt-1">The orchestrator checks your installed agents first, then matches missing capabilities to real Marketplace templates and can install them before building the canvas.</div>
          <textarea value={autoPrompt} onChange={(e) => setAutoPrompt(e.target.value)} rows={4} placeholder="Example: Modernize this Java monolith into Spring Boot services, assess migration risk, and produce a phased remediation backlog." className="w-full mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40" />
          <button onClick={() => buildFromPrompt(false)} disabled={autoBuilding || installingMissing || constructingCanvas} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
            <Sparkles size={14} /> {autoBuilding ? 'Planning workflow...' : 'Auto-build workflow'}
          </button>
          {autoPlan && <button onClick={() => setShowPlanModal(true)} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-sm hover:border-accent/40">Open planner summary</button>}
        </div>

        <div className="text-[11px] uppercase tracking-widest text-muted mb-3">Drag agents to canvas</div>
        <div className="space-y-2 mb-6">
          {agents.length === 0 && (
            <div className="text-sm text-muted py-6 text-center border border-dashed border-line rounded-lg">
              No agents yet. Install them from Marketplace first.
            </div>
          )}
          {agents.map((a) => (
            <div key={a.agent_id} draggable onDragStart={(e) => onDragStart(e, a)} data-testid={`library-agent-${a.agent_id}`} className="px-3 py-3 rounded-xl border border-line bg-elev/60 cursor-grab hover:border-accent/40 select-none active:cursor-grabbing">
              <div className="flex items-center gap-2 mb-1.5">
                <Cpu size={13} className="text-accent" />
                <div className="text-sm font-medium truncate flex-1">{a.name}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <FrameworkBadge framework={a.framework} />
                {a.hitl_enabled && <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border border-warn/30 text-warn bg-warn/10">HITL</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="text-[11px] uppercase tracking-widest text-muted mb-3">Project</div>
        <div className="rounded-xl border border-line bg-elev/40 px-3 py-3 mb-6">
          <div className="flex items-center gap-2 text-sm mb-2"><Briefcase size={14} className="text-accent" /> Project scope</div>
          <CustomSelect
            label="Project"
            value={projectId}
            onChange={(value) => { setProjectId(value); setCurrentProjectId(value) }}
            options={[
              { value: '', label: 'No project' },
              ...projects.map((project) => ({ value: project.project_id, label: project.name })),
            ]}
          />
        </div>

        <div className="text-[11px] uppercase tracking-widest text-muted mb-3">Workflow inputs</div>
        <textarea value={workflowInput} onChange={(e) => setWorkflowInput(e.target.value)} rows={4} placeholder="Describe the user request, migration goal, constraints, or operating context for this workflow run..." className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40 mb-3" />
        <input ref={workflowFileInput} type="file" multiple accept=".pdf,.docx,.txt,.md,.json,.html,.xml,.yaml,.yml,.py,.js,.ts,.tsx,.jsx,.java,.go,.rb,.sql,.toml,.ini,.cfg" onChange={(e) => setWorkflowFiles(Array.from(e.target.files || []))} className="hidden" />
        <button onClick={() => workflowFileInput.current?.click()} disabled={workflowFileUploading} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-accent/40 text-accent text-sm hover:bg-accent/5 disabled:opacity-50 mb-2">
          <Upload size={14} /> {workflowFiles.length > 0 ? `${workflowFiles.length} file${workflowFiles.length > 1 ? 's' : ''} selected` : 'Choose workflow input files'}
        </button>
        <button onClick={uploadWorkflowFilesNow} disabled={workflowFileUploading || workflowFiles.length === 0} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-sm hover:border-accent/40 disabled:opacity-50 mb-3">
          <Upload size={14} /> {workflowFileUploading ? 'Uploading files...' : 'Upload workflow files'}
        </button>
        <div className="space-y-2 mb-4">
          <input value={workflowRepoUrl} onChange={(e) => setWorkflowRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40" />
          <button onClick={handleWorkflowRepoImport} disabled={workflowRepoImporting || !workflowRepoUrl.trim()} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-sm hover:border-accent/40 disabled:opacity-50">
            <Github size={14} /> {workflowRepoImporting ? 'Importing repo...' : 'Import GitHub repo for this workflow run'}
          </button>
          <div className="text-[11px] text-muted">Use workflow inputs for run-specific artifacts like migration sample files, code snippets, or a repo snapshot. These do not become part of the reusable KB.</div>
        </div>
        {(workflowInputDocs.length > 0 || workflowRepoImport) && (
          <div className="mb-4 space-y-1">
            {workflowInputDocs.map((doc) => (
              <div key={doc.document_id} className="w-full px-2.5 py-1.5 rounded border text-[12px] flex items-center gap-2 border-line bg-elev/40 text-muted">
                <button onClick={() => setActiveDocumentId(doc.document_id)} className="flex items-center gap-2 truncate flex-1 text-left">
                  <FileText size={12} />
                  <span className="truncate flex-1">{doc.filename}</span>
                  <span className="text-[10px] font-mono">{doc.chunk_count}c</span>
                </button>
              </div>
            ))}
            {workflowRepoImport && (
              <div className="w-full px-2.5 py-1.5 rounded border text-[12px] flex items-center gap-2 border-line bg-elev/40 text-muted">
                <button onClick={() => setActiveDocumentId(workflowRepoImport.document_id)} className="flex items-center gap-2 truncate flex-1 text-left">
                  <Github size={12} />
                  <span className="truncate flex-1">{workflowRepoImport.repo_url}</span>
                  <span className="text-[10px] font-mono">{workflowRepoImport.files_indexed}f</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="text-[11px] uppercase tracking-widest text-muted mb-3">Knowledge base</div>
        <CustomSelect
          label="KB mode"
          value={kbMode}
          onChange={setKbMode}
          options={[
            { value: 'upload', label: 'Upload KB files' },
            { value: 'github', label: 'Use external GitHub repo context' },
            { value: 'tools', label: 'Rely on external MCP/web tools' },
          ]}
          className="mb-3"
        />
        <CustomSelect
          label="KB category"
          value={docCategory}
          onChange={setDocCategory}
          options={[
            'general',
            'modernization',
            'architecture',
            'compliance',
            'contracts',
            'repo-context',
          ].map((value) => ({ value, label: value === 'repo-context' ? 'Repo Context' : `${value.charAt(0).toUpperCase()}${value.slice(1)}` }))}
          className="mb-3"
        />
        {kbMode === 'upload' && (
          <>
            <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md,.json,.html,.xml,.yaml,.yml,.py,.js,.ts,.tsx,.jsx,.java,.go,.rb,.sql,.toml,.ini,.cfg" onChange={handleUpload} className="hidden" data-testid="doc-upload-input" />
            <button data-testid="doc-upload-btn" onClick={() => fileInput.current?.click()} disabled={kbFileUploading} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-accent/40 text-accent text-sm hover:bg-accent/5 disabled:opacity-50">
              <Upload size={14} /> {kbFileUploading ? 'Uploading KB file...' : 'Upload docs to KB'}
            </button>
            <div className="text-[11px] text-muted mt-2">Use KB uploads for reusable context that agents should search through the `knowledge_base_search` MCP tool.</div>
          </>
        )}
        {kbMode === 'github' && (
          <div className="space-y-2">
            <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40" />
            <button onClick={handleRepoImport} disabled={kbRepoImporting || !repoUrl.trim()} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-accent/40 text-accent text-sm hover:bg-accent/5 disabled:opacity-50">
              <Upload size={14} /> {kbRepoImporting ? 'Importing KB repo...' : 'Import GitHub repo into KB'}
            </button>
            <div className="text-[11px] text-muted">This imports a reusable repo snapshot into the KB. Public repos work now; private repos can use `GITHUB_TOKEN`.</div>
          </div>
        )}
        {kbMode === 'tools' && (
          <div className="text-[11px] text-muted rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            This workflow will rely on external MCP and realtime tools instead of a new KB upload. Configure tools on agent nodes, including `knowledge_base_search` when needed, from the builder and AIger Copilot.
          </div>
        )}
        {docs.length > 0 && (
          <div className="mt-3 space-y-1">
            {docs.slice(0, 6).map((d) => (
              <div key={d.document_id} className={`w-full px-2.5 py-1.5 rounded border text-[12px] flex items-center gap-2 ${selectedDocId === d.document_id ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-elev/40 text-muted hover:border-accent/30'}`}>
                <button onClick={() => setSelectedDocId(d.document_id)} data-testid={`doc-select-${d.document_id}`} className="flex items-center gap-2 truncate flex-1 text-left">
                  <FileText size={12} />
                  <span className="truncate flex-1">{d.filename}</span>
                  <span className="text-[10px] font-mono">{d.chunk_count}c</span>
                </button>
                <button onClick={() => setActiveDocumentId(d.document_id)} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-1.5 text-muted hover:text-ink">
                  <Eye size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => navigate('/tools-chat')} className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-left hover:border-accent/40">
          Open AIger Copilot to manage live MCP tool testing and use the dedicated KB or workflow-input panels here for document context.
        </button>
      </aside>

      <div className="flex-1 relative min-w-0 bg-[radial-gradient(circle_at_top,rgba(92,225,230,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-3 pointer-events-none">
          <input data-testid="workflow-name-input" value={name} onChange={(e) => setName(e.target.value)} className="pointer-events-auto bg-panel/80 backdrop-blur border border-line rounded-md px-3 py-1.5 text-sm font-medium focus:border-accent outline-none w-72" />
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOrchestratorPanel((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel/80 px-3 py-1.5 text-sm hover:border-accent/40"
            >
              <Sparkles size={13} /> Orchestrator log {showOrchestratorPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button data-testid="save-workflow-btn" onClick={save} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line bg-panel/80 text-sm hover:border-accent/40">
              <Save size={13} /> Save
            </button>
            <button data-testid="run-workflow-btn" onClick={run} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90">
              <Play size={13} /> Run workflow
            </button>
          </div>
        </div>
        <ReactFlowProvider>
          <WorkflowCanvas initialNodes={nodes} initialEdges={edges} activeNodeId={focusedNodeId} onChange={(n, e) => { setNodes(n); setEdges(e) }} />
        </ReactFlowProvider>
        {showOrchestratorPanel && (orchestratorStream.length > 0 || constructingCanvas || autoBuilding || installingMissing) && (
          <div className="absolute right-4 top-16 z-20 w-[min(540px,calc(100%-2rem))] rounded-[24px] border border-cyan-300/18 bg-[#07111d] px-5 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-cyan-200">
              <Sparkles size={12} />
              Orchestrator activity stream
            </div>
            <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/45">
              {buildPhase || 'Waiting for the next orchestration step'}
            </div>
            <div className="max-h-[280px] space-y-2 overflow-auto pr-1 font-mono text-[12px] leading-6">
              {orchestratorStream.map((line) => (
                <TypedStreamLine key={line.id} text={line.text} tone={line.tone} />
              ))}
              {(constructingCanvas || autoBuilding || installingMissing) && (
                <TypedStreamLine
                  key={`phase-${buildPhase || 'active'}`}
                  text={buildPhase ? `Live phase: ${buildPhase}` : 'Live phase: awaiting the next planner event'}
                  tone="accent"
                />
              )}
            </div>
          </div>
        )}
      </div>
      <DocumentViewerModal documentId={activeDocumentId} open={!!activeDocumentId} onClose={() => setActiveDocumentId('')} />
      <ModalShell
        open={showPlanModal && !!autoPlan}
        onClose={() => setShowPlanModal(false)}
        title={plannerNameDraft || autoPlan?.workflow_name || 'Planner summary'}
        subtitle={autoPlan?.goal_type ? `Goal type: ${autoPlan.goal_type}` : 'Orchestrator summary'}
        width="max-w-3xl"
      >
        <div className="p-6 space-y-5 bg-[radial-gradient(circle_at_top,rgba(92,225,230,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
          <div className="flex items-center gap-2">
            <button onClick={acceptPlanner} disabled={!autoPlan?.ready || constructingCanvas} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">Accept</button>
            <button onClick={() => setPlannerEditMode((prev) => !prev)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm hover:border-accent/40">{plannerEditMode ? 'Close edit' : 'Edit'}</button>
            <button onClick={replanPlanner} disabled={autoBuilding} className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent hover:bg-accent/15">Replan</button>
            <button onClick={rejectPlanner} className="inline-flex items-center justify-center gap-2 rounded-xl border border-bad/30 bg-bad/10 px-4 py-2.5 text-sm text-bad hover:bg-bad/15">Reject</button>
          </div>
          {plannerEditMode && (
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-[#0a1020]/70 p-4">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted mb-1">Workflow name</div>
                <input value={plannerNameDraft} onChange={(e) => setPlannerNameDraft(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted mb-1">Goal prompt</div>
                <textarea value={plannerPromptDraft} onChange={(e) => setPlannerPromptDraft(e.target.value)} rows={5} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40" />
              </div>
            </div>
          )}
          {autoPlan?.executive_summary && <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">{autoPlan.executive_summary}</div>}
          {autoPlan?.reasoning_summary && <div className="rounded-2xl border border-white/10 bg-[#0a1020]/70 p-4 text-sm text-muted">{autoPlan.reasoning_summary}</div>}
          {autoPlan?.architecture_summary && (
            <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4">
              <div className="text-[11px] uppercase tracking-widest text-accent mb-2">Suggested architecture</div>
              <div className="text-sm text-ink">{autoPlan.architecture_summary}</div>
            </div>
          )}
          {autoPlan?.orchestrator_prompt && (
            <div className="rounded-2xl border border-white/10 bg-[#0a1020]/70 p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Reusable orchestrator prompt</div>
              <pre className="whitespace-pre-wrap text-[12px] leading-6 text-[#dbe6f7]">{autoPlan.orchestrator_prompt}</pre>
            </div>
          )}
          {autoPlan?.market_signal && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Market readiness signal</div>
              <div className="text-sm text-ink">Demand signal: <span className="font-medium">{autoPlan.market_signal.demand_signal}</span></div>
              <div className="mt-2 text-[12px] text-muted">{autoPlan.market_signal.evidence_note}</div>
              <div className="mt-1 text-[12px] text-muted">{autoPlan.market_signal.truth_note}</div>
            </div>
          )}
          {(autoPlan?.market_research || []).length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-muted">Live market research</div>
              {autoPlan.market_research.map((item, idx) => (
                <div key={`${item.title}-${idx}`} className="rounded-2xl border border-white/10 bg-[#0a1020]/75 px-4 py-3">
                  <div className="text-sm font-medium text-ink">{item.title}</div>
                  <div className="mt-1 text-[12px] text-muted">
                    {item.summary}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="ml-1 inline text-accent hover:underline">
                        [{idx + 1}]
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(autoPlan?.workflow_input_hints?.needs_repo_import || autoPlan?.workflow_input_hints?.needs_files || autoPlan?.workflow_input_hints?.needs_kb) && (
            <div className="flex flex-wrap gap-2">
              {autoPlan.workflow_input_hints?.needs_repo_import && <span className="text-[11px] font-mono px-2 py-1 rounded-full border border-accent/30 text-accent bg-accent/10">Repo import recommended</span>}
              {autoPlan.workflow_input_hints?.needs_files && <span className="text-[11px] font-mono px-2 py-1 rounded-full border border-white/10 text-muted">File upload recommended</span>}
              {autoPlan.workflow_input_hints?.needs_kb && <span className="text-[11px] font-mono px-2 py-1 rounded-full border border-white/10 text-muted">KB context recommended</span>}
            </div>
          )}
          {(autoPlan?.hitl_checkpoints || []).length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-muted">HITL checkpoints</div>
              {(autoPlan.hitl_checkpoints || []).map((item, idx) => (
                <div key={`${item.stage}-${idx}`} className="rounded-2xl border border-white/10 bg-[#0a1020]/75 px-4 py-3">
                  <div className="text-xs font-medium text-ink">{item.label}</div>
                  <div className="mt-1 text-[12px] text-muted">{item.detail}</div>
                </div>
              ))}
            </div>
          )}
          {(autoPlan?.nodes || []).length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-muted">Selected flow</div>
              {(autoPlan.nodes || []).map((node, idx) => (
                <div key={node.id} className="rounded-2xl border border-white/10 bg-[#0a1020]/75 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-[11px] font-mono text-muted">{String(idx + 1).padStart(2, '0')}</div>
                    <FrameworkBadge framework={node.data?.framework} />
                    <div className="text-sm font-medium">{node.data?.plan_label || node.data?.name}</div>
                  </div>
                  {node.data?.plan_why && <div className="text-[12px] text-muted">{node.data.plan_why}</div>}
                </div>
              ))}
            </div>
          )}
          {autoPlan?.agent_creation_suggestions?.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-widest text-warn">Suggested agent drafts</div>
              {autoPlan.agent_creation_suggestions.map((item, idx) => (
                <div key={`${item.name}-${idx}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FrameworkBadge framework={item.framework} />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-[12px] text-muted">{item.rationale || item.description}</div>
                  {(item.tools || []).length > 0 && <div className="mt-2 text-[11px] text-accent">Tools: {(item.tools || []).join(', ')}</div>}
                </div>
              ))}
              <button onClick={createSuggestedAgentDrafts} disabled={creatingSuggestedAgents} className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 hover:bg-amber-300/15 disabled:opacity-50">
                <Sparkles size={14} /> {creatingSuggestedAgents ? 'Creating agent drafts...' : 'Create suggested agent drafts'}
              </button>
            </div>
          )}
          {autoPlan?.missing_templates?.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-widest text-warn">Install required agents</div>
              {autoPlan.missing_templates.map((item) => (
                <div key={item.template_id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FrameworkBadge framework={item.framework} />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-[12px] text-muted">{item.description}</div>
                </div>
              ))}
              <button onClick={() => buildFromPrompt(true)} disabled={installingMissing} className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent hover:bg-accent/15 disabled:opacity-50">
                <Sparkles size={14} /> {installingMissing ? 'Installing and rebuilding...' : 'Install required agents and build workflow'}
              </button>
            </div>
          )}
          {autoPlan?.citations?.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-muted">Planner citations</div>
              {autoPlan.citations.map((item, idx) => (
                <div key={`${item.source_type}-${item.source_ref}-${idx}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-sm font-medium text-ink">
                    {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">{item.label}</a> : item.label}
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{item.excerpt || item.source_ref}</div>
                  <div className="mt-1 text-[11px] text-accent">{item.source_type} {item.source_ref ? `| ${item.source_ref}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalShell>
    </div>
  )
}

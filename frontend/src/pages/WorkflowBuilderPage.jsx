import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Briefcase, Cpu, Eye, FileText, Play, Save, Upload, Wrench } from 'lucide-react'
import { ReactFlowProvider } from 'reactflow'
import { toast } from 'sonner'
import { listProjects } from '../api/projects.js'
import { listAgents, listTools } from '../api/platform.js'
import { uploadDocument, listDocuments } from '../api/documents.js'
import { createWorkflow, getWorkflow, runWorkflow } from '../api/workflows.js'
import FrameworkBadge from '../components/common/FrameworkBadge.jsx'
import DocumentViewerModal from '../components/common/DocumentViewerModal.jsx'
import WorkflowCanvas from '../components/flow/WorkflowCanvas.jsx'
import { getCurrentProjectId, setCurrentProjectId } from '../lib/projectStorage.js'

export default function WorkflowBuilderPage() {
  const { workflowId } = useParams()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [docs, setDocs] = useState([])
  const [toolItems, setToolItems] = useState([])
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(getCurrentProjectId())
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [name, setName] = useState('Untitled workflow')
  const [savedId, setSavedId] = useState(workflowId || null)
  const [activeDocumentId, setActiveDocumentId] = useState('')
  const fileInput = useRef(null)

  const refresh = async () => {
    const [a, d, pr, t] = await Promise.all([listAgents(), listDocuments(), listProjects(), listTools()])
    setAgents(a.agents || [])
    setDocs(d.documents || [])
    setProjects(pr.projects || [])
    setToolItems(t.items || [])
  }

  useEffect(() => {
    refresh()
    if (workflowId) {
      getWorkflow(workflowId).then((wf) => {
        setName(wf.name)
        setSavedId(wf.workflow_id)
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
    setUploading(true)
    try {
      const res = await uploadDocument(file)
      toast.success(`Uploaded ${res.filename} (${res.chunk_count} chunks indexed)`)
      setSelectedDocId(res.document_id)
      refresh()
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const save = async () => {
    if (orderedAgentIds.length < 2) return toast.error('Add at least 2 agents to the canvas')
    try {
      const body = {
        name,
        description: '',
        project_id: projectId || null,
        agents: orderedAgentIds,
        input_type: 'document',
        policy_ids: [],
        canvas: { nodes, edges },
      }
      const res = await createWorkflow(body)
      toast.success('Workflow saved')
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
    if (!selectedDocId && docs.length === 0) return toast.error('Upload a knowledge-base document first')
    const docId = selectedDocId || docs[0]?.document_id
    try {
      const res = await runWorkflow(id, {
        input_data: {
          document_id: docId,
          filename: docs.find((d) => d.document_id === docId)?.filename || '',
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
      <aside className="w-[340px] shrink-0 border-r border-line bg-panel/50 backdrop-blur p-4 overflow-y-auto">
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
          <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setCurrentProjectId(e.target.value) }} className="glass-select w-full px-3 py-2 text-sm outline-none focus:border-accent/40">
            <option value="">No project</option>
            {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}
          </select>
        </div>

        <div className="text-[11px] uppercase tracking-widest text-muted mb-3">Knowledge base</div>
        <input ref={fileInput} type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" data-testid="doc-upload-input" />
        <button data-testid="doc-upload-btn" onClick={() => fileInput.current?.click()} disabled={uploading} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-accent/40 text-accent text-sm hover:bg-accent/5 disabled:opacity-50">
          <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload docs to KB'}
        </button>
        <div className="text-[11px] text-muted mt-2">Use this for architecture diagrams, design docs, contracts, dependency notes, repo exports, and other reference knowledge your agents should search.</div>
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

        <div className="mt-6 text-[11px] uppercase tracking-widest text-muted mb-3">Available MCP tools</div>
        <div className="space-y-2">
          {toolItems.map((tool) => (
            <div key={tool.name} className="rounded-xl border border-line bg-elev/40 px-3 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Wrench size={12} className="text-accent" />
                <div className="text-sm font-medium">{tool.name}</div>
                {tool.category && <span className="text-[10px] font-mono uppercase text-muted ml-auto">{tool.category}</span>}
              </div>
              <div className="text-[11px] text-muted">{tool.description || 'Tool available for registered agents.'}</div>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-3 pointer-events-none">
          <input data-testid="workflow-name-input" value={name} onChange={(e) => setName(e.target.value)} className="pointer-events-auto bg-panel/80 backdrop-blur border border-line rounded-md px-3 py-1.5 text-sm font-medium focus:border-accent outline-none w-72" />
          <div className="pointer-events-auto flex items-center gap-2">
            <button data-testid="save-workflow-btn" onClick={save} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line bg-panel/80 text-sm hover:border-accent/40">
              <Save size={13} /> Save
            </button>
            <button data-testid="run-workflow-btn" onClick={run} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90">
              <Play size={13} /> Run workflow
            </button>
          </div>
        </div>
        <ReactFlowProvider>
          <WorkflowCanvas initialNodes={nodes} initialEdges={edges} onChange={(n, e) => { setNodes(n); setEdges(e) }} />
        </ReactFlowProvider>
      </div>
      <DocumentViewerModal documentId={activeDocumentId} open={!!activeDocumentId} onClose={() => setActiveDocumentId('')} />
    </div>
  )
}

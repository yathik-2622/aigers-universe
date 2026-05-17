import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, Play, Upload, FileText, Cpu } from 'lucide-react'
import { ReactFlowProvider } from 'reactflow'
import WorkflowCanvas from '../components/flow/WorkflowCanvas.jsx'
import FrameworkBadge from '../components/common/FrameworkBadge.jsx'
import { listAgents } from '../api/platform.js'
import { createWorkflow, getWorkflow, runWorkflow } from '../api/workflows.js'
import { uploadDocument, listDocuments } from '../api/documents.js'
import { toast } from 'sonner'

export default function WorkflowBuilderPage() {
  const { workflowId } = useParams()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [docs, setDocs] = useState([])
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [name, setName] = useState('Untitled workflow')
  const [savedId, setSavedId] = useState(workflowId || null)
  const fileInput = useRef(null)

  const refresh = async () => {
    const [a, d] = await Promise.all([listAgents(), listDocuments()])
    setAgents(a.agents || [])
    setDocs(d.documents || [])
  }

  useEffect(() => {
    refresh()
    if (workflowId) {
      getWorkflow(workflowId).then(wf => {
        setName(wf.name)
        setSavedId(wf.workflow_id)
        if (wf.canvas?.nodes) setNodes(wf.canvas.nodes)
        if (wf.canvas?.edges) setEdges(wf.canvas.edges)
      }).catch(() => {})
    }
  }, [workflowId])

  const orderedAgentIds = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x)
    return sorted.map(n => n.data.agent_id).filter(Boolean)
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
        agents: orderedAgentIds,
        input_type: 'document',
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
    if (!selectedDocId && docs.length === 0) {
      toast.error('Upload a document first')
      return
    }
    const docId = selectedDocId || docs[0]?.document_id
    try {
      const res = await runWorkflow(id, { input_data: { document_id: docId, filename: docs.find(d => d.document_id === docId)?.filename || '' } })
      toast.success('Workflow started')
      navigate(`/runs/${res.run_id}`)
    } catch {
      toast.error('Run failed to start')
    }
  }

  return (
    <div data-testid="builder-page" className="flex h-[calc(100vh-77px)]">
      {/* Left library */}
      <aside className="w-72 shrink-0 border-r border-line bg-panel/50 backdrop-blur p-4 overflow-y-auto">
        <div className="text-[11px] uppercase tracking-widest text-muted mb-3">Drag agents to canvas</div>
        <div className="space-y-1.5 mb-6">
          {agents.length === 0 && (
            <div className="text-sm text-muted py-6 text-center border border-dashed border-line rounded-lg">
              No agents yet — install from <span className="text-accent">Marketplace</span>.
            </div>
          )}
          {agents.map(a => (
            <div
              key={a.agent_id}
              draggable
              onDragStart={(e) => onDragStart(e, a)}
              data-testid={`library-agent-${a.agent_id}`}
              className="px-3 py-2.5 rounded-lg border border-line bg-elev/60 cursor-grab hover:border-accent/40 select-none active:cursor-grabbing"
            >
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

        {/* Document upload */}
        <div className="text-[11px] uppercase tracking-widest text-muted mb-3">Document input</div>
        <input ref={fileInput} type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" data-testid="doc-upload-input" />
        <button
          data-testid="doc-upload-btn"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-accent/40 text-accent text-sm hover:bg-accent/5 disabled:opacity-50"
        >
          <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload PDF / DOCX'}
        </button>

        {docs.length > 0 && (
          <div className="mt-3 space-y-1">
            {docs.slice(0, 6).map(d => (
              <button
                key={d.document_id}
                onClick={() => setSelectedDocId(d.document_id)}
                data-testid={`doc-select-${d.document_id}`}
                className={`w-full text-left px-2.5 py-1.5 rounded border text-[12px] flex items-center gap-2 truncate ${
                  selectedDocId === d.document_id ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-elev/40 text-muted hover:border-accent/30'
                }`}
              >
                <FileText size={12} />
                <span className="truncate flex-1">{d.filename}</span>
                <span className="text-[10px] font-mono">{d.chunk_count}c</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* Canvas */}
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-3 pointer-events-none">
          <input
            data-testid="workflow-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="pointer-events-auto bg-panel/80 backdrop-blur border border-line rounded-md px-3 py-1.5 text-sm font-medium focus:border-accent outline-none w-72"
          />
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
          <WorkflowCanvas
            initialNodes={nodes}
            initialEdges={edges}
            onChange={(n, e) => { setNodes(n); setEdges(e) }}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

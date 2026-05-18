import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, applyEdgeChanges, applyNodeChanges, MarkerType,
} from 'reactflow'
import AgentNode from './AgentNode.jsx'
import AgentConfigPanel from './AgentConfigPanel.jsx'

const nodeTypes = { agent: AgentNode }

export default function WorkflowCanvas({
  initialNodes = [],
  initialEdges = [],
  onChange,
  readOnly = false,
}) {
  const wrapper = useRef(null)
  const reactFlowRef = useRef(null)
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [selected, setSelected] = useState(null)

  useEffect(() => { setNodes(initialNodes) }, [JSON.stringify(initialNodes.map(n => ({ id: n.id, data: n.data })))])
  useEffect(() => { setEdges(initialEdges) }, [JSON.stringify(initialEdges)])

  useEffect(() => { onChange && onChange(nodes, edges) }, [nodes, edges])

  const onNodesChange = useCallback((changes) => setNodes(ns => applyNodeChanges(changes, ns)), [])
  const onEdgesChange = useCallback((changes) => setEdges(es => applyEdgeChanges(changes, es)), [])
  const onConnect = useCallback((conn) => setEdges(es => addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed }, animated: true }, es)), [])

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    if (readOnly) return
    const data = event.dataTransfer.getData('application/agent')
    if (!data) return
    const agent = JSON.parse(data)
    const bounds = wrapper.current.getBoundingClientRect()
    const screenPosition = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const flowPosition = reactFlowRef.current?.screenToFlowPosition
      ? reactFlowRef.current.screenToFlowPosition(screenPosition)
      : screenPosition
    const position = { x: flowPosition.x - 115, y: flowPosition.y - 45 }
    const id = `agent_${agent.agent_id}_${Date.now()}`
    setNodes(ns => [...ns, {
      id,
      type: 'agent',
      position,
      data: {
        agent_id: agent.agent_id,
        name: agent.name,
        framework: agent.framework,
        system_prompt: agent.system_prompt,
        tools: agent.tools,
        hitl_enabled: agent.hitl_enabled,
      },
    }])
  }, [readOnly])

  const onNodeClick = (_, n) => setSelected(n)

  const updateNodeData = (nodeId, data) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
    setSelected(s => s && s.id === nodeId ? { ...s, data: { ...s.data, ...data } } : s)
  }
  const removeNode = (nodeId) => {
    setNodes(ns => ns.filter(n => n.id !== nodeId))
    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelected(null)
  }

  const styledEdges = useMemo(() => edges.map(e => ({
    ...e,
    markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed },
    animated: e.animated ?? true,
  })), [edges])

  return (
    <div
      ref={wrapper}
      data-testid="workflow-canvas"
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="relative w-full h-full"
    >
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        onInit={(instance) => { reactFlowRef.current = instance }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesUpdatable={!readOnly}
      >
        <Background gap={20} size={1} color="#1f1f33" />
        <Controls showInteractive={false} />
        <MiniMap nodeColor="#7c5cff" maskColor="rgba(10,10,15,0.7)" />
      </ReactFlow>

      {!readOnly && selected && (
        <AgentConfigPanel
          node={selected}
          onClose={() => setSelected(null)}
          onUpdate={updateNodeData}
          onRemove={removeNode}
        />
      )}
    </div>
  )
}

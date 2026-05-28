/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import AIgerDotCanvas from '../components/graph/AIgerDotCanvas.jsx'
import AIgerSectorLegend from '../components/graph/AIgerSectorLegend.jsx'
import styles from '../components/graph/AIgerGraph.module.css'
import { getKnowledgeGraphData, saveKnowledgeGraphLayout } from '../api/knowledgeGraph.js'
import { listDocumentCategories } from '../api/documents.js'

function normalizeValue(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function normalizeKey(value) {
  return normalizeValue(value).toLowerCase()
}

function randomColorForString(name) {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  return `hsl(${hash % 360},78%,60%)`
}

function semanticPairKey(source, target) {
  return [String(source), String(target)].sort().join('::')
}

function sphereMap(seed, radius = 1400, index = 0, total = 1) {
  const hashTo01 = (source) => {
    let hash = 2166136261 >>> 0
    for (let idx = 0; idx < source.length; idx += 1) {
      hash ^= source.charCodeAt(idx)
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
      hash >>>= 0
    }
    return (hash % 1000000) / 1000000
  }

  const u = hashTo01(seed)
  const v = hashTo01(`${seed}::v`)
  const theta = u * Math.PI * 2
  const phi = Math.acos(2 * v - 1)
  const jitter = ((hashTo01(`${seed}::j`) - 0.5) * 0.18) * radius
  const effectiveRadius = radius + jitter + (index / Math.max(1, total)) * radius * 0.08
  return {
    x: effectiveRadius * Math.sin(phi) * Math.cos(theta),
    y: effectiveRadius * Math.sin(phi) * Math.sin(theta),
    z: effectiveRadius * Math.cos(phi),
  }
}

export default function KnowledgeGraphPage() {
  const [rawChunks, setRawChunks] = useState([])
  const [rawLinks, setRawLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [mode, setMode] = useState('main')
  const [selectedMainKey, setSelectedMainKey] = useState(null)
  const [selectedSubKey, setSelectedSubKey] = useState(null)
  const [highlightDoc, setHighlightDoc] = useState(null)
  const [focusDoc, setFocusDoc] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [legendMainColors, setLegendMainColors] = useState({})
  const [legendSubColors, setLegendSubColors] = useState({})
  const [filters] = useState({ category: '', sub_category: '', visibility: '' })
  const [starGlow, setStarGlow] = useState(0.0)
  const [mainLabelVisible, setMainLabelVisible] = useState(true)
  const [mainLabelColorMode, setMainLabelColorMode] = useState('star')
  const [mainLabelSize, setMainLabelSize] = useState(18)
  const [subLabelVisible, setSubLabelVisible] = useState(false)
  const [subLabelColorMode, setSubLabelColorMode] = useState('star')
  const [subLabelSize, setSubLabelSize] = useState(14)
  const [chunkLabelVisible, setChunkLabelVisible] = useState(false)
  const [chunkLabelColorMode, setChunkLabelColorMode] = useState('star')
  const [chunkLabelSize, setChunkLabelSize] = useState(12)
  const [resetSignal, setResetSignal] = useState(0)
  const [warpTargetDocId, setWarpTargetDocId] = useState(null)
  const [showAllChunks, setShowAllChunks] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [showStructuralEdges, setShowStructuralEdges] = useState(false)
  const [showSemanticEdges, setShowSemanticEdges] = useState(false)
  const [semanticSimilarityFloor, setSemanticSimilarityFloor] = useState(0.74)
  const [focusNodeId, setFocusNodeId] = useState('')

  const fetchAll = useCallback(async (nextFilters = filters) => {
    setLoading(true)
    try {
      const [graphData, categoryData] = await Promise.all([
        getKnowledgeGraphData(nextFilters),
        listDocumentCategories(),
      ])

      const nodes = graphData?.nodes || []
      const docsById = new Map(
        nodes
          .filter((node) => node.node_kind === 'document')
          .map((node) => [
            String(node.document_id || node.docId || ''),
            {
              docId: String(node.document_id || node.docId || ''),
              nodeId: node.id,
              file_name: node.label || node.filename || node.document_id,
              main_category: node.category || 'general',
              sub_category: node.sub_category || '',
              main_color: graphData?.legend?.[node.category] || node.color || randomColorForString(node.category || 'general'),
              sub_color: node.color || randomColorForString(`${node.category || 'general'}|${node.sub_category || 'default'}`),
              visibility: node.visibility || 'private',
            },
          ]),
      )

      const nextChunks = nodes
        .filter((node) => node.type === 'chunk')
        .map((node) => {
          const doc = docsById.get(String(node.document_id || node.docId || '')) || {}
          return {
            chunk_id: node.id,
            graph_node_id: node.id,
            docId: String(node.document_id || node.docId || ''),
            doc_id: String(node.document_id || node.docId || ''),
            doc_node_id: doc.nodeId || '',
            file_name: doc.file_name || node.label,
            main_category: node.category || doc.main_category || 'general',
            sub_category: node.sub_category || doc.sub_category || '',
            main_color: doc.main_color || graphData?.legend?.[node.category] || node.color || randomColorForString(node.category || 'general'),
            sub_color: doc.sub_color || node.color || randomColorForString(`${node.category || 'general'}|${node.sub_category || 'default'}`),
            color: node.color || randomColorForString(node.id),
            snippet: node.preview || '',
            coords_2d: {
              x: Number(node.x || 0),
              y: Number(node.y || 0),
            },
            x: Number(node.x || 0),
            y: Number(node.y || 0),
            z: Number(node.z || 0),
          }
        })

      const mainColorMap = {}
      const subColorMap = {}
      ;(categoryData?.categories || []).forEach((category) => {
        const mainLabel = category.main || category.name || category.label || category.main_category
        if (!mainLabel) return
        const mainKey = normalizeKey(mainLabel)
        mainColorMap[mainKey] = category.color || category.main_color || mainColorMap[mainKey] || randomColorForString(mainLabel)
        subColorMap[mainKey] = subColorMap[mainKey] || {}
        ;(category.subcategories || []).forEach((subcategory) => {
          const subName = typeof subcategory === 'string' ? subcategory : subcategory.name || subcategory.label || subcategory.sub
          if (!subName) return
          subColorMap[mainKey][normalizeKey(subName)] = (typeof subcategory === 'string' ? null : subcategory.color) || mainColorMap[mainKey]
        })
      })

      if (!Object.keys(mainColorMap).length) {
        Object.entries(graphData?.legend || {}).forEach(([label, color]) => {
          mainColorMap[normalizeKey(label)] = color
        })
      }

      setRawChunks(nextChunks)
      setRawLinks(graphData?.links || [])
      setLegendMainColors(mainColorMap)
      setLegendSubColors(subColorMap)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load the knowledge graph')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filters])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  function extractMain(chunk) {
    if (!chunk) return { label: 'unknown', key: 'unknown' }
    const candidates = [chunk.main_category, chunk.mainCategory, chunk.main, chunk.file_main]
    for (const value of candidates) {
      if (value) return { label: String(value), key: normalizeKey(value) }
    }
    return { label: 'unknown', key: 'unknown' }
  }

  function extractSub(chunk) {
    if (!chunk) return { label: 'unknown', key: 'unknown' }
    let value = chunk.sub_category ?? chunk.sub ?? chunk.subCategory
    if (Array.isArray(value)) value = value.length ? value[0] : null
    if (value && typeof value === 'object') value = value.name || value.label || value.sub || null
    if (value) return { label: String(value), key: normalizeKey(value) }
    return { label: 'unknown', key: 'unknown' }
  }

  const mainNodes = useMemo(() => {
    const grouped = {}
    rawChunks.forEach((chunk) => {
      const main = extractMain(chunk)
      if (!grouped[main.key]) grouped[main.key] = { count: 0, sample: chunk, label: main.label }
      grouped[main.key].count += 1
    })
    const keys = Object.keys(grouped).sort()
    return keys.map((key, index) => {
      const position = sphereMap(`main::${key}`, 1400, index, keys.length)
      return {
        id: `main::${key}`,
        key,
        type: 'main',
        label: grouped[key].label || key,
        color: legendMainColors[key] || grouped[key].sample?.main_color || randomColorForString(grouped[key].label || key),
        x: position.x,
        y: position.y,
        z: position.z,
        count: grouped[key].count,
      }
    })
  }, [rawChunks, legendMainColors])

  const allSubNodes = useMemo(() => {
    const grouped = {}
    rawChunks.forEach((chunk) => {
      const main = extractMain(chunk)
      const sub = extractSub(chunk)
      const mainKey = main.key || 'unknown'
      if (!grouped[mainKey]) grouped[mainKey] = {}
      if (!grouped[mainKey][sub.key]) grouped[mainKey][sub.key] = { count: 0, label: sub.label, sample: chunk }
      grouped[mainKey][sub.key].count += 1
    })

    const nodes = []
    Object.keys(grouped).forEach((mainKey) => {
      const subKeys = Object.keys(grouped[mainKey]).sort()
      const parent = mainNodes.find((node) => node.key === mainKey) || { x: 0, y: 0, z: 0 }
      subKeys.forEach((subKey, index) => {
        const position = sphereMap(`sub::${mainKey}::${subKey}`, 760, index, subKeys.length)
        nodes.push({
          id: `sub::${mainKey}::${subKey}`,
          key: subKey,
          type: 'sub',
          label: grouped[mainKey][subKey].label || subKey,
          color: legendSubColors[mainKey]?.[subKey] || grouped[mainKey][subKey].sample?.sub_color || randomColorForString(grouped[mainKey][subKey].label || subKey),
          x: parent.x + position.x * 0.45,
          y: parent.y + position.y * 0.45,
          z: parent.z + position.z * 0.45,
          count: grouped[mainKey][subKey].count,
          parentKey: mainKey,
        })
      })
    })
    return nodes
  }, [rawChunks, mainNodes, legendSubColors])

  const selectedSemanticNeighborIds = useMemo(() => {
    if (!selectedNodeId || !showSemanticEdges) return new Set()
    const ids = new Set()
    rawLinks.forEach((link) => {
      const source = typeof link.source === 'string' ? link.source : link.source?.id
      const target = typeof link.target === 'string' ? link.target : link.target?.id
      const similarity = Number(link.similarity ?? 0)
      if (!source || !target || similarity < semanticSimilarityFloor) return
      if (source === selectedNodeId) ids.add(target)
      if (target === selectedNodeId) ids.add(source)
    })
    return ids
  }, [rawLinks, selectedNodeId, showSemanticEdges, semanticSimilarityFloor])

  const semanticEdgeGroups = useMemo(() => {
    const parent = new Map()
    const find = (item) => {
      const key = String(item)
      if (!parent.has(key)) parent.set(key, key)
      const current = parent.get(key)
      if (current === key) return key
      const root = find(current)
      parent.set(key, root)
      return root
    }
    const union = (a, b) => {
      const rootA = find(a)
      const rootB = find(b)
      if (rootA !== rootB) parent.set(rootB, rootA)
    }
    rawLinks.forEach((link) => {
      const source = typeof link.source === 'string' ? link.source : link.source?.id
      const target = typeof link.target === 'string' ? link.target : link.target?.id
      const similarity = Number(link.similarity ?? 0)
      if (!source || !target || similarity < semanticSimilarityFloor) return
      union(source, target)
    })
    const result = new Map()
    rawLinks.forEach((link) => {
      const source = typeof link.source === 'string' ? link.source : link.source?.id
      const target = typeof link.target === 'string' ? link.target : link.target?.id
      const similarity = Number(link.similarity ?? 0)
      if (!source || !target || similarity < semanticSimilarityFloor) return
      const root = find(source)
      result.set(semanticPairKey(source, target), {
        group: root,
        color: randomColorForString(`semantic-component::${root}`),
      })
    })
    return result
  }, [rawLinks, semanticSimilarityFloor])

  const chunkNodes = useMemo(() => {
    if (mode !== 'chunks') return []
    const parentSub = allSubNodes.find((node) => node.key === selectedSubKey && node.parentKey === selectedMainKey)
    const parentMain = mainNodes.find((node) => node.key === selectedMainKey)
    const parent = parentSub || parentMain || { x: 0, y: 0, z: 0 }

    const filtered = rawChunks.filter((chunk) => {
      if (highlightDoc) return String(chunk.docId || chunk.doc_id || '') === String(highlightDoc)
      if (selectedSemanticNeighborIds.has(String(chunk.chunk_id))) return true
      const main = extractMain(chunk)
      const sub = extractSub(chunk)
      if (selectedMainKey && main.key !== selectedMainKey) return false
      if (selectedSubKey && sub.key !== selectedSubKey) return false
      return true
    })

    return filtered.map((chunk, index, chunks) => {
      const position = sphereMap(String(chunk.chunk_id || `${chunk.docId}::${index}`), 320 + Math.min(chunks.length, 120) / 6, index, chunks.length)
      const baseX = chunk.coords_2d && typeof chunk.coords_2d.x === 'number' ? chunk.coords_2d.x * 160 : null
      const baseY = chunk.coords_2d && typeof chunk.coords_2d.y === 'number' ? chunk.coords_2d.y * 160 : null
      const baseZ = typeof chunk.z === 'number' ? chunk.z * 160 : null
      const main = extractMain(chunk)
      const sub = extractSub(chunk)
      return {
        id: chunk.chunk_id,
        label: chunk.file_name || chunk.docId || String(chunk.chunk_id),
        docId: String(chunk.docId || chunk.doc_id || ''),
        type: 'chunk',
        group: sub.key || main.key || 'unknown',
        semanticMatch: selectedSemanticNeighborIds.has(String(chunk.chunk_id)),
        color: legendSubColors[main.key]?.[sub.key] || chunk.color || chunk.sub_color || chunk.main_color || legendMainColors[main.key] || randomColorForString(sub.label || sub.key),
        x: parent.x + (baseX !== null ? (baseX * 0.56 + position.x * 0.44) : position.x),
        y: parent.y + (baseY !== null ? (baseY * 0.56 + position.y * 0.44) : position.y),
        z: parent.z + (baseZ !== null ? (baseZ * 0.56 + position.z * 0.44) : position.z),
        snippet: chunk.snippet || '',
      }
    })
  }, [rawChunks, mode, selectedMainKey, selectedSubKey, allSubNodes, mainNodes, legendSubColors, legendMainColors, highlightDoc, selectedSemanticNeighborIds])

  const visibleNodes = useMemo(() => {
    if (mode === 'main') return mainNodes.map((node) => ({ ...node, active: true, highlight: node.id === selectedNodeId }))
    if (mode === 'sub') {
      const mains = mainNodes.map((node) => ({ ...node, active: node.key === selectedMainKey, highlight: node.id === selectedNodeId }))
      const subs = allSubNodes
        .filter((node) => !selectedMainKey || node.parentKey === selectedMainKey)
        .map((node) => ({ ...node, active: true, highlight: node.id === selectedNodeId }))
      return mains.concat(subs)
    }
    const mains = mainNodes.map((node) => ({ ...node, active: false, highlight: node.id === selectedNodeId }))
    const subs = allSubNodes
      .filter((node) => !selectedMainKey || node.parentKey === selectedMainKey)
      .map((node) => ({ ...node, active: selectedSubKey ? node.key === selectedSubKey : false, highlight: node.id === selectedNodeId }))
    const chunks = chunkNodes.map((node) => ({
      ...node,
      active: true,
      highlight: highlightDoc
        ? node.docId === highlightDoc || node.id === selectedNodeId || node.semanticMatch
        : node.id === selectedNodeId || node.semanticMatch,
    }))
    return mains.concat(subs).concat(chunks)
  }, [mode, mainNodes, allSubNodes, chunkNodes, selectedMainKey, selectedSubKey, highlightDoc, selectedNodeId])

  const visibleLinks = useMemo(() => {
    const links = []
    const currentNodeIds = new Set(visibleNodes.map((node) => node.id))
    if (showStructuralEdges && mode === 'sub') {
      allSubNodes
        .filter((node) => !selectedMainKey || node.parentKey === selectedMainKey)
        .forEach((subNode) => {
          links.push({
            id: `main-link::${subNode.parentKey}::${subNode.key}`,
            source: `main::${subNode.parentKey}`,
            target: subNode.id,
            edge_type: 'structural',
            similarity: 1,
            color: randomColorForString(`structural::${subNode.parentKey}`),
            stroke_width: 2.4,
          })
        })
    }
    if (mode === 'chunks') {
      if (showStructuralEdges) {
      chunkNodes.forEach((chunkNode) => {
        const rawChunk = rawChunks.find((item) => item.chunk_id === chunkNode.id)
        const main = extractMain(rawChunk)
        const sub = extractSub(rawChunk)
        const parentId = selectedSubKey ? `sub::${main.key}::${sub.key}` : `main::${main.key}`
        if (currentNodeIds.has(parentId)) {
          links.push({
            id: `structural::${parentId}::${chunkNode.id}`,
            source: parentId,
            target: chunkNode.id,
            edge_type: 'structural',
            similarity: 1,
            color: randomColorForString(`structural::${parentId}`),
            stroke_width: 2.2,
          })
        }
      })
      }
      if (showSemanticEdges) {
      rawLinks.forEach((link) => {
        const source = typeof link.source === 'string' ? link.source : link.source?.id
        const target = typeof link.target === 'string' ? link.target : link.target?.id
        const similarity = Number(link.similarity ?? 0)
        if (!source || !target || similarity < semanticSimilarityFloor) return
        const touchesSelection = selectedNodeId && (source === selectedNodeId || target === selectedNodeId)
        if ((currentNodeIds.has(source) && currentNodeIds.has(target)) || touchesSelection) {
          const group = semanticEdgeGroups.get(semanticPairKey(source, target))
          links.push({
            id: `${source}::${target}::${similarity}`,
            source,
            target,
            edge_type: link.edge_type || 'semantic',
            similarity,
            semantic_group: group?.group || semanticPairKey(source, target),
            color: group?.color || randomColorForString(`semantic::${semanticPairKey(source, target)}`),
            stroke_width: 3 + Math.max(0, similarity - semanticSimilarityFloor) * 8,
          })
        }
      })
      }
    }
    return links
  }, [allSubNodes, chunkNodes, mode, rawChunks, rawLinks, selectedMainKey, selectedSubKey, visibleNodes, showStructuralEdges, showSemanticEdges, semanticSimilarityFloor, selectedNodeId, semanticEdgeGroups])

  const adjacency = useMemo(() => {
    const relatedNodeIds = new Set()
    const relatedLinkIds = new Set()
    if (!selectedNodeId) return { relatedNodeIds, relatedLinkIds }
    visibleLinks.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source?.id
      const targetId = typeof link.target === 'string' ? link.target : link.target?.id
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        relatedNodeIds.add(sourceId)
        relatedNodeIds.add(targetId)
        relatedLinkIds.add(link.id)
      }
    })
    return { relatedNodeIds, relatedLinkIds }
  }, [selectedNodeId, visibleLinks])

  const mainLegendItems = useMemo(
    () => mainNodes.map((node) => ({ key: node.key, label: node.label, count: node.count, color: node.color })),
    [mainNodes],
  )

  const docGroups = useMemo(() => {
    const groups = {}
    rawChunks.forEach((chunk) => {
      if (selectedMainKey) {
        const main = extractMain(chunk)
        if (main.key !== selectedMainKey) return
      }
      if (selectedSubKey) {
        const sub = extractSub(chunk)
        if (sub.key !== selectedSubKey) return
      }
      const docId = String(chunk.docId || chunk.doc_id || '')
      if (!groups[docId]) groups[docId] = { file: chunk.file_name || docId, count: 0, docId, color: chunk.main_color || chunk.color || randomColorForString(docId) }
      groups[docId].count += 1
    })
    return Object.values(groups).sort((left, right) => right.count - left.count)
  }, [rawChunks, selectedMainKey, selectedSubKey])

  const highlightedDocChunks = useMemo(() => {
    if (!highlightDoc) return []
    return chunkNodes
      .filter((node) => String(node.docId) === String(highlightDoc))
      .map((node) => ({ id: node.id, label: node.label, snippet: node.snippet || '', color: node.color }))
  }, [highlightDoc, chunkNodes])

  const labelConfigs = {
    main: { visible: !!mainLabelVisible, colorMode: mainLabelColorMode, size: Math.max(10, Math.min(40, mainLabelSize)) },
    sub: { visible: !!subLabelVisible, colorMode: subLabelColorMode, size: Math.max(10, Math.min(40, subLabelSize)) },
    chunk: { visible: !!chunkLabelVisible, colorMode: chunkLabelColorMode, size: Math.max(8, Math.min(30, chunkLabelSize)) },
  }

  const clickProps = {
    onMouseDown: (event) => {
      event.currentTarget.style.transform = 'scale(0.985)'
      event.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.18)'
    },
    onMouseUp: (event) => {
      event.currentTarget.style.transform = ''
      event.currentTarget.style.boxShadow = ''
    },
    onMouseLeave: (event) => {
      event.currentTarget.style.transform = ''
      event.currentTarget.style.boxShadow = ''
    },
    style: { transition: 'transform .12s cubic-bezier(.2,.9,.2,1), box-shadow .12s ease' },
  }

  function handleMainLegendClick(mainLabel) {
    const key = mainNodes.find((node) => node.label === mainLabel || node.key === mainLabel)?.key || normalizeKey(mainLabel)
    setSelectedMainKey(key)
    setSelectedSubKey(null)
    setSelectedNodeId(`main::${key}`)
    setFocusNodeId(`main::${key}`)
    setMode('sub')
    setHighlightDoc(null)
    setPanelOpen(true)
    setShowAllChunks(false)
  }

  function handleSubClick(subLabel) {
    const key = allSubNodes.find((node) => node.key === subLabel || node.label === subLabel)?.key || normalizeKey(subLabel)
    const node = allSubNodes.find((item) => item.key === key)
    setSelectedSubKey(key)
    setSelectedNodeId(node?.id || '')
    setFocusNodeId(node?.id || '')
    setMode('chunks')
    setHighlightDoc(null)
    setPanelOpen(true)
    setShowAllChunks(false)
  }

  function handleNodeClick(node) {
    if (!node) return
    setSelectedNodeId(node.id)
    setFocusNodeId(node.id)
    if (node.type === 'main') {
      setSelectedMainKey(node.key)
      setMode('sub')
      setSelectedSubKey(null)
      setHighlightDoc(null)
      setShowAllChunks(false)
    } else if (node.type === 'sub') {
      setSelectedMainKey(node.parentKey || selectedMainKey)
      setSelectedSubKey(node.key)
      setMode('chunks')
      setHighlightDoc(null)
      setShowAllChunks(false)
    } else if (node.type === 'chunk') {
      setHighlightDoc(node.docId)
      setFocusDoc(node.docId)
      setShowAllChunks(false)
    }
  }

  function handleDocumentRowClick(docId) {
    const record = rawChunks.find((chunk) => String(chunk.docId || chunk.doc_id || '') === String(docId))
    if (record) {
      const main = extractMain(record)
      const sub = extractSub(record)
      setSelectedMainKey(main.key)
      setSelectedSubKey(sub.key)
      setSelectedNodeId(record.chunk_id)
      setFocusNodeId(record.chunk_id)
    }
    setMode('chunks')
    setHighlightDoc(docId)
    setFocusDoc(docId)
    setPanelOpen(true)
    setShowAllChunks(false)
  }

  function handleResetAll() {
    setMode('main')
    setSelectedMainKey(null)
    setSelectedSubKey(null)
    setSelectedNodeId('')
    setHighlightDoc(null)
    setFocusDoc(null)
    setFocusNodeId('')
    setPanelOpen(true)
    setResetSignal((value) => value + 1)
    setShowAllChunks(false)
  }

  function triggerWarpToDoc(docId) {
    setWarpTargetDocId(docId)
    setTimeout(() => setWarpTargetDocId(null), 2800)
  }

  const fitSelection = useCallback((options = {}) => {
    const { mainKey = null, subKey = null } = options
    if (highlightDoc) {
      triggerWarpToDoc(highlightDoc)
      setFocusDoc(highlightDoc)
      return
    }

    const record = rawChunks.find((chunk) => {
      if (mainKey) {
        const main = extractMain(chunk)
        if (main.key !== mainKey) return false
      }
      if (subKey) {
        const sub = extractSub(chunk)
        if (sub.key !== subKey) return false
      }
      return true
    })

    if (record) {
      const docId = String(record.docId || record.doc_id || '')
      triggerWarpToDoc(docId)
      setFocusDoc(docId)
      setHighlightDoc(docId)
      setSelectedNodeId(record.chunk_id)
      setFocusNodeId(record.chunk_id)
      setMode('chunks')
      setSelectedMainKey(mainKey || extractMain(record).key)
      setSelectedSubKey(subKey || null)
      setPanelOpen(true)
      setShowAllChunks(false)
      return
    }

    if (docGroups.length) {
      triggerWarpToDoc(docGroups[0].docId)
      setFocusDoc(docGroups[0].docId)
    }
  }, [rawChunks, docGroups, highlightDoc])

  function cycleDoc(direction = 1) {
    if (!docGroups.length) return
    const index = docGroups.findIndex((item) => String(item.docId) === String(highlightDoc))
    const nextIndex = index === -1 ? 0 : ((index + direction + docGroups.length) % docGroups.length)
    handleDocumentRowClick(docGroups[nextIndex].docId)
  }

  async function handleRefreshGraph() {
    setRefreshing(true)
    await fetchAll()
  }

  async function handleSaveLayout() {
    const positions = visibleNodes.map((node) => ({ id: node.id, x: node.x || 0, y: node.y || 0, z: node.z || 0 }))
    setLayoutSaving(true)
    try {
      await saveKnowledgeGraphLayout(positions)
      toast.success('Graph layout saved')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save graph layout')
    } finally {
      setLayoutSaving(false)
    }
  }

  return (
    <div className="p-6 xl:p-8">
      <div className={styles.pageRoot} style={{ background: '#000' }}>
        <div style={{ position: 'absolute', left: 18, top: 12, zIndex: 9000, color: 'rgba(255,255,255,0.9)', fontWeight: 900, fontSize: 14, padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.18)' }}>
          AIgers Knowledge Galaxy
        </div>

        <div style={{ width: '100%', height: 'calc(100vh - 2rem)', marginLeft: '0', marginRight: '0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ width: '100%', height: 'calc(100vh - 2rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9fb3ff', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Sparkles size={18} />
                <div style={{ fontWeight: 800, color: 'rgba(200,230,255,0.9)', fontSize: 13 }}>Assembling the AIgers knowledge galaxy...</div>
              </div>
            </div>
          ) : (
            <AIgerDotCanvas
              nodes={visibleNodes}
              links={visibleLinks}
              selectedNodeId={selectedNodeId}
              relatedNodeIds={[...adjacency.relatedNodeIds]}
              relatedLinkIds={[...adjacency.relatedLinkIds]}
              focusDocId={focusDoc}
              focusNodeId={focusNodeId}
              onNodeClick={handleNodeClick}
              onNodeHover={() => {}}
              warpToNodeId={warpTargetDocId}
              resetSignal={resetSignal}
              showAllChunks={showAllChunks}
              starGlow={Math.max(0, Math.min(1.2, starGlow))}
              labelConfigs={labelConfigs}
            />
          )}
        </div>

        <aside style={{ position: 'absolute', right: panelOpen ? 18 : -420, top: 42, zIndex: 7000, transition: 'right .28s ease', width: 392 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderRadius: 24, background: 'rgba(4,10,22,0.82)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 90px rgba(0,0,0,0.34)', padding: 16, color: '#fff', backdropFilter: 'blur(16px)' }}>
            <div style={{ width: '100%', maxHeight: 'calc(100vh - 96px)', overflowY: 'auto', paddingRight: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, position: 'sticky', top: 0, background: 'rgba(4,10,22,0.82)', backdropFilter: 'blur(16px)', zIndex: 1, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                    {mode === 'main' ? 'Main categories' : mode === 'sub' ? `Subcategories of ${mainNodes.find((node) => node.key === selectedMainKey)?.label || selectedMainKey}` : highlightDoc ? `Chunks of ${highlightDoc}` : `Chunks ${selectedSubKey || selectedMainKey || ''}`}
                  </div>
                  <strong style={{ fontSize: 16 }}>{mode === 'main' ? 'Main Categories' : mode === 'sub' ? 'Subcategories' : highlightDoc ? 'Document Chunks' : 'Chunks'}</strong>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button {...clickProps} onClick={handleResetAll} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white">Reset</button>
                  <button {...clickProps} onClick={handleRefreshGraph} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white">{refreshing ? 'Refreshing...' : 'Refresh Data'}</button>
                  <button {...clickProps} onClick={handleSaveLayout} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white">{layoutSaving ? 'Saving...' : 'Save layout'}</button>
                  <button {...clickProps} onClick={() => setPanelOpen(false)} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white">Hide</button>
                </div>
              </div>

              <div style={{ marginTop: 12, padding: 8, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Galaxy Controls</div>

                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 12 }}>Star bloom</div>
                  <input type="range" min="0.0" max="1.2" step="0.02" value={starGlow} onChange={(event) => setStarGlow(Number(event.target.value))} style={{ flex: 1 }} />
                </div>

                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                    <span>Show structural edges</span>
                    <input type="checkbox" checked={showStructuralEdges} onChange={(event) => setShowStructuralEdges(event.target.checked)} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                    <span>Show semantic edges</span>
                    <input type="checkbox" checked={showSemanticEdges} onChange={(event) => setShowSemanticEdges(event.target.checked)} />
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 12, minWidth: 116 }}>Semantic floor</div>
                    <input type="range" min="0.7" max="0.95" step="0.01" value={semanticSimilarityFloor} onChange={(event) => setSemanticSimilarityFloor(Number(event.target.value))} style={{ flex: 1 }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', width: 36, textAlign: 'right' }}>{semanticSimilarityFloor.toFixed(2)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
                    Semantic edges can connect chunks across completely different categories when their vectors are close enough.
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Label Controls (per type)</div>

                <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Main labels</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ minWidth: 90 }}>Visible</label>
                    <input type="checkbox" checked={mainLabelVisible} onChange={(event) => setMainLabelVisible(event.target.checked)} />
                    <label style={{ minWidth: 90, marginLeft: 8 }}>Size</label>
                    <input type="range" min="10" max="36" step="1" value={mainLabelSize} onChange={(event) => setMainLabelSize(Number(event.target.value))} style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ minWidth: 90 }}>Text color</label>
                    <select value={mainLabelColorMode} onChange={(event) => setMainLabelColorMode(event.target.value)} className="glass-select" style={{ flex: 1 }}>
                      <option value="star">Use star color</option>
                      <option value="black">Black text</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Sub labels</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ minWidth: 90 }}>Visible</label>
                    <input type="checkbox" checked={subLabelVisible} onChange={(event) => setSubLabelVisible(event.target.checked)} />
                    <label style={{ minWidth: 90, marginLeft: 8 }}>Size</label>
                    <input type="range" min="10" max="32" step="1" value={subLabelSize} onChange={(event) => setSubLabelSize(Number(event.target.value))} style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ minWidth: 90 }}>Text color</label>
                    <select value={subLabelColorMode} onChange={(event) => setSubLabelColorMode(event.target.value)} className="glass-select" style={{ flex: 1 }}>
                      <option value="star">Use star color</option>
                      <option value="black">Black text</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Chunk labels</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ minWidth: 90 }}>Visible</label>
                    <input type="checkbox" checked={chunkLabelVisible} onChange={(event) => setChunkLabelVisible(event.target.checked)} />
                    <label style={{ minWidth: 90, marginLeft: 8 }}>Size</label>
                    <input type="range" min="8" max="28" step="1" value={chunkLabelSize} onChange={(event) => setChunkLabelSize(Number(event.target.value))} style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ minWidth: 90 }}>Text color</label>
                    <select value={chunkLabelColorMode} onChange={(event) => setChunkLabelColorMode(event.target.value)} className="glass-select" style={{ flex: 1 }}>
                      <option value="star">Use star color</option>
                      <option value="black">Black text</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button
                    {...clickProps}
                    className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white"
                    onClick={() => {
                      setStarGlow(0.0)
                      setMainLabelSize(18)
                      setSubLabelSize(14)
                      setChunkLabelSize(12)
                      setMainLabelColorMode('star')
                      setSubLabelColorMode('star')
                      setChunkLabelColorMode('star')
                    }}
                  >
                    Reset Visuals
                  </button>

                  <button
                    {...clickProps}
                    className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white"
                    onClick={() => {
                      const nextValue = !showAllChunks
                      setShowAllChunks(nextValue)
                      setMode('chunks')
                      setSelectedMainKey(null)
                      setSelectedSubKey(null)
                      setSelectedNodeId('')
                      setFocusNodeId('')
                      setHighlightDoc(null)
                      setPanelOpen(true)
                    }}
                    style={{ ...(clickProps.style || {}), background: showAllChunks ? 'rgba(60,110,255,0.95)' : 'rgba(255,255,255,0.08)' }}
                  >
                    {showAllChunks ? 'Showing All Chunks' : 'Show All Chunks'}
                  </button>
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <button {...clickProps} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white" onClick={() => cycleDoc(-1)}>Prev</button>
                  <button {...clickProps} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white" onClick={() => cycleDoc(1)}>Next</button>
                  <button {...clickProps} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white" onClick={() => { if (focusDoc) triggerWarpToDoc(focusDoc) }}>Zoom In</button>
                  <button {...clickProps} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white" onClick={() => fitSelection({ mainKey: selectedMainKey, subKey: selectedSubKey })}>Fit</button>
                  <button {...clickProps} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white" onClick={handleResetAll}>Reset View</button>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <AIgerSectorLegend
                  legend={mainLegendItems.reduce((accumulator, item) => {
                    accumulator[item.label] = item.color
                    return accumulator
                  }, {})}
                  counts={mainLegendItems.reduce((accumulator, item) => {
                    accumulator[item.label] = item.count
                    return accumulator
                  }, {})}
                  onClick={(value) => handleMainLegendClick(value)}
                  active={mainNodes.find((node) => node.key === selectedMainKey)?.label || null}
                />
              </div>

              <div style={{ marginTop: 12, maxHeight: '20vh', overflow: 'auto' }}>
                {selectedMainKey ? (
                  allSubNodes.filter((node) => node.parentKey === selectedMainKey).length ? allSubNodes.filter((node) => node.parentKey === selectedMainKey).map((node) => (
                    <div key={node.id} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, background: selectedNodeId === node.id ? 'rgba(56,189,248,0.14)' : 'rgba(255,255,255,0.02)', border: selectedNodeId === node.id ? '1px solid rgba(56,189,248,0.35)' : '1px solid rgba(255,255,255,0.03)', marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={() => handleSubClick(node.key)}>
                        <div style={{ width: 14, height: 14, borderRadius: 4, background: node.color || '#888' }} />
                        <div>
                          <div style={{ fontWeight: 800 }}>{node.label}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{node.count} chunks</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button {...clickProps} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white" onClick={() => handleSubClick(node.key)}>Open</button>
                        <button {...clickProps} className="rounded-full bg-white/[0.08] px-3 py-2 text-xs text-white" onClick={() => fitSelection({ mainKey: selectedMainKey, subKey: node.key })} title="Fit sub and show chunks">Fit</button>
                      </div>
                    </div>
                  )) : <div style={{ color: '#ffe600', padding: 18, fontSize: 13, fontWeight: 600 }}>No subcategories</div>
                ) : (
                  <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.7)' }}>Click a main category above to view its subcategories</div>
                )}
              </div>

              <div style={{ marginTop: 12, maxHeight: '22vh', overflow: 'auto' }}>
                <strong style={{ display: 'block', marginBottom: 8 }}>Files</strong>
                {docGroups.length ? docGroups.map((group) => (
                  <div key={group.docId} style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 12, background: highlightDoc === group.docId ? 'rgba(56,189,248,0.14)' : 'rgba(255,255,255,0.02)', border: highlightDoc === group.docId ? '1px solid rgba(56,189,248,0.35)' : '1px solid rgba(255,255,255,0.03)', marginBottom: 8 }} onClick={() => handleDocumentRowClick(group.docId)}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: group.color || '#888' }} />
                    <div>
                      <div style={{ fontWeight: 800 }}>{group.file}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{group.count} chunks</div>
                    </div>
                  </div>
                )) : <div style={{ color: '#ffe600', padding: 18, fontSize: 13, fontWeight: 600 }}>No files</div>}
              </div>

              <div style={{ marginTop: 12, maxHeight: '34vh', overflow: 'auto' }}>
                {highlightDoc ? (
                  <>
                    <div style={{ marginBottom: 8, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Chunks for <strong>{highlightDoc}</strong></div>
                    {highlightedDocChunks.length ? highlightedDocChunks.map((chunk) => (
                      <div key={chunk.id} style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', padding: 8, borderRadius: 12, background: selectedNodeId === chunk.id ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.02)', border: selectedNodeId === chunk.id ? '1px solid rgba(250,204,21,0.34)' : '1px solid rgba(255,255,255,0.03)', marginBottom: 8, flexDirection: 'column' }}>
                        <div style={{ display: 'flex', width: '100%', gap: 12 }}>
                          <div style={{ width: 14, height: 14, borderRadius: 4, background: chunk.color || '#88aaff', flex: '0 0 14px' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800 }}>{chunk.label}</div>
                            {chunk.semanticMatch ? <div style={{ fontSize: 11, color: 'rgba(56,189,248,0.92)' }}>Semantic neighbor</div> : null}
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>{chunk.snippet ? (chunk.snippet.length > 180 ? `${chunk.snippet.slice(0, 180)}...` : chunk.snippet) : 'No snippet'}</div>
                          </div>
                        </div>
                      </div>
                    )) : <div style={{ color: '#ffe600', padding: 18, fontSize: 13, fontWeight: 600 }}>No chunks for this file</div>}
                  </>
                ) : (
                  <div style={{ color: 'rgba(255,255,255,0.7)' }}>Click a file above to view its chunks</div>
                )}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                <strong>Breadcrumb:</strong> {mode === 'main' ? 'Main' : mode === 'sub' ? `Main > ${mainNodes.find((node) => node.key === selectedMainKey)?.label || selectedMainKey}` : `Main > ${mainNodes.find((node) => node.key === selectedMainKey)?.label || selectedMainKey} > ${selectedSubKey || ''}`}
              </div>
            </div>
          </div>
        </aside>

        <div style={{ position: 'absolute', right: 22, bottom: 18, zIndex: 8000 }}>
          <button {...clickProps} className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 backdrop-blur" onClick={() => setPanelOpen((value) => !value)}>
            {panelOpen ? 'Close Panel' : 'Open Panel'}
          </button>
        </div>
      </div>
    </div>
  )
}

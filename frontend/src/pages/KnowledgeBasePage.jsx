import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BookOpenText, FileStack, FolderPlus, FolderSearch2, Globe2, LockKeyhole, RefreshCcw, Rocket, Trash2, UploadCloud } from 'lucide-react'
import CustomSelect from '../components/common/CustomSelect.jsx'
import {
  createDocumentCategory,
  deleteDocument,
  ingestDocuments,
  listChunkingStrategies,
  listDocumentCategories,
  listDocuments,
  uploadDocumentsMany,
} from '../api/documents.js'

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState([])
  const [categories, setCategories] = useState([])
  const [chunkingStrategies, setChunkingStrategies] = useState({})
  const [selectedFiles, setSelectedFiles] = useState([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [addingCategory, setAddingCategory] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [filters, setFilters] = useState({ category: '', sub_category: '', visibility: '', status_filter: '' })
  const [uploadForm, setUploadForm] = useState({
    category: 'general',
    sub_category: '',
    visibility: 'private',
    chunk_strategy: 'section-aware-large',
  })
  const [createCategoryForm, setCreateCategoryForm] = useState({ main_category: '', sub_category: '' })

  const load = async (nextFilters = filters) => {
    setLoading(true)
    try {
      const [docsData, categoryData, strategyData] = await Promise.all([
        listDocuments(nextFilters),
        listDocumentCategories(),
        listChunkingStrategies(),
      ])
      setDocuments(docsData.documents || [])
      setCategories(categoryData.categories || [])
      setChunkingStrategies(strategyData.strategies || {})
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load AIgers knowledge base')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const categoryOptions = useMemo(() => {
    const base = [{ value: '', label: 'All categories', meta: `${categories.length} groups` }]
    return base.concat(
      categories.map((item) => ({
        value: item.main,
        label: item.main,
        meta: `${item.count || 0} docs`,
      })),
    )
  }, [categories])

  const uploadCategoryOptions = useMemo(() => {
    const base = [{ value: 'general', label: 'general', meta: 'default' }]
    const seen = new Set(base.map((item) => item.value))
    categories.forEach((item) => {
      if (!seen.has(item.main)) {
        base.push({ value: item.main, label: item.main, meta: `${item.count || 0} docs` })
        seen.add(item.main)
      }
    })
    return base
  }, [categories])

  const currentFilterSubcategories = useMemo(() => {
    const selected = categories.find((item) => item.main === filters.category)
    return selected?.subcategories || []
  }, [categories, filters.category])

  const currentUploadSubcategories = useMemo(() => {
    const selected = categories.find((item) => item.main === uploadForm.category)
    return selected?.subcategories || []
  }, [categories, uploadForm.category])

  const subcategoryFilterOptions = useMemo(() => {
    const base = [{ value: '', label: 'All subcategories', meta: currentFilterSubcategories.length ? `${currentFilterSubcategories.length} options` : 'none' }]
    return base.concat(currentFilterSubcategories.map((item) => ({
      value: item.name,
      label: item.name,
      meta: `${item.count || 0} docs`,
    })))
  }, [currentFilterSubcategories])

  const uploadSubcategoryOptions = useMemo(() => {
    const base = [{ value: '', label: 'No subcategory', meta: 'optional' }]
    return base.concat(currentUploadSubcategories.map((item) => ({
      value: item.name,
      label: item.name,
      meta: item.color ? 'saved' : '',
    })))
  }, [currentUploadSubcategories])

  const visibilityOptions = [
    { value: '', label: 'Public + private', meta: 'all' },
    { value: 'private', label: 'Private', meta: 'owner only' },
    { value: 'public', label: 'Public', meta: 'shared' },
  ]

  const uploadVisibilityOptions = [
    { value: 'private', label: 'Private', meta: 'owner only' },
    { value: 'public', label: 'Public', meta: 'shared' },
  ]

  const statusOptions = [
    { value: '', label: 'All statuses', meta: 'all' },
    { value: 'uploaded', label: 'Uploaded', meta: 'raw only' },
    { value: 'embedding', label: 'Embedding', meta: 'running' },
    { value: 'embedded', label: 'Embedded', meta: 'ready' },
    { value: 'failed', label: 'Failed', meta: 'retry' },
  ]

  const chunkStrategyOptions = useMemo(() => (
    Object.entries(chunkingStrategies).map(([key, value]) => ({
      value: key,
      label: key,
      meta: value?.label || value?.description || 'strategy',
    }))
  ), [chunkingStrategies])

  const selectedDocuments = useMemo(
    () => documents.filter((item) => selectedDocumentIds.includes(item.document_id)),
    [documents, selectedDocumentIds],
  )

  const queuedForEmbed = useMemo(
    () => selectedDocuments.filter((item) => item.status !== 'embedding'),
    [selectedDocuments],
  )

  const stats = useMemo(() => ({
    total: documents.length,
    embedded: documents.filter((item) => item.status === 'embedded').length,
    uploaded: documents.filter((item) => item.status === 'uploaded').length,
    failed: documents.filter((item) => item.status === 'failed').length,
  }), [documents])

  const toggleSelectedDocument = (documentId) => {
    setSelectedDocumentIds((current) => (
      current.includes(documentId)
        ? current.filter((item) => item !== documentId)
        : current.concat(documentId)
    ))
  }

  const handleCreateCategory = async () => {
    const main = normalizeName(createCategoryForm.main_category || uploadForm.category)
    const sub = normalizeName(createCategoryForm.sub_category)
    if (!main) {
      toast.error('Enter or select a category first')
      return
    }
    setAddingCategory(true)
    try {
      await createDocumentCategory({ main_category: main, sub_category: sub || null })
      toast.success(sub ? `Saved ${main} / ${sub}` : `Saved ${main}`)
      setUploadForm((current) => ({ ...current, category: main, sub_category: sub || current.sub_category }))
      setCreateCategoryForm({ main_category: '', sub_category: '' })
      await load()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save category')
    } finally {
      setAddingCategory(false)
    }
  }

  const handleUpload = async () => {
    if (!selectedFiles.length) {
      toast.error('Choose one or more files to upload')
      return
    }
    setUploading(true)
    try {
      const result = await uploadDocumentsMany(selectedFiles, uploadForm)
      const successful = (result.documents || []).filter((item) => !item.error)
      const failed = (result.documents || []).filter((item) => item.error)
      toast.success(`Uploaded ${successful.length} file(s)${failed.length ? `, ${failed.length} failed` : ''}`)
      setSelectedFiles([])
      setSelectedDocumentIds((current) => current.concat(successful.map((item) => item.document_id)).filter(Boolean))
      await load()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleIngest = async (documentIds = selectedDocumentIds) => {
    const ids = (documentIds || []).filter(Boolean)
    if (!ids.length) {
      toast.error('Select at least one uploaded document to embed')
      return
    }
    setIngesting(true)
    try {
      const result = await ingestDocuments(ids)
      toast.success(`Queued ${result.count || 0} document(s) for embedding`)
      await load(filters)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Embedding request failed')
    } finally {
      setIngesting(false)
    }
  }

  const handleDelete = async (documentId) => {
    setDeletingId(documentId)
    try {
      await deleteDocument(documentId)
      toast.success('Document and related chunks deleted')
      setSelectedDocumentIds((current) => current.filter((item) => item !== documentId))
      await load(filters)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Delete failed')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="p-6 xl:p-8 max-w-[1680px] space-y-5">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-6 py-7 shadow-[0_28px_90px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100">
              <BookOpenText size={12} /> AIgers document control plane
            </div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">Upload raw files, curate metadata, then ingest them into the AIgers vector graph.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Upload stores the source asset and base metadata in <code>aigers_documents</code>. Embed runs parsing, chunking, embeddings, and chunk persistence into <code>aigers_chunks</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load(filters)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs text-muted hover:border-cyan-300/35 hover:text-ink"
          >
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[450px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-2 text-sm font-medium text-ink"><UploadCloud size={15} className="text-cyan-300" /> Upload raw documents</div>
            <div className="mt-4 space-y-3">
              <input
                type="file"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                className="block w-full rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-3 py-5 text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-950"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Category</label>
                  <CustomSelect label="Category" value={uploadForm.category} onChange={(value) => setUploadForm((current) => ({ ...current, category: value, sub_category: '' }))} options={uploadCategoryOptions} />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Subcategory</label>
                  <CustomSelect label="Subcategory" value={uploadForm.sub_category} onChange={(value) => setUploadForm((current) => ({ ...current, sub_category: value }))} options={uploadSubcategoryOptions} />
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted"><FolderPlus size={13} /> Add category or subcategory</div>
                <div className="mt-3 grid gap-3">
                  <input
                    value={createCategoryForm.main_category}
                    onChange={(event) => setCreateCategoryForm((current) => ({ ...current, main_category: normalizeName(event.target.value) }))}
                    placeholder="new-or-existing-category"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-ink outline-none transition focus:border-cyan-300/40"
                  />
                  <input
                    value={createCategoryForm.sub_category}
                    onChange={(event) => setCreateCategoryForm((current) => ({ ...current, sub_category: normalizeName(event.target.value) }))}
                    placeholder="new-subcategory-optional"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-ink outline-none transition focus:border-cyan-300/40"
                  />
                  <button onClick={handleCreateCategory} disabled={addingCategory} className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100 hover:border-cyan-300/35 disabled:opacity-50">
                    <FolderPlus size={14} /> {addingCategory ? 'Saving...' : 'Save category'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Visibility</label>
                  <CustomSelect label="Visibility" value={uploadForm.visibility} onChange={(value) => setUploadForm((current) => ({ ...current, visibility: value }))} options={uploadVisibilityOptions} />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Chunking</label>
                  <CustomSelect label="Chunking strategy" value={uploadForm.chunk_strategy} onChange={(value) => setUploadForm((current) => ({ ...current, chunk_strategy: value }))} options={chunkStrategyOptions.length ? chunkStrategyOptions : [{ value: 'section-aware-large', label: 'section-aware-large', meta: 'default' }]} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button onClick={handleUpload} disabled={uploading} className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:opacity-50">
                  <UploadCloud size={14} /> {uploading ? 'Uploading...' : `Upload ${selectedFiles.length ? `${selectedFiles.length} file(s)` : 'files'}`}
                </button>
                <button onClick={() => handleIngest()} disabled={ingesting || !queuedForEmbed.length} className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-medium text-emerald-100 transition hover:border-emerald-300/40 disabled:opacity-50">
                  <Rocket size={14} /> {ingesting ? 'Embedding...' : `Embed ${queuedForEmbed.length ? queuedForEmbed.length : 'selected'}`}
                </button>
              </div>

              {selectedFiles.length ? (
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-muted">
                  {selectedFiles.map((file) => file.name).join(', ')}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-2 text-sm font-medium text-ink"><FolderSearch2 size={15} className="text-amber-300" /> Filter documents</div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Category</label>
                <CustomSelect label="Filter category" value={filters.category} onChange={(value) => setFilters((current) => ({ ...current, category: value, sub_category: '' }))} options={categoryOptions} />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Subcategory</label>
                <CustomSelect label="Filter subcategory" value={filters.sub_category} onChange={(value) => setFilters((current) => ({ ...current, sub_category: value }))} options={subcategoryFilterOptions} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Visibility</label>
                  <CustomSelect label="Filter visibility" value={filters.visibility} onChange={(value) => setFilters((current) => ({ ...current, visibility: value }))} options={visibilityOptions} />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Status</label>
                  <CustomSelect label="Filter status" value={filters.status_filter} onChange={(value) => setFilters((current) => ({ ...current, status_filter: value }))} options={statusOptions} />
                </div>
              </div>
              <button onClick={() => load(filters)} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-ink hover:border-amber-300/35">
                <RefreshCcw size={14} /> Apply filters
              </button>
            </div>
          </section>
        </aside>

        <section className="space-y-4 min-w-0">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard icon={FileStack} label="Documents" value={stats.total} accent="text-cyan-100" />
            <StatCard icon={Rocket} label="Embedded" value={stats.embedded} accent="text-emerald-100" />
            <StatCard icon={UploadCloud} label="Raw Uploads" value={stats.uploaded} accent="text-amber-100" />
            <StatCard icon={Trash2} label="Failed" value={stats.failed} accent="text-rose-100" />
          </div>

          <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-ink">AIgers document registry</div>
                <div className="mt-1 text-xs text-muted">Delete removes the raw document record and all chunk rows tied to that document id.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-muted">
                  {loading ? 'Syncing' : `${documents.length} loaded`}
                </div>
                <button onClick={() => handleIngest()} disabled={ingesting || !selectedDocumentIds.length} className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs text-emerald-100 disabled:opacity-50">
                  <Rocket size={13} /> Embed selected
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {documents.map((doc) => {
                const selected = selectedDocumentIds.includes(doc.document_id)
                return (
                  <div key={doc.document_id} className={`rounded-[24px] border p-4 transition ${selected ? 'border-cyan-300/30 bg-cyan-300/[0.08]' : 'border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))]'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelectedDocument(doc.document_id)}
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">{doc.filename}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-muted">
                            <span>{doc.main_category || 'general'}</span>
                            {doc.sub_category ? <span>/ {doc.sub_category}</span> : null}
                            <span>•</span>
                            <span>{doc.chunk_strategy}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={doc.status} />
                        <span className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${doc.visibility === 'public' ? 'border border-sky-300/30 bg-sky-300/10 text-sky-100' : 'border border-white/10 bg-white/[0.04] text-muted'}`}>
                          {doc.visibility === 'public' ? <Globe2 size={11} className="mr-1 inline" /> : <LockKeyhole size={11} className="mr-1 inline" />}
                          {doc.visibility || 'private'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="grid gap-2 text-xs text-muted sm:grid-cols-4">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                          <div className="uppercase tracking-[0.16em]">Size</div>
                          <div className="mt-1 text-ink">{formatBytes(doc.file_size_bytes || 0)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                          <div className="uppercase tracking-[0.16em]">Chars</div>
                          <div className="mt-1 text-ink">{doc.text_length || 0}</div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                          <div className="uppercase tracking-[0.16em]">Chunks</div>
                          <div className="mt-1 text-ink">{doc.chunk_count || 0}</div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                          <div className="uppercase tracking-[0.16em]">Updated</div>
                          <div className="mt-1 text-ink">{formatTimestamp(doc.updated_at)}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleIngest([doc.document_id])}
                          disabled={ingesting || doc.status === 'embedding'}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs text-emerald-100 disabled:opacity-50"
                        >
                          <Rocket size={13} /> {doc.status === 'embedded' ? 'Re-embed' : 'Embed'}
                        </button>
                        <button
                          onClick={() => handleDelete(doc.document_id)}
                          disabled={deletingId === doc.document_id || doc.status === 'embedding'}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-xs text-rose-100 disabled:opacity-50"
                        >
                          <Trash2 size={13} /> {deletingId === doc.document_id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {doc.ingest_error ? (
                      <div className="mt-3 rounded-[18px] border border-rose-300/15 bg-rose-300/[0.07] px-4 py-3 text-xs text-rose-100">
                        {doc.ingest_error}
                      </div>
                    ) : null}

                    {doc.context_excerpt ? (
                      <div className="mt-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-muted">
                        {doc.context_excerpt}
                      </div>
                    ) : null}
                  </div>
                )
              })}

              {!loading && !documents.length ? (
                <div className="rounded-[24px] border border-dashed border-white/12 bg-white/[0.02] p-8 text-center text-sm text-muted">
                  No documents match the current filters yet.
                </div>
              ) : null}
            </div>
          </section>
        </section>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.16)]">
      <div className={`inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] ${accent}`}>
        <Icon size={13} /> {label}
      </div>
      <div className="mt-3 text-3xl font-display font-semibold tracking-tight text-ink">{value}</div>
    </div>
  )
}

function StatusPill({ status }) {
  const normalized = String(status || 'unknown').toLowerCase()
  const styles = {
    uploaded: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
    embedding: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
    embedded: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    failed: 'border-rose-300/20 bg-rose-300/10 text-rose-100',
    deleted: 'border-white/10 bg-white/[0.04] text-muted',
  }
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${styles[normalized] || styles.deleted}`}>
      {normalized}
    </span>
  )
}

function formatBytes(value) {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatTimestamp(value) {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'n/a'
  return date.toLocaleString()
}

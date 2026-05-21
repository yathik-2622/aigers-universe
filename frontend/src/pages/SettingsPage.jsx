import React, { useEffect, useMemo, useState } from 'react'
import { Palette, Save, Settings2, Sparkles, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import CustomSelect from '../components/common/CustomSelect.jsx'
import { discoverSettingsModels } from '../api/settings.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { normalizeModelOptions } from '../lib/modelOptions.js'

const PROVIDERS = [
  { value: 'gateway', label: 'Platform Gateway', meta: 'default' },
  { value: 'custom', label: 'Custom OpenAI Gateway', meta: 'base url' },
  { value: 'openrouter', label: 'OpenRouter', meta: 'catalog' },
  { value: 'groq', label: 'Groq', meta: 'catalog' },
  { value: 'nvidia', label: 'NVIDIA', meta: 'catalog' },
]

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings()
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [modelCatalog, setModelCatalog] = useState({ models: [] })

  useEffect(() => {
    setForm(settings)
  }, [settings])

  useEffect(() => {
    let mounted = true
    setDiscovering(true)
    discoverSettingsModels()
      .then((data) => {
        if (mounted) setModelCatalog(data)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setDiscovering(false)
      })
    return () => { mounted = false }
  }, [settings.provider, settings.default_model])

  const modelOptions = useMemo(() => normalizeModelOptions(modelCatalog.models || []), [modelCatalog.models])

  const save = async () => {
    setSaving(true)
    try {
      await updateSettings(form)
      const freshCatalog = await discoverSettingsModels()
      setModelCatalog(freshCatalog)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const field = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-accent">
          <Settings2 size={12} /> Runtime settings
        </div>
        <h2 className="mt-4 text-3xl font-display font-semibold tracking-tight">Provider, model, theme, and tool keys</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">This page controls the live provider runtime for your account. Model lists are fetched from the selected provider using the keys you save here.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2 text-sm font-medium text-ink"><Sparkles size={15} className="text-accent" /> LLM runtime</div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Provider</label>
              <CustomSelect label="Provider" value={form.provider} onChange={(value) => field('provider', value)} options={PROVIDERS} />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Theme</label>
              <CustomSelect
                label="Theme"
                value={form.theme || 'dark'}
                onChange={(value) => field('theme', value)}
                options={[
                  { value: 'dark', label: 'Dark theme', meta: 'default' },
                  { value: 'light', label: 'Light theme', meta: 'bright' },
                ]}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Base URL</label>
              <input value={form.base_url || ''} onChange={(e) => field('base_url', e.target.value)} placeholder="https://your-openai-compatible-endpoint/v1" className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-ink outline-none transition focus:border-accent/40" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Default model</label>
              <CustomSelect label="Default model" value={form.default_model || 'gpt-4o'} onChange={(value) => field('default_model', value)} options={modelOptions.length ? modelOptions : [{ value: 'gpt-4o', label: 'gpt-4o', meta: 'fallback' }]} />
              <div className="mt-2 text-xs text-muted">{discovering ? 'Refreshing provider model catalog...' : `${modelCatalog.count || modelOptions.length || 0} models available for the selected provider.`}</div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">Embedding model</label>
              <input value={form.embedding_model || ''} onChange={(e) => field('embedding_model', e.target.value)} placeholder="text-embedding-3-small" className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-ink outline-none transition focus:border-accent/40" />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2 text-sm font-medium text-ink"><KeyRound size={15} className="text-accent2" /> Secrets and tool keys</div>
          <div className="mt-5 space-y-4">
            {[
              ['api_key', 'Primary API key'],
              ['openrouter_api_key', 'OpenRouter key'],
              ['groq_api_key', 'Groq key'],
              ['nvidia_api_key', 'NVIDIA key'],
              ['github_token', 'GitHub token'],
              ['serpapi_key', 'SerpAPI key'],
              ['openweather_api_key', 'OpenWeather key'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">{label}</label>
                <input type="password" value={form[key] || ''} onChange={(e) => field(key, e.target.value)} placeholder={`Enter ${label.toLowerCase()}`} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-ink outline-none transition focus:border-accent/40" />
                {settings?.[`${key}_masked`] && !form[key] ? <div className="mt-1 text-xs text-muted">Configured: {settings[`${key}_masked`]}</div> : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-2 text-sm font-medium text-ink"><Palette size={15} className="text-warn" /> Provider catalog preview</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(modelOptions || []).slice(0, 18).map((model) => (
            <div key={model.value} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{model.label}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted">{model.provider}</div>
                </div>
                {model.free ? <span className="rounded-full border border-ok/30 bg-ok/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-ok">Free</span> : null}
              </div>
              {model.context_length ? <div className="mt-2 text-xs text-muted">Context: {model.context_length}</div> : null}
              {model.description ? <div className="mt-2 line-clamp-3 text-xs leading-5 text-muted">{model.description}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
          <Save size={14} /> {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}

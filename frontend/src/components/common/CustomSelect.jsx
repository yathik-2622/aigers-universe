import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

function normalizeOption(option) {
  if (typeof option === 'string') {
    return { value: option, label: option }
  }
  return option
}

export default function CustomSelect({
  label,
  value,
  options = [],
  onChange,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  disabled = false,
  menuPlacement = 'down',
  maxVisibleOptions = 6,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const normalizedOptions = useMemo(() => options.map(normalizeOption), [options])
  const selected = normalizedOptions.find((item) => item.value === value) || normalizedOptions[0]
  const maxHeightClass = maxVisibleOptions <= 4 ? 'max-h-44' : maxVisibleOptions <= 5 ? 'max-h-52' : 'max-h-56'
  const placementClass = menuPlacement === 'up'
    ? 'bottom-[calc(100%+0.45rem)]'
    : 'top-[calc(100%+0.55rem)]'

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => !disabled && setOpen((state) => !state)}
        className={`inline-flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[20px] border border-line bg-white/[0.04] px-3 py-2 text-left text-sm text-ink/90 backdrop-blur-xl transition hover:border-accent/30 disabled:cursor-not-allowed disabled:opacity-50 ${buttonClassName}`}

      >
        <span className="min-w-0 truncate">{selected?.label || label}</span>
        <ChevronDown size={14} className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute left-0 z-50 min-w-full overflow-hidden rounded-[24px] border border-line bg-panel p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl ${placementClass} ${menuClassName}`}>
          {label && <div className="px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.22em] text-muted">{label}</div>}
          <div className={`${maxHeightClass} space-y-1 overflow-y-auto pr-1`}>
            {normalizedOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  if (option.disabled) return
                  onChange?.(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                  option.value === value
                    ? 'bg-accent/14 text-ink'
                    : 'bg-transparent text-ink/70 hover:bg-white/[0.06]'
                } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {option.meta && <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted">{option.meta}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

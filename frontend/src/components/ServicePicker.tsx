import { useEffect, useRef, useState } from 'react'
import { api, priceDisplay } from '../api'
import type { ServiceShort } from '../types'
import { inputCls } from './ui'

interface Props {
  onSelect: (s: ServiceShort) => void
  excludeIds?: number[]
  placeholder?: string
  autoFocus?: boolean
}

/** Поле ввода с выпадающими подсказками из реестра услуг. */
export default function ServicePicker({ onSelect, excludeIds = [], placeholder, autoFocus }: Props) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ServiceShort[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const t = setTimeout(() => {
      api<ServiceShort[]>(`/services/search?q=${encodeURIComponent(q)}&limit=12`)
        .then((r) => {
          setItems(r.filter((s) => !excludeIds.includes(s.id)))
          setActive(0)
        })
        .catch(() => setItems([]))
        .finally(() => setLoading(false))
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, excludeIds.join(',')])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const choose = (s: ServiceShort) => {
    onSelect(s)
    setQ('')
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        className={inputCls}
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Начните вводить название услуги…'}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(a + 1, items.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (open && items[active]) choose(items[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-96 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {items.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-400">{loading ? 'Поиск…' : 'Ничего не найдено в реестре'}</div>
          )}
          {items.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(s)
              }}
              className={`block w-full px-3 py-2 text-left ${i === active ? 'bg-brand-50' : ''}`}
            >
              <div className="text-sm font-medium text-slate-800">{s.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                {s.category && <span>{s.category}</span>}
                <span className="font-medium text-slate-700">{priceDisplay(s.price, s.price_text, s.price_unit) || 'цена не указана'}</span>
                {s.stages_count > 0 && (
                  <span className="rounded bg-brand-100 px-1.5 py-0.5 text-brand-800">этапов: {s.stages_count}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

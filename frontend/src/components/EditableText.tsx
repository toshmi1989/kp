import { useLayoutEffect, useRef } from 'react'

interface Props {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  className?: string
  /** запретить переносы строк (Enter) */
  singleLine?: boolean
  /** подсветить, если поле пустое (нужно заполнить) */
  required?: boolean
  title?: string
}

/**
 * Поле, которое выглядит как обычный текст документа, но редактируется
 * по клику. Высота подстраивается под содержимое.
 */
export default function EditableText({ value, onChange, placeholder, className = '', singleLine, required, title }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = '0px'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value])

  if (!onChange) {
    return <div className={`whitespace-pre-wrap ${className}`}>{value || <span className="text-slate-300">{placeholder}</span>}</div>
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      title={title}
      placeholder={placeholder}
      spellCheck
      onChange={(e) => onChange(singleLine ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') e.preventDefault()
      }}
      className={`doc-edit block w-full ${required && !value.trim() ? 'is-empty' : ''} ${className}`}
    />
  )
}

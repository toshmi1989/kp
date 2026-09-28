import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { assetUrl, formatPrice, parsePrice } from '../api'
import type { ProposalData, ProposalItem, Stage } from '../types'
import EditableText from './EditableText'

export interface RegistryPrice {
  price: string | null
  price_text: string
  price_unit: string
}

interface Props {
  data: ProposalData
  onChange?: (d: ProposalData) => void
  priceUnits?: string[]
  /** исходные цены из реестра — чтобы подсветить изменённые */
  registry?: Record<number, RegistryPrice>
}

export function priceChanged(item: ProposalItem, reg?: RegistryPrice) {
  if (!reg) return false
  const a = item.price === null || item.price === '' ? null : Number(item.price)
  const b = reg.price === null ? null : Number(reg.price)
  return a !== b || item.price_text.trim() !== reg.price_text.trim() || item.price_unit.trim() !== reg.price_unit.trim()
}

/** Небольшое поле, ширина которого подстраивается под текст. */
function InlineInput({
  value,
  onChange,
  placeholder,
  className = '',
  list,
}: {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  className?: string
  list?: string
}) {
  if (!onChange) return <span className={className}>{value}</span>
  return (
    <input
      value={value}
      list={list}
      placeholder={placeholder}
      size={Math.max((value || placeholder || '').length, 3)}
      style={{ fieldSizing: 'content' } as CSSProperties}
      onChange={(e) => onChange(e.target.value)}
      className={`doc-edit inline-block max-w-full px-0.5 ${!value.trim() && placeholder ? 'is-empty' : ''} ${className}`}
    />
  )
}

function PriceInput({ value, onChange, optional }: { value: string | null; onChange: (v: string | null) => void; optional?: boolean }) {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState('')
  const shown = focused ? raw : formatPrice(value)
  return (
    <input
      value={shown}
      placeholder="______"
      inputMode="decimal"
      size={Math.max(shown.length, 6)}
      onFocus={() => {
        setRaw(value === null ? '' : String(Number(value)).replace('.', ','))
        setFocused(true)
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setRaw(e.target.value)
        onChange(parsePrice(e.target.value))
      }}
      className={`doc-edit inline-block px-0.5 text-center font-bold ${value === null && !optional ? 'is-empty' : ''}`}
    />
  )
}

interface Group {
  title: string
  rows: { item: ProposalItem; index: number; num: number }[]
}

function groupItems(items: ProposalItem[]): Group[] {
  const groups: Group[] = []
  items.forEach((item, index) => {
    const title = item.table_group.trim()
    if (!groups.length || groups[groups.length - 1].title !== title) groups.push({ title, rows: [] })
    groups[groups.length - 1].rows.push({ item, index, num: index + 1 })
  })
  return groups
}

function uniqueNotes(items: ProposalItem[]) {
  const seen: string[] = []
  items.forEach((i) => {
    const n = i.price_note.trim()
    if (n && !seen.includes(n)) seen.push(n)
  })
  return seen
}

const SmallBtn = ({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className="flex h-5 w-5 items-center justify-center rounded text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700"
  >
    {children}
  </button>
)

export default function Paper({ data, onChange, priceUnits = [], registry = {} }: Props) {
  const edit = !!onChange
  const set = <K extends keyof ProposalData>(key: K) =>
    onChange ? (v: ProposalData[K]) => onChange({ ...data, [key]: v }) : undefined

  const setItem = (index: number, patch: Partial<ProposalItem>) =>
    onChange?.({ ...data, items: data.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) })

  const setGroupTitle = (g: Group, title: string) => {
    const idx = new Set(g.rows.map((r) => r.index))
    onChange?.({ ...data, items: data.items.map((it, i) => (idx.has(i) ? { ...it, table_group: title } : it)) })
  }

  const setNote = (old: string, value: string) =>
    onChange?.({ ...data, items: data.items.map((it) => (it.price_note.trim() === old ? { ...it, price_note: value } : it)) })

  const setStages = (index: number, stages: Stage[]) => setItem(index, { stages })

  const groups = groupItems(data.items)
  const notes = uniqueNotes(data.items)
  const stageItems = data.items.map((it, index) => ({ it, index })).filter(({ it }) => it.show_stages && (it.stages.length > 0 || edit))

  return (
    <div
      className="doc-paper mx-auto bg-white text-black shadow-lg ring-1 ring-slate-200"
      style={{ width: '210mm', minHeight: '297mm', padding: '12mm 12mm 18mm 22mm', fontFamily: 'var(--font-doc)', fontSize: '11pt', lineHeight: 1.2 }}
    >
      <datalist id="price-units">
        {priceUnits.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      {/* шапка — неизменяемая часть бланка */}
      <div className="flex items-start">
        <img src={assetUrl('logo.jpg')} alt="Логотип" style={{ width: '77mm', marginLeft: '-10mm', marginTop: '-1mm' }} />
        <div className="flex-1 text-center" style={{ marginLeft: '2mm' }}>
          <div className="font-bold">Автономная некоммерческая организация</div>
          <div className="font-bold">«Национальный научный центр фармаконадзора»</div>
          <div style={{ height: 3, background: '#329234', margin: '3px 0 5px' }} />
          <div>143026, г. Москва, Большой Бульвар, д.42, стр.1, этаж 0, пом.103, комн.13</div>
        </div>
      </div>

      {/* адресат */}
      <div className="mt-5 ml-auto text-right" style={{ width: '60%', color: '#333' }}>
        <EditableText className="text-right" singleLine required value={data.recipient_position} onChange={set('recipient_position')} placeholder="Генеральному директору" />
        <EditableText className="text-right" singleLine required value={data.company} onChange={set('company')} placeholder="ООО «Компания»" />
        <EditableText className="text-right" singleLine required value={data.director_short} onChange={set('director_short')} placeholder="Иванову И.И." />
      </div>

      <div className="mt-4 text-center font-bold">Коммерческое предложение</div>
      <div className="mt-3 text-center italic">
        <EditableText className="text-center" singleLine required value={data.greeting} onChange={set('greeting')} placeholder="Уважаемый Иван Иванович!" />
      </div>

      <div className="mt-3">
        <EditableText className="text-justify indent-[1.25cm]" value={data.intro_text} onChange={set('intro_text')} required />
      </div>
      <div className="mt-1 mb-2 text-center font-bold">
        <EditableText className="text-center" value={data.section_title} onChange={set('section_title')} placeholder="СТОИМОСТЬ ОТДЕЛЬНЫХ УСЛУГ" />
      </div>

      {/* таблица услуг */}
      <table style={{ fontSize: '10pt', marginLeft: '-7.6mm', width: 'calc(100% + 7.6mm)' }}>
        <colgroup>
          <col style={{ width: '5.3%' }} />
          <col style={{ width: '65.6%' }} />
          <col style={{ width: '29.1%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="px-1 py-2 font-bold">№.</th>
            <th className="px-1 py-2 font-bold">НАИМЕНОВАНИЕ УСЛУГИ</th>
            <th className="px-1 py-2 font-bold">
              <EditableText className="text-center" value={data.price_header} onChange={set('price_header')} />
            </th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr>
              <td colSpan={3} className="px-2 py-6 text-center font-sans text-sm text-slate-400">
                Добавьте услугу — она появится здесь
              </td>
            </tr>
          )}
          {groups.map((g, gi) => (
            <GroupRows key={gi}>
              {g.title && (
                <tr>
                  <td colSpan={3} className="doc-group px-1 py-1 text-center font-bold" style={{ fontSize: '11pt' }}>
                    <EditableText className="text-center" value={g.title} onChange={edit ? (v) => setGroupTitle(g, v) : undefined} />
                  </td>
                </tr>
              )}
              {g.rows.map(({ item, index, num }) => {
                const changed = item.service_id != null && priceChanged(item, registry[item.service_id])
                return (
                  <tr key={index}>
                    <td className="px-1 text-center">{num}.</td>
                    <td className="px-1 py-0.5 align-top">
                      <EditableText className="font-bold" value={item.name} onChange={edit ? (v) => setItem(index, { name: v }) : undefined} required />
                      {(item.description || edit) && (
                        <EditableText
                          className="mt-1"
                          value={item.description}
                          onChange={edit ? (v) => setItem(index, { description: v }) : undefined}
                          placeholder={edit ? 'Описание (необязательно; **жирный**)' : ''}
                        />
                      )}
                      {(item.duration_text || edit) && (
                        <div className="mt-1.5 flex items-baseline">
                          <InlineInput value={item.duration_label} onChange={edit ? (v) => setItem(index, { duration_label: v }) : undefined} className="shrink-0" />
                          <span className="min-w-0 flex-1 pl-1 italic">
                            <EditableText
                              value={item.duration_text}
                              onChange={edit ? (v) => setItem(index, { duration_text: v }) : undefined}
                              placeholder={edit ? 'срок (необязательно)' : ''}
                            />
                          </span>
                        </div>
                      )}
                    </td>
                    <td className={`px-1 text-center font-bold ${changed ? 'bg-amber-50' : ''}`}>
                      {edit ? (
                        <div className="flex flex-wrap items-baseline justify-center gap-x-1">
                          {item.price_text.trim() ? (
                            <InlineInput value={item.price_text} onChange={(v) => setItem(index, { price_text: v })} className="text-center font-bold" />
                          ) : (
                            <PriceInput value={item.price} optional={!!item.price_note.trim()} onChange={(v) => setItem(index, { price: v })} />
                          )}
                          {item.price_unit.trim() && <span>/</span>}
                          <InlineInput
                            value={item.price_unit}
                            list="price-units"
                            onChange={(v) => setItem(index, { price_unit: v })}
                            className="text-center font-bold"
                          />
                        </div>
                      ) : (
                        <span>
                          {[item.price_text.trim() || formatPrice(item.price), item.price_unit.trim()].filter(Boolean).join(' / ')}
                        </span>
                      )}
                      {changed && (
                        <div className="mt-1 font-sans text-[10px] font-normal text-amber-700">
                          изменено (в реестре: {registry[item.service_id!].price_text || formatPrice(registry[item.service_id!].price) || '—'})
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </GroupRows>
          ))}
        </tbody>
      </table>

      {notes.map((n) => (
        <div key={n} className="italic" style={{ fontSize: '10pt', marginLeft: '-7.6mm' }}>
          <EditableText value={n} onChange={edit ? (v) => setNote(n, v) : undefined} />
        </div>
      ))}

      {/* детализация: этапы и сроки */}
      {stageItems.map(({ it, index }) => (
        <div key={index} className="mt-5">
          <div className="mb-2 text-center font-bold">
            <EditableText
              className="text-center"
              value={it.stages_title}
              onChange={edit ? (v) => setItem(index, { stages_title: v }) : undefined}
              placeholder="Заголовок детализации"
            />
          </div>
          <table style={{ fontSize: '10pt', marginLeft: '-7.6mm', width: 'calc(100% + 7.6mm)' }}>
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '61.9%' }} />
              <col style={{ width: '29.1%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="px-1 py-1 font-bold leading-tight">п/н этапа</th>
                <th className="px-1 py-1 font-bold">
                  <EditableText className="text-center" value={it.stages_name_header} onChange={edit ? (v) => setItem(index, { stages_name_header: v }) : undefined} />
                </th>
                <th className="px-1 py-1 font-bold">
                  <EditableText className="text-center" value={it.stages_duration_header} onChange={edit ? (v) => setItem(index, { stages_duration_header: v }) : undefined} />
                </th>
              </tr>
            </thead>
            <tbody>
              {it.stages.map((st, si) => (
                <tr key={si} className="group">
                  <td className="relative text-center">
                    {si + 1}.
                    {edit && (
                      <div className="absolute top-0 -left-7 hidden flex-col rounded bg-white font-sans shadow ring-1 ring-slate-200 group-hover:flex">
                        <SmallBtn title="Выше" onClick={() => si > 0 && setStages(index, move(it.stages, si, si - 1))}>↑</SmallBtn>
                        <SmallBtn title="Ниже" onClick={() => si < it.stages.length - 1 && setStages(index, move(it.stages, si, si + 1))}>↓</SmallBtn>
                        <SmallBtn title="Удалить этап" onClick={() => setStages(index, it.stages.filter((_, k) => k !== si))}>✕</SmallBtn>
                      </div>
                    )}
                  </td>
                  <td className="px-1">
                    <EditableText value={st.name} onChange={edit ? (v) => setStages(index, it.stages.map((x, k) => (k === si ? { ...x, name: v } : x))) : undefined} required />
                  </td>
                  <td className="px-1 text-center">
                    <EditableText className="text-center" value={st.duration} onChange={edit ? (v) => setStages(index, it.stages.map((x, k) => (k === si ? { ...x, duration: v } : x))) : undefined} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {edit && (
            <button
              type="button"
              onClick={() => setStages(index, [...it.stages, { name: '', duration: '' }])}
              className="mt-1 font-sans text-xs text-brand-700 hover:underline"
              style={{ marginLeft: '-7.6mm' }}
            >
              + добавить этап
            </button>
          )}
        </div>
      ))}

      {(data.footnotes || edit) && (
        <div className="mt-3" style={{ fontSize: '9pt', marginLeft: '-7.6mm' }}>
          <EditableText value={data.footnotes} onChange={set('footnotes')} placeholder={edit ? 'Сноски: каждая строка — отдельная (*При необходимости …)' : ''} />
        </div>
      )}
      {(data.extra_text || edit) && (
        <div className="mt-2">
          <EditableText
            className="text-justify indent-[1.25cm]"
            value={data.extra_text}
            onChange={set('extra_text')}
            placeholder={edit ? 'Дополнительный текст (необязательно; каждая строка — абзац)' : ''}
          />
        </div>
      )}

      <div className="mt-6 font-bold italic" style={{ marginLeft: '-7.6mm' }}>
        Коммерческое предложение действует в течение <InlineInput value={data.validity} onChange={set('validity')} className="font-bold italic" />
      </div>

      {/* подпись — неизменяемая часть бланка */}
      <div className="relative mt-10 flex items-end justify-between" style={{ paddingLeft: '2mm', paddingRight: '10mm' }}>
        <div>
          <div>С уважением,</div>
          <div>Генеральный директор</div>
          <div>АНО «ННЦ фармаконадзора»</div>
        </div>
        <img src={assetUrl('signature.jpg')} alt="Подпись" style={{ width: '33mm', position: 'absolute', left: '82mm', bottom: '2mm' }} />
        <div>А.Е. Крашенинников</div>
      </div>
    </div>
  )
}

function GroupRows({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr]
  const [x] = copy.splice(from, 1)
  copy.splice(to, 0, x)
  return copy
}

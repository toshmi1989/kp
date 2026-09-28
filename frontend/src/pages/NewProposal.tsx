import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, download, formatPrice, priceDisplay } from '../api'
import Paper, { priceChanged } from '../components/Paper'
import type { RegistryPrice } from '../components/Paper'
import ServicePicker from '../components/ServicePicker'
import { Button, Card, Field, Input, errorText, inputCls, useToast } from '../components/ui'
import type { Meta, ProposalData, ProposalItem, ProposalOut, Service, ServiceShort } from '../types'

const DRAFT_KEY = 'kp-draft-v1'

// поля документа, которые подставляются из услуг, пока их не правили руками
const DOC_KEYS = ['section_title', 'intro_text', 'price_header', 'footnotes', 'extra_text'] as const
type DocKey = (typeof DOC_KEYS)[number]

function emptyData(defaults: Record<string, string>): ProposalData {
  return {
    company: '',
    director_full: '',
    director_position: 'Генеральный директор',
    recipient_position: 'Генеральному директору',
    director_short: '',
    greeting: '',
    intro_text: defaults.intro_text ?? '',
    section_title: defaults.section_title ?? '',
    price_header: defaults.price_header ?? '',
    validity: defaults.validity ?? '30 рабочих дней',
    footnotes: '',
    extra_text: '',
    items: [],
  }
}

interface Saved {
  data: ProposalData
  touched: DocKey[]
  registry: Record<number, RegistryPrice>
  gender: string
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

export default function NewProposal({ meta }: { meta: Meta }) {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const saved = useMemo(loadSaved, [])

  const [data, setData] = useState<ProposalData>(saved?.data ?? emptyData(meta.defaults))
  const [touched, setTouched] = useState<Set<DocKey>>(new Set(saved?.touched ?? []))
  const [registry, setRegistry] = useState<Record<number, RegistryPrice>>(saved?.registry ?? {})
  const [gender, setGender] = useState(saved?.gender ?? 'auto')
  const [updatePrices, setUpdatePrices] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<ProposalOut | null>(null)

  // автосохранение черновика в браузере
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, touched: [...touched], registry, gender }))
    } catch {
      /* хранилище недоступно — не страшно */
    }
  }, [data, touched, registry, gender])

  // «создать на основе» из истории
  useEffect(() => {
    const fromId = (location.state as { fromProposal?: number } | null)?.fromProposal
    if (!fromId) return
    navigate('.', { replace: true, state: null })
    api<{ data: ProposalData }>(`/proposals/${fromId}`)
      .then(async ({ data: d }) => {
        setData(d)
        setTouched(new Set(DOC_KEYS))
        setDone(null)
        const reg: Record<number, RegistryPrice> = {}
        await Promise.all(
          d.items
            .filter((i) => i.service_id)
            .map((i) =>
              api<Service>(`/services/${i.service_id}`)
                .then((s) => (reg[s.id] = { price: s.price, price_text: s.price_text, price_unit: s.price_unit }))
                .catch(() => undefined),
            ),
        )
        setRegistry(reg)
        toast(`Загружено КП №${fromId} — внесите изменения и сформируйте новое`)
      })
      .catch((e) => toast(errorText(e), 'error'))
  }, [location.state, navigate, toast])

  // обращение, «кому» и должность в дательном падеже — при изменении ФИО/должности
  const nameReq = useRef(0)
  useEffect(() => {
    const id = ++nameReq.current
    const t = setTimeout(() => {
      const params = new URLSearchParams({ full_name: data.director_full, position: data.director_position })
      if (gender !== 'auto') params.set('gender', gender)
      api<{ director_short: string; greeting: string; recipient_position: string }>(`/name-forms?${params}`)
        .then((f) => {
          if (id !== nameReq.current) return
          setData((d) => ({
            ...d,
            director_short: d.director_full.trim() ? f.director_short : '',
            greeting: d.director_full.trim() ? f.greeting : '',
            recipient_position: f.recipient_position || d.recipient_position,
          }))
        })
        .catch(() => undefined)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.director_full, data.director_position, gender])

  const onPaperChange = useCallback(
    (next: ProposalData) => {
      setTouched((t) => {
        const n = new Set(t)
        DOC_KEYS.forEach((k) => next[k] !== data[k] && n.add(k))
        return n
      })
      setData(next)
    },
    [data],
  )

  const addService = async (s: ServiceShort) => {
    try {
      const ids = [...data.items.map((i) => i.service_id).filter((x): x is number => x != null), s.id]
      const draft = await api<ProposalData>('/proposals/draft', {
        body: { service_ids: ids, company: data.company, director_full: data.director_full, director_position: data.director_position },
      })
      const newItem = draft.items.find((i) => i.service_id === s.id) as ProposalItem
      setData((d) => {
        const next: ProposalData = { ...d, items: [...d.items, newItem] }
        DOC_KEYS.forEach((k) => {
          if (!touched.has(k)) next[k] = draft[k]
        })
        return next
      })
      setRegistry((r) => ({ ...r, [s.id]: { price: s.price, price_text: s.price_text, price_unit: s.price_unit } }))
      setDone(null)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const setItem = (index: number, patch: Partial<ProposalItem>) =>
    setData((d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }))

  const moveItem = (from: number, to: number) =>
    setData((d) => {
      if (to < 0 || to >= d.items.length) return d
      const items = [...d.items]
      const [x] = items.splice(from, 1)
      items.splice(to, 0, x)
      return { ...d, items }
    })

  const removeItem = (index: number) => setData((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))

  const reset = () => {
    if (!confirm('Очистить форму и начать новое КП?')) return
    setData(emptyData(meta.defaults))
    setTouched(new Set())
    setRegistry({})
    setUpdatePrices(new Set())
    setGender('auto')
    setDone(null)
  }

  const problems = useMemo(() => {
    const p: string[] = []
    if (!data.company.trim()) p.push('не указана компания')
    if (!data.director_short.trim()) p.push('не указан адресат')
    if (!data.items.length) p.push('не выбрана услуга')
    data.items.forEach((i, n) => {
      if (i.price === null && !i.price_text.trim() && !i.price_note.trim()) p.push(`у услуги №${n + 1} не указана цена`)
    })
    return p
  }, [data])

  const generate = async () => {
    if (!data.items.length) return toast('Добавьте хотя бы одну услугу', 'error')
    if (problems.length && !confirm(`Обратите внимание: ${problems.join(', ')}.\n\nВсё равно сформировать?`)) return
    setBusy(true)
    try {
      const upd = data.items
        .map((i) => i.service_id)
        .filter((id): id is number => id != null && updatePrices.has(id))
      const p = await api<ProposalOut>('/proposals', { body: { data, update_registry_prices: upd } })
      await download(`/proposals/${p.id}/docx`, `КП №${p.id}.docx`)
      if (upd.length) {
        setRegistry((r) => {
          const n = { ...r }
          data.items.forEach((i) => {
            if (i.service_id && upd.includes(i.service_id)) n[i.service_id] = { price: i.price, price_text: i.price_text, price_unit: i.price_unit }
          })
          return n
        })
        setUpdatePrices(new Set())
      }
      setDone(p)
      toast(`КП №${p.id} сформировано${upd.length ? ', цены в реестре обновлены' : ''}`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* ---------- панель параметров */}
      <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:w-[380px] lg:overflow-y-auto lg:pb-4">
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">1. Кому</h2>
            <button className="text-xs text-slate-400 hover:text-slate-700" onClick={reset}>
              Очистить всё
            </button>
          </div>
          <Field label="Компания">
            <Input value={data.company} onChange={(e) => setData({ ...data, company: e.target.value })} placeholder="ООО «Компания»" />
          </Field>
          <Field label="ФИО руководителя" hint="Полностью, в именительном падеже — склонение и обращение подставятся сами">
            <Input value={data.director_full} onChange={(e) => setData({ ...data, director_full: e.target.value })} placeholder="Иванов Иван Иванович" />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Должность">
              <Input value={data.director_position} onChange={(e) => setData({ ...data, director_position: e.target.value })} list="positions" />
              <datalist id="positions">
                <option value="Генеральный директор" />
                <option value="Директор" />
                <option value="Исполнительный директор" />
                <option value="Коммерческий директор" />
                <option value="Президент" />
              </datalist>
            </Field>
            <Field label="Обращение">
              <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="auto">авто</option>
                <option value="m">Уважаемый</option>
                <option value="f">Уважаемая</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">2. Услуги</h2>
          <ServicePicker onSelect={addService} excludeIds={data.items.map((i) => i.service_id).filter((x): x is number => x != null)} />
          {data.items.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.items.map((it, i) => {
                const changed = it.service_id != null && priceChanged(it, registry[it.service_id])
                return (
                  <li key={i} className="p-2.5 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-xs text-slate-400">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-snug">{it.name || '(без названия)'}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {priceDisplay(it.price, it.price_text, it.price_unit) || 'цена не указана'}
                          {it.stages.length > 0 && ` · этапов: ${it.stages.length}`}
                        </div>
                        {changed && (
                          <label className="mt-1.5 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            <input
                              type="checkbox"
                              checked={updatePrices.has(it.service_id!)}
                              onChange={(e) => {
                                const n = new Set(updatePrices)
                                if (e.target.checked) n.add(it.service_id!)
                                else n.delete(it.service_id!)
                                setUpdatePrices(n)
                              }}
                            />
                            Обновить цену в реестре (было: {registry[it.service_id!].price_text || formatPrice(registry[it.service_id!].price) || '—'})
                          </label>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center text-slate-400">
                        <button className="rounded px-1 hover:bg-slate-100 hover:text-slate-700" title="Выше" onClick={() => moveItem(i, i - 1)}>
                          ↑
                        </button>
                        <button className="rounded px-1 hover:bg-slate-100 hover:text-slate-700" title="Ниже" onClick={() => moveItem(i, i + 1)}>
                          ↓
                        </button>
                        <button className="rounded px-1 hover:bg-slate-100 hover:text-slate-700" title="Настройки" onClick={() => setExpanded(expanded === i ? null : i)}>
                          ⚙
                        </button>
                        <button className="rounded px-1 hover:bg-red-50 hover:text-red-600" title="Убрать" onClick={() => removeItem(i)}>
                          ✕
                        </button>
                      </div>
                    </div>
                    {expanded === i && (
                      <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-2.5">
                        <Field label="Строка-группа в таблице">
                          <Input value={it.table_group} onChange={(e) => setItem(i, { table_group: e.target.value })} placeholder="напр. МОДУЛЬ 1. АДМИНИСТРАТИВНАЯ ИНФОРМАЦИЯ" />
                        </Field>
                        <Field label="Цена текстом" hint="Вместо числа — например «по запросу» или «от 500 000»">
                          <Input value={it.price_text} onChange={(e) => setItem(i, { price_text: e.target.value })} />
                        </Field>
                        <Field label="Примечание под таблицей">
                          <Input value={it.price_note} onChange={(e) => setItem(i, { price_note: e.target.value })} placeholder="Итоговая стоимость согласуется…" />
                        </Field>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={it.show_stages}
                            onChange={(e) =>
                              setItem(i, {
                                show_stages: e.target.checked,
                                stages_title: it.stages_title || `${it.name} состоит из следующих этапов:`,
                              })
                            }
                          />
                          Показывать детализацию (этапы и сроки)
                        </label>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-slate-400">Всё в документе справа можно править прямо на листе — щёлкните по тексту.</p>
        </Card>

        <Card className="space-y-2 p-4">
          <Button variant="primary" className="w-full py-2.5" onClick={generate} disabled={busy || !data.items.length}>
            {busy ? 'Формирую…' : 'Сформировать КП (Word)'}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={!data.items.length}
            onClick={() => download('/proposals/preview-docx', 'КП (черновик).docx', data).catch((e) => toast(errorText(e), 'error'))}
          >
            Скачать черновик без сохранения
          </Button>
          {done && (
            <div className="rounded-md bg-brand-50 p-2.5 text-sm text-brand-800">
              КП №{done.id} сохранено в истории.{' '}
              <button className="underline" onClick={() => download(`/proposals/${done.id}/docx`, `КП №${done.id}.docx`)}>
                Скачать ещё раз
              </button>
            </div>
          )}
        </Card>
      </aside>

      {/* ---------- лист КП */}
      <section className="min-w-0 flex-1 overflow-x-auto pb-10">
        <Paper data={data} onChange={onPaperChange} priceUnits={meta.price_units} registry={registry} />
      </section>
    </div>
  )
}

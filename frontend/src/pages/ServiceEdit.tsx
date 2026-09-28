import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, formatPrice, parsePrice } from '../api'
import Paper from '../components/Paper'
import { Button, Card, Field, Input, Modal, Textarea, errorText, useToast } from '../components/ui'
import type { Meta, ProposalData, Service, ServiceFields, Stage } from '../types'

function emptyService(d: Record<string, string>): ServiceFields & { stages: Stage[] } {
  return {
    name: '',
    category: '',
    keywords: '',
    table_group: '',
    description: '',
    duration_label: d.duration_label ?? 'Срок выполнения работ:',
    duration_text: '',
    price: null,
    price_text: '',
    price_unit: d.price_unit ?? 'единовременно',
    price_note: '',
    section_title: '',
    intro_text: '',
    price_header: '',
    stages_title: '',
    stages_name_header: d.stages_name_header ?? 'Перечень оказываемых услуг',
    stages_duration_header: d.stages_duration_header ?? 'Срок, рабочие дни',
    footnotes: '',
    extra_text: '',
    active: true,
    stages: [],
  }
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  )
}

export default function ServiceEdit({ meta, reloadMeta }: { meta: Meta; reloadMeta: () => void }) {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const toast = useToast()
  const [s, setS] = useState<ServiceFields & { stages: Stage[] }>(emptyService(meta.defaults))
  const [priceRaw, setPriceRaw] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (isNew) return
    api<Service>(`/services/${id}`)
      .then((svc) => {
        setS({ ...svc, stages: svc.stages.map((x) => ({ name: x.name, duration: x.duration })) })
        setPriceRaw(svc.price === null ? '' : formatPrice(svc.price))
        setShowAdvanced(!!(svc.section_title || svc.intro_text || svc.price_header || svc.extra_text))
      })
      .catch((e) => toast(errorText(e), 'error'))
  }, [id, isNew, toast])

  const upd = (patch: Partial<ServiceFields & { stages: Stage[] }>) => {
    setS((x) => ({ ...x, ...patch }))
    setDirty(true)
  }
  const field = (key: keyof ServiceFields) => ({
    value: (s[key] as string) ?? '',
    onChange: (e: { target: { value: string } }) => upd({ [key]: e.target.value }),
  })
  const setStage = (i: number, patch: Partial<Stage>) => upd({ stages: s.stages.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
  const moveStage = (from: number, to: number) => {
    if (to < 0 || to >= s.stages.length) return
    const st = [...s.stages]
    const [x] = st.splice(from, 1)
    st.splice(to, 0, x)
    upd({ stages: st })
  }

  const save = async () => {
    if (!s.name.trim()) return toast('Укажите название услуги', 'error')
    setSaving(true)
    try {
      const body = { ...s, stages: s.stages.filter((x) => x.name.trim()) }
      const res = isNew ? await api<Service>('/services', { body }) : await api<Service>(`/services/${id}`, { method: 'PUT', body })
      setDirty(false)
      reloadMeta()
      toast('Услуга сохранена')
      if (isNew) navigate(`/registry/${res.id}`, { replace: true })
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Удалить услугу «${s.name}» из реестра? Уже сформированные КП не изменятся.`)) return
    await api(`/services/${id}`, { method: 'DELETE' })
    toast('Услуга удалена')
    navigate('/registry')
  }

  const copy = async () => {
    const res = await api<Service>(`/services/${id}/copy`, { body: {} })
    toast('Создана копия')
    navigate(`/registry/${res.id}`)
  }

  const applyPaste = () => {
    const rows = pasteText
      .split(/\r?\n/)
      .map((l) => l.split('\t').map((c) => c.trim()))
      .filter((c) => c.some(Boolean))
      .map((c) => {
        // допускаем колонку с номером этапа в начале
        const cells = c.length >= 3 && /^\d+\.?$/.test(c[0]) ? c.slice(1) : c
        return { name: cells[0] ?? '', duration: cells[1] ?? '' }
      })
    upd({ stages: [...s.stages, ...rows] })
    setPasteText('')
    setPasteOpen(false)
    toast(`Добавлено этапов: ${rows.length}`)
  }

  // как услуга будет выглядеть в КП
  const preview: ProposalData = useMemo(
    () => ({
      company: 'ООО «Компания»',
      director_full: '',
      director_position: '',
      recipient_position: 'Генеральному директору',
      director_short: 'Иванову И.И.',
      greeting: 'Уважаемый Иван Иванович!',
      intro_text: s.intro_text || meta.defaults.intro_text,
      section_title: s.section_title || s.name.toUpperCase(),
      price_header: s.price_header || meta.defaults.price_header,
      validity: meta.defaults.validity,
      footnotes: s.footnotes,
      extra_text: s.extra_text,
      items: [
        {
          service_id: null,
          name: s.name,
          table_group: s.table_group,
          description: s.description,
          duration_label: s.duration_label,
          duration_text: s.duration_text,
          price: s.price,
          price_text: s.price_text,
          price_unit: s.price_unit,
          price_note: s.price_note,
          show_stages: s.stages.length > 0,
          stages_title: s.stages_title || `${s.name} состоит из следующих этапов:`,
          stages_name_header: s.stages_name_header,
          stages_duration_header: s.stages_duration_header,
          stages: s.stages,
        },
      ],
    }),
    [s, meta.defaults],
  )

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button className="text-sm text-slate-500 hover:text-slate-800" onClick={() => (!dirty || confirm('Есть несохранённые изменения. Уйти?')) && navigate('/registry')}>
          ← Реестр
        </button>
        <h1 className="flex-1 truncate text-xl font-semibold">{isNew ? 'Новая услуга' : s.name || 'Услуга'}</h1>
        {!isNew && (
          <>
            <Button onClick={copy}>Копировать</Button>
            <Button variant="danger" onClick={remove}>
              Удалить
            </Button>
          </>
        )}
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Сохраняю…' : dirty || isNew ? 'Сохранить' : 'Сохранено'}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <Section
            title="Основное"
            aside={
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.active} onChange={(e) => upd({ active: e.target.checked })} />
                Предлагать в КП
              </label>
            }
          >
            <Field label="Название услуги *">
              <Textarea rows={2} {...field('name')} placeholder="Разработка мастер-файла системы фармаконадзора (МФСФ)" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Категория" hint="Для фильтра в реестре">
                <Input {...field('category')} list="categories" />
                <datalist id="categories">
                  {meta.categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Ключевые слова для поиска" hint="Сокращения, синонимы: МФСФ, ПУР, КЛФ…">
                <Input {...field('keywords')} />
              </Field>
            </div>
          </Section>

          <Section title="Строка в таблице КП">
            <Field label="Описание / состав услуги" hint="Необязательно. Можно в несколько строк; **текст** — жирным">
              <Textarea rows={4} {...field('description')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
              <Field label="Подпись срока">
                <Input {...field('duration_label')} list="duration-labels" />
                <datalist id="duration-labels">
                  <option value="Срок выполнения работ:" />
                  <option value="Сроки выполнения работ:" />
                  <option value="Срок подготовки:" />
                </datalist>
              </Field>
              <Field label="Срок">
                <Input {...field('duration_text')} placeholder="20 рабочих дней с момента предоставления материалов от Заказчика." />
              </Field>
            </div>
            <Field label="Строка-группа над услугой" hint="Необязательно. Зелёная строка в таблице, напр. «МОДУЛЬ 1. АДМИНИСТРАТИВНАЯ ИНФОРМАЦИЯ»">
              <Input {...field('table_group')} list="groups" />
              <datalist id="groups">
                {meta.table_groups.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </Section>

          <Section title="Цена">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Цена, руб.">
                <Input
                  value={priceRaw}
                  inputMode="decimal"
                  placeholder="150 000"
                  onChange={(e) => {
                    setPriceRaw(e.target.value)
                    upd({ price: parsePrice(e.target.value) })
                  }}
                  onBlur={() => setPriceRaw(s.price === null ? '' : formatPrice(s.price))}
                />
              </Field>
              <Field label="Единица">
                <Input {...field('price_unit')} list="units" />
                <datalist id="units">
                  {meta.price_units.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </Field>
              <Field label="Цена текстом" hint="Вместо числа: «по запросу», «от 500 000»">
                <Input {...field('price_text')} />
              </Field>
            </div>
            <Field label="Примечание под таблицей">
              <Input {...field('price_note')} placeholder="Итоговая стоимость согласуется после аудита досье и выбранных блоков" />
            </Field>
          </Section>

          <Section
            title={`Детализация: этапы и сроки${s.stages.length ? ` (${s.stages.length})` : ''}`}
            aside={
              <div className="flex gap-2">
                <Button onClick={() => setPasteOpen(true)}>Вставить из Excel</Button>
                <Button onClick={() => upd({ stages: [...s.stages, { name: '', duration: '' }] })}>+ Этап</Button>
              </div>
            }
          >
            {s.stages.length === 0 ? (
              <p className="text-sm text-slate-400">Этапов нет — КП будет без таблицы детализации. Добавьте этапы, если услуге нужна детализация.</p>
            ) : (
              <>
                <Field label="Заголовок над таблицей этапов">
                  <Input {...field('stages_title')} placeholder={`${s.name || 'Услуга'} состоит из следующих этапов:`} />
                </Field>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-200/60 text-left text-xs text-slate-700">
                      <tr>
                        <th className="w-10 px-2 py-2 text-center">№</th>
                        <th className="px-2 py-1">
                          <input className="w-full bg-transparent font-semibold outline-none" {...field('stages_name_header')} />
                        </th>
                        <th className="w-44 px-2 py-1">
                          <input className="w-full bg-transparent font-semibold outline-none" {...field('stages_duration_header')} />
                        </th>
                        <th className="w-24" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {s.stages.map((st, i) => (
                        <tr key={i}>
                          <td className="px-2 text-center text-slate-400">{i + 1}.</td>
                          <td className="px-1 py-1">
                            <textarea
                              rows={1}
                              className="w-full resize-y rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-brand-500 focus:outline-none"
                              value={st.name}
                              placeholder="Название этапа"
                              onChange={(e) => setStage(i, { name: e.target.value })}
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              className="w-full rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-brand-500 focus:outline-none"
                              value={st.duration}
                              placeholder="10 р.д."
                              onChange={(e) => setStage(i, { duration: e.target.value })}
                            />
                          </td>
                          <td className="whitespace-nowrap px-1 text-right text-slate-400">
                            <button className="rounded px-1.5 hover:bg-slate-100 hover:text-slate-700" onClick={() => moveStage(i, i - 1)} title="Выше">
                              ↑
                            </button>
                            <button className="rounded px-1.5 hover:bg-slate-100 hover:text-slate-700" onClick={() => moveStage(i, i + 1)} title="Ниже">
                              ↓
                            </button>
                            <button className="rounded px-1.5 hover:bg-red-50 hover:text-red-600" onClick={() => upd({ stages: s.stages.filter((_, k) => k !== i) })} title="Удалить">
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <Field label="Сноски" hint="Каждая строка — отдельная сноска под таблицами (*При необходимости)">
              <Textarea rows={2} {...field('footnotes')} />
            </Field>
          </Section>

          <Card className="p-5">
            <button className="flex w-full items-center justify-between font-semibold" onClick={() => setShowAdvanced(!showAdvanced)}>
              Особые тексты КП для этой услуги
              <span className="text-slate-400">{showAdvanced ? '−' : '+'}</span>
            </button>
            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-500">Заполняйте, только если у этой услуги формулировки отличаются от стандартных. Пустое поле — стандартный текст.</p>
                <Field label="Заголовок раздела над таблицей" hint="Стандартно для одной услуги — её название заглавными буквами">
                  <Input {...field('section_title')} placeholder={s.name.toUpperCase() || meta.defaults.section_title} />
                </Field>
                <Field label="Вводный абзац">
                  <Textarea rows={3} {...field('intro_text')} placeholder={meta.defaults.intro_text} />
                </Field>
                <Field label="Заголовок колонки цены">
                  <Input {...field('price_header')} placeholder={meta.defaults.price_header} />
                </Field>
                <Field label="Дополнительный текст после таблиц" hint="Каждая строка — отдельный абзац (например, условия договора)">
                  <Textarea rows={3} {...field('extra_text')} />
                </Field>
              </div>
            )}
          </Card>
        </div>

        <div className="hidden xl:block">
          <div className="sticky top-20">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Как будет выглядеть в КП</div>
            <div className="h-[calc(100vh-8rem)] overflow-y-auto rounded-lg">
              <div style={{ zoom: 0.72 }}>
                <Paper data={preview} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Вставить этапы из Excel или Word" wide>
        <p className="mb-2 text-sm text-slate-500">
          Скопируйте строки таблицы (колонки: <b>этап</b> и <b>срок</b>; колонка с номером в начале допускается) и вставьте сюда.
        </p>
        <Textarea rows={10} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'Аудит имеющейся документации досье.\t10 р.д.\nРазработка ПУР\t30 р.д.'} />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setPasteOpen(false)}>Отмена</Button>
          <Button variant="primary" onClick={applyPaste} disabled={!pasteText.trim()}>
            Добавить этапы
          </Button>
        </div>
      </Modal>
    </div>
  )
}

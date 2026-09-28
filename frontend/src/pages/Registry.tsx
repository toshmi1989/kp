import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, download, priceDisplay, upload } from '../api'
import { Button, Card, Input, Modal, errorText, inputCls, useToast } from '../components/ui'
import type { Meta, ServiceShort } from '../types'

interface ImportReport {
  created: number
  updated: number
  stages_services: number
  errors: string[]
}

export default function Registry({ meta, reloadMeta }: { meta: Meta; reloadMeta: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState<ServiceShort[]>([])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ImportReport | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    api<ServiceShort[]>('/services')
      .then(setItems)
      .catch((e) => toast(errorText(e), 'error'))
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().replace(/ё/g, 'е')
    return items.filter(
      (s) => (!category || s.category === category) && (!ql || `${s.name} ${s.category}`.toLowerCase().replace(/ё/g, 'е').includes(ql)),
    )
  }, [items, q, category])

  const onImport = async (file: File) => {
    try {
      const r = await upload<ImportReport>('/registry/import', file)
      setReport(r)
      load()
      reloadMeta()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Реестр услуг</h1>
          <p className="text-sm text-slate-500">Цены, описания и детализация — отсюда берутся данные для КП.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => download('/registry/template', 'Шаблон реестра услуг.xlsx')}>Шаблон Excel</Button>
          <Button onClick={() => download('/registry/export', 'Реестр услуг.xlsx')}>Экспорт в Excel</Button>
          <Button onClick={() => fileRef.current?.click()}>Импорт из Excel</Button>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          <Button variant="primary" onClick={() => navigate('/registry/new')}>
            + Новая услуга
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Input className="max-w-sm" placeholder="Поиск по названию…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={`${inputCls} max-w-xs`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Все категории</option>
            {meta.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="ml-auto self-center text-sm text-slate-400">
            {filtered.length} из {items.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Услуга</th>
                <th className="px-4 py-2.5">Категория</th>
                <th className="px-4 py-2.5">Цена</th>
                <th className="px-4 py-2.5 text-center">Этапы</th>
                <th className="px-4 py-2.5">Обновлено</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className={`cursor-pointer hover:bg-brand-50/50 ${s.active ? '' : 'text-slate-400'}`} onClick={() => navigate(`/registry/${s.id}`)}>
                  <td className="px-4 py-2.5">
                    <Link to={`/registry/${s.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {s.name}
                    </Link>
                    {!s.active && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">скрыта</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{s.category}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{priceDisplay(s.price, s.price_text, s.price_unit) || <span className="text-amber-600">не указана</span>}</td>
                  <td className="px-4 py-2.5 text-center">{s.stages_count || ''}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">{s.updated_at ? new Date(s.updated_at).toLocaleDateString('ru-RU') : ''}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    {items.length ? 'Ничего не найдено' : 'Реестр пуст — добавьте услугу вручную или импортируйте из Excel (скачайте шаблон)'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!report} onClose={() => setReport(null)} title="Импорт завершён">
        {report && (
          <div className="space-y-2 text-sm">
            <p>Добавлено услуг: <b>{report.created}</b></p>
            <p>Обновлено услуг: <b>{report.updated}</b></p>
            <p>Обновлена детализация у услуг: <b>{report.stages_services}</b></p>
            {report.errors.length > 0 && (
              <div className="rounded-md bg-amber-50 p-3 text-amber-800">
                <p className="mb-1 font-medium">Пропущены строки ({report.errors.length}):</p>
                <ul className="max-h-48 list-disc overflow-y-auto pl-5">
                  {report.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pt-2 text-right">
              <Button variant="primary" onClick={() => setReport(null)}>
                Готово
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

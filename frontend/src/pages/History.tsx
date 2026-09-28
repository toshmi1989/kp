import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, download } from '../api'
import { Button, Card, Input, errorText, useToast } from '../components/ui'
import type { ProposalOut } from '../types'

export default function History() {
  const toast = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState<ProposalOut[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      api<ProposalOut[]>(`/proposals?q=${encodeURIComponent(q)}`)
        .then(setItems)
        .catch((e) => toast(errorText(e), 'error'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q, toast])

  const remove = async (p: ProposalOut) => {
    if (!confirm(`Удалить КП №${p.id} для «${p.company}» из истории?`)) return
    await api(`/proposals/${p.id}`, { method: 'DELETE' })
    setItems((x) => x.filter((i) => i.id !== p.id))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">История КП</h1>
        <p className="text-sm text-slate-500">Все сформированные предложения. Файл хранится в том виде, в каком был выдан.</p>
      </div>
      <Card>
        <div className="border-b border-slate-100 p-3">
          <Input className="max-w-sm" placeholder="Поиск: компания, ФИО, услуга, автор…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">№</th>
                <th className="px-4 py-2.5">Дата</th>
                <th className="px-4 py-2.5">Компания</th>
                <th className="px-4 py-2.5">Услуги</th>
                <th className="px-4 py-2.5">Автор</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-3 text-slate-400">{p.id}</td>
                  <td className="whitespace-nowrap px-4 py-3">{new Date(p.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.company || '—'}</div>
                    <div className="text-xs text-slate-500">{p.director_full}</div>
                  </td>
                  <td className="max-w-md px-4 py-3 text-slate-600">{p.services_summary}</td>
                  <td className="px-4 py-3 text-slate-500">{p.author}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => download(`/proposals/${p.id}/docx`, `КП №${p.id}.docx`).catch((e) => toast(errorText(e), 'error'))}>Скачать</Button>
                      <Button onClick={() => navigate('/', { state: { fromProposal: p.id } })} title="Открыть копию для редактирования">
                        На основе
                      </Button>
                      <Button variant="ghost" onClick={() => remove(p)} title="Удалить">
                        ✕
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {q ? 'Ничего не найдено' : 'Пока нет сформированных КП'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

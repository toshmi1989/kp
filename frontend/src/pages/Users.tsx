import { useEffect, useState } from 'react'
import { api } from '../api'
import { Button, Card, Field, Input, Modal, errorText, useToast } from '../components/ui'
import type { User } from '../types'

interface Form {
  id?: number
  username: string
  full_name: string
  password: string
  is_admin: boolean
}

export default function Users({ me }: { me: User }) {
  const toast = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState<Form | null>(null)

  const load = () => api<User[]>('/users').then(setUsers).catch((e) => toast(errorText(e), 'error'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), [])

  const save = async () => {
    if (!form) return
    try {
      const body = { ...form, password: form.password || null }
      if (form.id) await api(`/users/${form.id}`, { method: 'PUT', body })
      else await api('/users', { body })
      setForm(null)
      load()
      toast('Сохранено')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const remove = async (u: User) => {
    if (!confirm(`Удалить пользователя ${u.username}?`)) return
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Пользователи</h1>
        <Button variant="primary" onClick={() => setForm({ username: '', full_name: '', password: '', is_admin: false })}>
          + Добавить
        </Button>
      </div>
      <Card>
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <div className="font-medium">
                  {u.full_name || u.username}
                  {u.is_admin && <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-xs text-brand-800">администратор</span>}
                </div>
                <div className="text-sm text-slate-500">логин: {u.username}</div>
              </div>
              <Button onClick={() => setForm({ ...u, password: '' })}>Изменить</Button>
              {u.id !== me.id && (
                <Button variant="ghost" onClick={() => remove(u)}>
                  ✕
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Изменить пользователя' : 'Новый пользователь'}>
        {form && (
          <div className="space-y-3">
            <Field label="Логин">
              <Input value={form.username} disabled={!!form.id} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="ФИО" hint="Показывается в истории как автор КП">
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label={form.id ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль'}>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
              Администратор (управляет пользователями)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setForm(null)}>Отмена</Button>
              <Button variant="primary" onClick={save}>
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

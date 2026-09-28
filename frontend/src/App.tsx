import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api, assetUrl, setUnauthorizedHandler } from './api'
import { Button, Field, Input, Modal, ToastProvider, errorText, useToast } from './components/ui'
import History from './pages/History'
import NewProposal from './pages/NewProposal'
import Registry from './pages/Registry'
import ServiceEdit from './pages/ServiceEdit'
import Users from './pages/Users'
import type { Meta, User } from './types'

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      onLogin(await api<User>('/login', { body: { username, password } }))
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <img src={assetUrl('logo.jpg')} alt="" className="mx-auto mb-3 h-20" />
          <h1 className="text-lg font-semibold">Генератор коммерческих предложений</h1>
        </div>
        <Field label="Логин">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </Field>
        <Field label="Пароль">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" variant="primary" className="w-full">
          Войти
        </Button>
      </form>
    </div>
  )
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [oldP, setOldP] = useState('')
  const [newP, setNewP] = useState('')
  const save = async () => {
    try {
      await api('/me/password', { body: { old_password: oldP, new_password: newP } })
      toast('Пароль изменён')
      setOldP('')
      setNewP('')
      onClose()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Смена пароля">
      <div className="space-y-3">
        <Field label="Текущий пароль">
          <Input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} />
        </Field>
        <Field label="Новый пароль" hint="Минимум 6 символов">
          <Input type="password" value={newP} onChange={(e) => setNewP(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={save}>
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`

function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const reloadMeta = useCallback(() => {
    api<Meta>('/meta').then(setMeta).catch(() => undefined)
  }, [])
  useEffect(reloadMeta, [reloadMeta])

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-4 py-2.5">
          <img src={assetUrl('logo.jpg')} alt="" className="h-9" />
          <span className="mr-4 hidden font-semibold text-slate-700 sm:inline">Генератор КП</span>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/" end className={navCls}>
              Новое КП
            </NavLink>
            <NavLink to="/registry" className={navCls}>
              Реестр услуг
            </NavLink>
            <NavLink to="/history" className={navCls}>
              История
            </NavLink>
            {user.is_admin && (
              <NavLink to="/users" className={navCls}>
                Пользователи
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <button className="text-slate-600 hover:text-slate-900" onClick={() => setPwOpen(true)} title="Сменить пароль">
              {user.full_name || user.username}
            </button>
            <Button variant="ghost" onClick={onLogout}>
              Выйти
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-6">
        {meta && (
          <Routes>
            <Route path="/" element={<NewProposal meta={meta} />} />
            <Route path="/registry" element={<Registry meta={meta} reloadMeta={reloadMeta} />} />
            <Route path="/registry/:id" element={<ServiceEdit meta={meta} reloadMeta={reloadMeta} />} />
            <Route path="/history" element={<History />} />
            {user.is_admin && <Route path="/users" element={<Users me={user} />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    api<User>('/me')
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  const logout = async () => {
    await api('/logout', { body: {} }).catch(() => undefined)
    setUser(null)
  }

  return (
    <ToastProvider>
      <BrowserRouter basename={(import.meta.env.BASE_URL || '/').replace(/\/$/, '') || undefined}>
        {user === undefined ? null : user === null ? <Login onLogin={setUser} /> : <Shell user={user} onLogout={logout} />}
      </BrowserRouter>
    </ToastProvider>
  )
}

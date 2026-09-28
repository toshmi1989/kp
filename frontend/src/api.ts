export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

async function handle(res: Response) {
  if (res.ok) return res
  let msg = `Ошибка ${res.status}`
  try {
    const body = await res.json()
    if (typeof body.detail === 'string') msg = body.detail
    else if (Array.isArray(body.detail)) msg = body.detail.map((d: { msg: string }) => d.msg).join('; ')
  } catch {
    /* не JSON */
  }
  if (res.status === 401 && onUnauthorized) onUnauthorized()
  throw new ApiError(res.status, msg)
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  })
  await handle(res)
  return res.json() as Promise<T>
}

export async function upload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`/api${path}`, { method: 'POST', body: fd, credentials: 'same-origin' })
  await handle(res)
  return res.json() as Promise<T>
}

function filenameFrom(res: Response, fallback: string) {
  const cd = res.headers.get('Content-Disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  return m ? decodeURIComponent(m[1]) : fallback
}

/** Скачать файл (GET или POST с JSON) и сохранить у пользователя. */
export async function download(path: string, fallbackName: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  await handle(res)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filenameFrom(res, fallbackName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 150000 -> «150 000», как в документе. */
export function formatPrice(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  const int = Number.isInteger(n)
  return n
    .toLocaleString('ru-RU', { minimumFractionDigits: int ? 0 : 2, maximumFractionDigits: 2 })
    .replace(/\s/g, ' ')
}

export function parsePrice(s: string): string | null {
  const clean = s.replace(/[\s ₽]/g, '').replace(/руб\.?/i, '').replace(',', '.')
  if (!clean) return null
  const n = Number(clean)
  return Number.isNaN(n) ? null : String(n)
}

export function priceDisplay(price: string | null, priceText: string, unit: string) {
  const main = priceText.trim() || formatPrice(price)
  const u = unit.trim()
  if (main && u) return `${main} / ${u}`
  return main || u
}

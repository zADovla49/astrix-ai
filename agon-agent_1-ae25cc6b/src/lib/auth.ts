const TOKEN = 'astrix.token'
const CRED = 'astrix.cred'
export const BASE = '/api/astrix'

export const getToken = () => localStorage.getItem(TOKEN) ?? sessionStorage.getItem(TOKEN)
export function setToken(t: string, remember: boolean) {
  localStorage.removeItem(TOKEN)
  sessionStorage.removeItem(TOKEN)
  ;(remember ? localStorage : sessionStorage).setItem(TOKEN, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN)
  sessionStorage.removeItem(TOKEN)
}
export const getCred = () => localStorage.getItem(CRED)
export const setCred = (c: string) => localStorage.setItem(CRED, c)
export const clearCred = () => localStorage.removeItem(CRED)

export async function login(password: string, remember: boolean) {
  let r: Response
  try {
    r = await fetch(`${BASE}?r=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, remember, cred: getCred() || undefined }),
    })
  } catch {
    throw new Error('Cannot reach the server. Check your connection.')
  }
  const j = await r.json().catch(() => null)
  if (!j) throw new Error(`The ASTRIX backend did not respond correctly (HTTP ${r.status}). The /api function must be deployed with the site.`)
  if (!r.ok) throw new Error(j.error || 'Login failed')
  setToken(j.token, remember)
}

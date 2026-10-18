/* ASTRIX AI — secure backend (Vercel Node function).
 *
 * Single entrypoint: /api/astrix?r=<route>
 *   health   GET   public
 *   login    POST  public     { password, cred?, remember? }
 *   config   GET   auth       capabilities of this deployment
 *   change   POST  auth       { current, next, cred? }
 *   reset    POST  auth       { current, cred? }
 *   chat     POST  auth       streams Server-Sent Events (AI + web search + link reading)
 *   title    POST  auth       { userText, assistantText }
 *   memory   POST  auth       { userText, assistantText, existing[] }
 *   read     POST  auth       { url }  (link / video / public social analysis)
 *
 * All provider keys stay in server environment variables and never reach the browser.
 */
import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Req = any
type Res = any

// ───────────────────────────── config ─────────────────────────────
const DEFAULT_PASSWORD = process.env.ASTRIX_PASSWORD || 'Astrixisbest'
const SECRET =
  process.env.AUTH_SECRET ||
  crypto.createHash('sha256').update('astrix-ai::signing::v1::' + DEFAULT_PASSWORD).digest('hex')

const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

interface ModelDef { id: string; label: string; vision: boolean }
interface Provider {
  id: string
  name: string
  baseUrl: string
  key?: string
  models: ModelDef[]
  headers?: Record<string, string>
}

function buildProviders(): Provider[] {
  const env = process.env
  const list: Provider[] = []
  const pick = (v: string | undefined, d: string) => (v && v.trim()) || d

  if (env.OPENAI_API_KEY)
    list.push({
      id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', key: env.OPENAI_API_KEY,
      models: [
        { id: pick(env.OPENAI_MODEL, 'gpt-4o'), label: pick(env.OPENAI_MODEL, 'GPT-4o'), vision: true },
        { id: 'gpt-4o-mini', label: 'GPT-4o mini', vision: true },
        { id: 'gpt-4.1', label: 'GPT-4.1', vision: true },
        { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', vision: true },
      ],
    })
  if (env.ANTHROPIC_API_KEY)
    list.push({
      id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', key: env.ANTHROPIC_API_KEY,
      models: [
        { id: pick(env.ANTHROPIC_MODEL, 'claude-sonnet-4-5'), label: pick(env.ANTHROPIC_MODEL, 'Claude Sonnet 4.5'), vision: true },
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', vision: true },
        { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', vision: true },
      ],
    })
  if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)
    list.push({
      id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      key: env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
      models: [
        { id: pick(env.GEMINI_MODEL, 'gemini-2.5-flash'), label: pick(env.GEMINI_MODEL, 'Gemini 2.5 Flash'), vision: true },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true },
        { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', vision: true },
      ],
    })
  if (env.GROQ_API_KEY)
    list.push({
      id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', key: env.GROQ_API_KEY,
      models: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', vision: false },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout (vision)', vision: true },
      ],
    })
  if (env.OPENROUTER_API_KEY)
    list.push({
      id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', key: env.OPENROUTER_API_KEY,
      models: [
        { id: pick(env.OPENROUTER_MODEL, 'openai/gpt-4o-mini'), label: pick(env.OPENROUTER_MODEL, 'GPT-4o mini'), vision: true },
        { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', vision: true },
        { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', vision: true },
      ],
    })
  if (env.AI_API_KEY && env.AI_BASE_URL)
    list.push({
      id: 'custom', name: 'Custom (OpenAI-compatible)', baseUrl: env.AI_BASE_URL.replace(/\/+$/, ''), key: env.AI_API_KEY,
      models: [{ id: pick(env.AI_MODEL, 'default'), label: pick(env.AI_MODEL, 'Custom model'), vision: env.AI_VISION === 'true' }],
    })

  // Keyless fallback so the assistant is alive out-of-the-box.
  list.push({
    id: 'pollinations', name: 'Pollinations (free, no key)', baseUrl: 'https://text.pollinations.ai/openai',
    models: [{ id: 'openai-fast', label: 'GPT-OSS 20B (free)', vision: false }],
  })
  return list
}

function resolveModel(sel?: string): { provider: Provider; model: ModelDef } {
  const providers = buildProviders()
  if (sel && sel.includes('::')) {
    const [pid, ...rest] = sel.split('::')
    const mid = rest.join('::')
    const p = providers.find((x) => x.id === pid)
    if (p) {
      const m = p.models.find((x) => x.id === mid)
      if (m) return { provider: p, model: m }
    }
  }
  return { provider: providers[0], model: providers[0].models[0] }
}

// ───────────────────────────── crypto / auth ─────────────────────────────
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')
function sign(payload: Record<string, unknown>): string {
  const body = b64u(JSON.stringify(payload))
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${mac}`
}
function unsign(token: unknown): any | null {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, mac] = token.split('.')
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  const a = Buffer.from(mac || ''), b = Buffer.from(expect)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (p.exp && Date.now() > p.exp) return null
    return p
  } catch { return null }
}
const sha = (s: string) => crypto.createHash('sha256').update(s).digest()
function safeEq(a: string, b: string) { return crypto.timingSafeEqual(sha(a), sha(b)) }

function makeCred(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return sign({ t: 'cred', salt: salt.toString('hex'), hash: hash.toString('hex'), at: Date.now() })
}
function checkCred(cred: any, password: string): boolean {
  const hash = crypto.scryptSync(password, Buffer.from(cred.salt, 'hex'), 64)
  return crypto.timingSafeEqual(hash, Buffer.from(cred.hash, 'hex'))
}

// Optional Postgres: when DATABASE_URL is set the changed password lives server-side (works across devices).
let pool: any = null
async function db() {
  if (!process.env.DATABASE_URL) return null
  if (!pool) {
    // @ts-ignore - pg ships without bundled types in this project
    const pg: any = await import('pg')
    const Pool = pg.Pool || pg.default?.Pool
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
      max: 2,
    })
    await pool.query('CREATE TABLE IF NOT EXISTS astrix_kv (k text PRIMARY KEY, v text NOT NULL)')
  }
  return pool
}
async function dbGet(k: string): Promise<string | null> {
  const p = await db(); if (!p) return null
  const r = await p.query('SELECT v FROM astrix_kv WHERE k=$1', [k])
  return r.rows[0]?.v ?? null
}
async function dbSet(k: string, v: string | null) {
  const p = await db(); if (!p) return
  if (v === null) await p.query('DELETE FROM astrix_kv WHERE k=$1', [k])
  else await p.query('INSERT INTO astrix_kv (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v', [k, v])
}

async function verifyPassword(password: string, clientCred?: string): Promise<boolean> {
  if (typeof password !== 'string' || !password || password.length > 200) return false
  let credToken: string | null | undefined = clientCred
  if (process.env.DATABASE_URL) {
    try { credToken = await dbGet('cred') } catch { credToken = clientCred }
  }
  const cred = credToken ? unsign(credToken) : null
  if (cred && cred.t === 'cred') return checkCred(cred, password)
  return safeEq(password, DEFAULT_PASSWORD)
}

const fails = new Map<string, { n: number; at: number }>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function ipOf(req: Req) {
  const xf = req.headers['x-forwarded-for']
  return (Array.isArray(xf) ? xf[0] : xf || '').split(',')[0].trim() || 'local'
}

function authed(req: Req): any | null {
  const h = req.headers['authorization']
  const t = typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : ''
  const p = unsign(t)
  return p && p.t === 'sess' ? p : null
}

// ───────────────────────────── helpers ─────────────────────────────
function send(res: Res, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}
function readBody(req: Req): any {
  let b = req.body
  if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  return b && typeof b === 'object' ? b : {}
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©' }
function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return '' } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)) } catch { return '' } })
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
}

// ───────────────────────────── SSRF-safe fetching ─────────────────────────────
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase()
    if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7))
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80')
  }
  return true
}
async function assertPublicUrl(u: URL) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) links can be opened')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Private addresses are blocked')
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new Error('Private addresses are blocked'); return }
  const addrs = await dns.lookup(host, { all: true })
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Private addresses are blocked')
}
async function safeFetch(url: string, init: any = {}, timeoutMs = 9000): Promise<Response> {
  let current = url
  for (let i = 0; i < 5; i++) {
    const u = new URL(current)
    await assertPublicUrl(u)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      const r = await fetch(current, { ...init, redirect: 'manual', signal: ctl.signal })
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        current = new URL(r.headers.get('location') as string, current).toString()
        continue
      }
      return r
    } finally { clearTimeout(timer) }
  }
  throw new Error('Too many redirects')
}
async function readCapped(r: Response, maxBytes = 1_500_000): Promise<string> {
  const reader = r.body?.getReader()
  if (!reader) return await r.text()
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < maxBytes) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value); total += value.length
  }
  try { await reader.cancel() } catch { /* ignore */ }
  return Buffer.concat(chunks).toString('utf8')
}

// ───────────────────────────── page reading ─────────────────────────────
interface PageInfo {
  url: string
  title: string
  kind: 'page' | 'video' | 'social' | 'file'
  text: string
  ok: boolean
  note?: string
  image?: string
}

function meta(html: string, key: string): string {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i')
  const m = html.match(re1) || html.match(re2)
  return m ? decodeEntities(m[1]).trim() : ''
}
function htmlToText(html: string): string {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template|form|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
  const main = h.match(/<(main|article)[\s\S]*?<\/\1>/i)
  if (main && main[0].length > 800) h = main[0]
  h = h
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/blockquote)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(h).replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function youTubeId(u: URL): string | null {
  const h = u.hostname.replace(/^www\.|^m\./, '')
  if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
  if (h.endsWith('youtube.com') || h.endsWith('youtube-nocookie.com')) {
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/)
    if (m) return m[2]
  }
  return null
}

async function readYouTube(id: string, original: string): Promise<PageInfo> {
  const info: PageInfo = { url: original, title: 'YouTube video', kind: 'video', text: '', ok: false }
  const parts: string[] = []
  try {
    const o = await safeFetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`, {}, 6000)
    if (o.ok) {
      const j: any = await o.json()
      info.title = j.title || info.title
      parts.push(`Title: ${j.title}\nChannel: ${j.author_name}`)
      info.image = j.thumbnail_url
      info.ok = true
    }
  } catch { /* continue */ }
  try {
    const r = await safeFetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      headers: { 'User-Agent': UA_BROWSER, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' },
    }, 10000)
    const html = await readCapped(r, 2_500_000)
    const pr = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var\s|<\/script>)/)
    if (pr) {
      const j = JSON.parse(pr[1])
      const vd = j.videoDetails || {}
      if (vd.title) info.title = vd.title
      if (vd.lengthSeconds) parts.push(`Length: ${Math.round(Number(vd.lengthSeconds) / 60)} min`)
      if (vd.viewCount) parts.push(`Views: ${Number(vd.viewCount).toLocaleString('en-US')}`)
      if (vd.shortDescription) parts.push(`Description:\n${clip(vd.shortDescription, 2500)}`)
      info.ok = true
      const tracks: any[] = j.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
      const track = tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') || tracks.find((t) => t.languageCode?.startsWith('en')) || tracks[0]
      if (track?.baseUrl) {
        const tr = await safeFetch(track.baseUrl + '&fmt=json3', { headers: { 'User-Agent': UA_BROWSER } }, 8000)
        const txt = await tr.text()
        if (txt.trim().startsWith('{')) {
          const tj = JSON.parse(txt)
          const lines = (tj.events || []).map((e: any) => (e.segs || []).map((s: any) => s.utf8).join('')).filter(Boolean)
          const transcript = lines.join(' ').replace(/\s+/g, ' ').trim()
          if (transcript) parts.push(`Transcript (${track.languageCode}${track.kind === 'asr' ? ', auto-generated' : ''}):\n${clip(transcript, 18000)}`)
        }
      }
    }
  } catch { /* partial info is fine */ }
  if (!parts.length) { info.note = 'YouTube did not return any information for this video (it may be private, age-restricted, or blocking server requests).'; return info }
  if (!parts.some((p) => p.startsWith('Transcript'))) {
    parts.push('(No transcript was available for this video, so only its public metadata/description was analysed. Video frames and audio cannot be watched or heard.)')
  }
  info.text = parts.join('\n\n')
  return info
}

async function readInstagram(original: string): Promise<PageInfo> {
  const info: PageInfo = { url: original, title: 'Instagram', kind: 'social', text: '', ok: false }
  const u = new URL(original)
  const m = u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/)
  const attempts: Array<() => Promise<string>> = []
  if (m) {
    attempts.push(async () => {
      const r = await safeFetch(`https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed/captioned/`, { headers: { 'User-Agent': UA_BROWSER, 'Accept-Language': 'en-US,en;q=0.9' } }, 9000)
      const html = await readCapped(r, 1_200_000)
      const cap = html.match(/<div class="Caption"[\s\S]*?<\/div>\s*<\/div>/i) || html.match(/class="Caption"[\s\S]{0,4000}/i)
      const user = html.match(/class="UsernameText"[^>]*>([^<]+)</i)
      const text = cap ? htmlToText(cap[0]).replace(/\s*View all \d+ comments.*/is, '') : ''
      return text ? `${user ? '@' + decodeEntities(user[1]) + ': ' : ''}${text}` : ''
    })
  }
  attempts.push(async () => {
    const r = await safeFetch(original, { headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Accept-Language': 'en-US,en;q=0.9' } }, 9000)
    const html = await readCapped(r, 800_000)
    const t = meta(html, 'og:title'), d = meta(html, 'og:description') || meta(html, 'description')
    info.image = meta(html, 'og:image') || undefined
    if (/^(instagram|login)/i.test(t) && !d) return ''
    return [t && `Title: ${t}`, d && `Caption / description: ${d}`].filter(Boolean).join('\n')
  })
  for (const a of attempts) {
    try { const t = await a(); if (t && t.length > 8) { info.text = t; info.ok = true; info.title = clip(t.split('\n')[0], 80); return info } } catch { /* next */ }
  }
  info.note = 'Instagram did not expose this content publicly (it is private, requires login, or blocks automated access). Only public posts/reels can sometimes be read, and video frames/audio can never be analysed.'
  return info
}

async function readUrl(url: string): Promise<PageInfo> {
  let u: URL
  try { u = new URL(url) } catch { return { url, title: url, kind: 'page', text: '', ok: false, note: 'Invalid URL' } }
  try {
    const yt = youTubeId(u)
    if (yt) return await readYouTube(yt, url)
    if (/(^|\.)instagram\.com$/.test(u.hostname)) return await readInstagram(url)

    const r = await safeFetch(url, { headers: { 'User-Agent': UA_BROWSER, Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-US,en;q=0.9' } }, 10000)
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    if (!r.ok) return { url, title: domainOf(url), kind: 'page', text: '', ok: false, note: `The site responded with HTTP ${r.status}${r.status === 403 || r.status === 401 ? ' (access blocked or login required)' : ''}.` }
    if (ct.includes('pdf')) return { url, title: domainOf(url), kind: 'file', text: '', ok: false, note: 'This link is a PDF. Download it and upload it to the chat for analysis.' }
    if (ct.startsWith('image/') || ct.startsWith('video/') || ct.startsWith('audio/')) return { url, title: domainOf(url), kind: 'file', text: '', ok: false, note: `This link is a ${ct.split('/')[0]} file; its contents can't be analysed from a link. Upload an image directly to the chat for visual analysis.` }
    const raw = await readCapped(r)
    if (ct.includes('html') || /^\s*<(!doctype|html)/i.test(raw)) {
      const title = decodeEntities((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ')).trim() || meta(raw, 'og:title') || domainOf(url)
      const desc = meta(raw, 'og:description') || meta(raw, 'description')
      let text = htmlToText(raw)
      if (text.length < 200 && desc) text = desc + '\n' + text
      const isVideoPage = /og:type["'][^>]*content=["']video/i.test(raw)
      const head = [desc && `Description: ${desc}`].filter(Boolean).join('\n')
      if (!text) return { url, title, kind: 'page', text: head, ok: !!head, note: head ? 'Page content is rendered by JavaScript; only its description was readable.' : 'The page had no readable text (it may need JavaScript or a login).' }
      return { url, title, kind: isVideoPage ? 'video' : 'page', text: clip((head ? head + '\n\n' : '') + text, 14000), ok: true, image: meta(raw, 'og:image') || undefined }
    }
    return { url, title: domainOf(url), kind: 'page', text: clip(raw, 14000), ok: true }
  } catch (e: any) {
    return { url, title: domainOf(url), kind: 'page', text: '', ok: false, note: `Could not open the link: ${e?.name === 'AbortError' ? 'timed out' : e?.message || 'network error'}.` }
  }
}

// ───────────────────────────── web search ─────────────────────────────
interface SearchHit { title: string; url: string; snippet: string }

async function searchTavily(q: string): Promise<SearchHit[]> {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query: q, max_results: 6, search_depth: 'basic' }),
  })
  if (!r.ok) throw new Error('tavily ' + r.status)
  const j: any = await r.json()
  return (j.results || []).map((x: any) => ({ title: x.title, url: x.url, snippet: clip(x.content || '', 400) }))
}
async function searchBrave(q: string): Promise<SearchHit[]> {
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=6&q=${encodeURIComponent(q)}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY as string },
  })
  if (!r.ok) throw new Error('brave ' + r.status)
  const j: any = await r.json()
  return (j.web?.results || []).map((x: any) => ({ title: x.title, url: x.url, snippet: clip(decodeEntities((x.description || '').replace(/<[^>]+>/g, '')), 400) }))
}
async function searchSerper(q: string): Promise<SearchHit[]> {
  const r = await fetch('https://google.serper.dev/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.SERPER_API_KEY as string },
    body: JSON.stringify({ q, num: 6 }),
  })
  if (!r.ok) throw new Error('serper ' + r.status)
  const j: any = await r.json()
  return (j.organic || []).map((x: any) => ({ title: x.title, url: x.link, snippet: clip(x.snippet || '', 400) }))
}
async function searchDuckDuckGo(q: string): Promise<SearchHit[]> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
    })
    const html = await r.text()
    const out: SearchHit[] = []
    const blocks = html.split(/<div[^>]+class="[^"]*result results_links[^"]*"/).slice(1)
    for (const b of blocks) {
      const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      if (!a) continue
      let href = decodeEntities(a[1])
      const uddg = href.match(/[?&]uddg=([^&]+)/)
      if (uddg) href = decodeURIComponent(uddg[1])
      if (href.startsWith('//')) href = 'https:' + href
      if (!/^https?:/.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue
      const sn = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
      out.push({ title: decodeEntities(a[2].replace(/<[^>]+>/g, '')).trim(), url: href, snippet: sn ? decodeEntities(sn[1].replace(/<[^>]+>/g, '')).trim() : '' })
      if (out.length >= 7) break
    }
    return out
  } finally { clearTimeout(t) }
}
async function searchBing(q: string): Promise<SearchHit[]> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en&cc=us`, {
      signal: ctl.signal, headers: { 'User-Agent': UA_BROWSER, 'Accept-Language': 'en-US,en;q=0.9' },
    })
    const html = await r.text()
    const out: SearchHit[] = []
    for (const b of html.split('<li class="b_algo"').slice(1)) {
      const a = b.match(/<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      if (!a) continue
      let href = decodeEntities(a[1])
      const u = href.match(/[?&]u=a1([^&]+)/)
      if (u) { try { href = Buffer.from(u[1], 'base64url').toString('utf8') } catch { continue } }
      if (!/^https?:\/\//.test(href)) continue
      const sn = b.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/) || b.match(/<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)
      out.push({
        title: decodeEntities(a[2].replace(/<[^>]+>/g, '')).trim(),
        url: href,
        snippet: sn ? decodeEntities(sn[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '',
      })
      if (out.length >= 7) break
    }
    return out
  } finally { clearTimeout(t) }
}
async function searchWikipedia(q: string): Promise<SearchHit[]> {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=5&origin=*`, { headers: { 'User-Agent': 'AstrixAI/1.0' } })
  if (!r.ok) throw new Error('wiki ' + r.status)
  const j: any = await r.json()
  return (j.query?.search || []).map((x: any) => ({
    title: x.title + ' — Wikipedia',
    url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(x.title.replace(/ /g, '_')),
    snippet: decodeEntities(String(x.snippet).replace(/<[^>]+>/g, '')),
  }))
}

function searchProviderName(): string {
  if (process.env.TAVILY_API_KEY) return 'Tavily'
  if (process.env.BRAVE_API_KEY) return 'Brave Search'
  if (process.env.SERPER_API_KEY) return 'Serper (Google)'
  return 'Bing/DuckDuckGo (no key)'
}
async function webSearch(q: string): Promise<SearchHit[]> {
  const chain: Array<() => Promise<SearchHit[]>> = []
  if (process.env.TAVILY_API_KEY) chain.push(() => searchTavily(q))
  if (process.env.BRAVE_API_KEY) chain.push(() => searchBrave(q))
  if (process.env.SERPER_API_KEY) chain.push(() => searchSerper(q))
  chain.push(() => searchBing(q), () => searchDuckDuckGo(q), () => searchWikipedia(q))
  for (const fn of chain) {
    try {
      const hits = (await fn()).filter((h) => h.url && h.title)
      if (hits.length) return hits.slice(0, 6)
    } catch { /* next provider */ }
  }
  return []
}

// ───────────────────────────── LLM calls ─────────────────────────────
function headersFor(p: Provider) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...(p.headers || {}) }
  if (p.key) h.Authorization = `Bearer ${p.key}`
  return h
}
function noTemp(model: string) { return /^(o\d|gpt-5)/.test(model) }

function toOpenAI(messages: any[], vision: boolean) {
  // Only the most recent message carrying images keeps them; older ones are dropped to keep payloads small.
  let lastImg = -1
  messages.forEach((m, i) => { if (m.role === 'user' && Array.isArray(m.images) && m.images.length) lastImg = i })
  return messages.map((m, i) => {
    const content = String(m.content ?? '')
    if (m.role === 'user' && i === lastImg && vision) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: content || 'Please analyse the attached image(s).' },
          ...m.images.slice(0, 4).map((im: any) => ({ type: 'image_url', image_url: { url: im.dataUrl } })),
        ],
      }
    }
    if (m.role === 'user' && Array.isArray(m.images) && m.images.length && !vision && i === lastImg) {
      return { role: 'user', content: content + `\n\n[System note: ${m.images.length} image(s) were attached, but the selected model cannot see images. Only OCR text (if any, above) is available. Tell the user to add a vision-capable provider key for full image analysis.]` }
    }
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content }
  })
}

async function postWithRetry(provider: Provider, body: any, signal?: AbortSignal): Promise<Response> {
  // The free keyless provider allows one request per IP at a time; queue politely instead of failing.
  const tries = provider.key ? 2 : 7
  let r: Response | undefined
  for (let i = 0; i < tries; i++) {
    r = await fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers: headersFor(provider), body: JSON.stringify(body), signal })
    if (r.status !== 429 || i === tries - 1) break
    try { await r.arrayBuffer() } catch { /* drain */ }
    await sleep(provider.key ? 1500 : 2200)
    if (signal?.aborted) break
  }
  return r as Response
}

async function complete(provider: Provider, model: string, messages: any[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
  const body: any = { model, messages, stream: false }
  if (opts.temperature !== undefined && !noTemp(model)) body.temperature = opts.temperature
  const r = await postWithRetry(provider, body)
  if (!r.ok) throw new Error(`AI provider error ${r.status}`)
  const j: any = await r.json()
  return String(j.choices?.[0]?.message?.content ?? '').trim()
}

async function* streamChat(provider: Provider, model: string, messages: any[], temperature: number, signal: AbortSignal): AsyncGenerator<{ type: 'content' | 'thinking'; text: string }> {
  const body: any = { model, messages, stream: true }
  if (!noTemp(model)) body.temperature = temperature
  const r = await postWithRetry(provider, body, signal)
  if (!r.ok || !r.body) {
    let detail = ''
    try { const t = await r.text(); const j = JSON.parse(t); detail = j.error?.message || j.error || t } catch { /* ignore */ }
    const hint = r.status === 401 || r.status === 403 ? ' — check the API key configured on the server.' : r.status === 429 ? ' — rate limit reached, please wait a moment and retry.' : ''
    throw new Error(`${provider.name} returned ${r.status}${hint}${detail ? ' ' + clip(typeof detail === 'string' ? detail : JSON.stringify(detail), 200) : ''}`)
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const j = JSON.parse(data)
        const d = j.choices?.[0]?.delta
        if (!d) continue
        if (typeof d.content === 'string' && d.content) yield { type: 'content', text: d.content }
        else if (typeof (d.reasoning ?? d.reasoning_content) === 'string') yield { type: 'thinking', text: '' }
      } catch { /* partial JSON */ }
    }
  }
}

// ───────────────────────────── chat route ─────────────────────────────
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi
function extractUrls(text: string): string[] {
  const set = new Set<string>()
  for (const m of text.match(URL_RE) || []) set.add(m.replace(/[.,;:!?]+$/, ''))
  return [...set].slice(0, 3)
}

function systemPrompt(b: any, web: { block: string } | null): string {
  const style = b.style === 'concise' ? 'Keep answers short and to the point.' : b.style === 'detailed' ? 'Give thorough, well-structured, in-depth answers.' : 'Be clear and balanced: complete but not padded.'
  const mem: string[] = Array.isArray(b.memories) ? b.memories.filter((x: any) => typeof x === 'string').slice(0, 60) : []
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  return [
    `You are ASTRIX AI, a premium, highly capable personal AI assistant created for ${b.userName || 'Abdulloh'}. Address the user as ${b.userName || 'Abdulloh'} when natural, but never be sycophantic.`,
    `Today's date (UTC): ${today}.`,
    style,
    'Format replies in Markdown. Use fenced code blocks with a language tag for code. Be honest: if you are unsure, or something could not be accessed, say so instead of guessing.',
    mem.length ? `Things you remember about the user (use them when relevant, do not recite them unprompted):\n${mem.map((m) => '- ' + m).join('\n')}` : '',
    `Task planner integration: when the user asks you to plan, schedule, or create tasks/reminders/study sessions, answer normally and ALSO append one fenced block with language tag "astrix-tasks" containing a JSON array like [{"title":"IXL practice","durationMin":25,"time":"16:00","repeat":"weekly","days":[6],"notes":"optional"}]. Fields: title (string), durationMin (number, optional), time ("HH:mm", optional), date ("YYYY-MM-DD", optional), repeat ("none"|"daily"|"weekly"|"monthly"), days (weekday numbers 0=Sunday..6=Saturday, for weekly), notes (optional). The app renders it as buttons that add the tasks to the user's planner. Only include it when the user wants tasks created.`,
    b.customInstructions ? `Custom instructions from the user:\n${clip(String(b.customInstructions), 1500)}` : '',
    web ? web.block : '',
  ].filter(Boolean).join('\n\n')
}

const SEARCH_HINT = /\b(latest|news|today|tonight|yesterday|this (week|month|year)|currently|right now|price|stock|weather|score|who (is|won|are)|when (is|did|does|will)|release[ds]?|20(2\d|3\d)|updates?|search|look ?up|find (me|out)|google|website|compare|reviews?|vs\.?|how much|where (can|to)|near me|trending|official)\b/i
function shouldSearch(t: string) {
  const text = t.trim()
  if (text.length < 8) return false
  return SEARCH_HINT.test(text)
}

async function handleChat(req: Req, res: Res) {
  const b = readBody(req)
  const msgs: any[] = Array.isArray(b.messages) ? b.messages.slice(-40) : []
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return send(res, 400, { error: 'No user message' })

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  const ev = (o: unknown) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`) }

  const ctl = new AbortController()
  res.on('close', () => ctl.abort())

  try {
    const { provider, model } = resolveModel(b.model)
    const lastText = String(msgs[msgs.length - 1].content || '')
    // The raw user text without file dumps (file blocks start after a marker the client adds).
    const userOnly = lastText.split('\n\n[Attached')[0]
    const urls = extractUrls(userOnly)

    const sources: any[] = []
    const ctxParts: string[] = []
    let n = 0

    if (urls.length) {
      ev({ type: 'status', text: urls.some((u) => /youtu/.test(u)) ? 'Analysing video & links…' : 'Reading link…' })
      const pages = await Promise.all(urls.map((u) => readUrl(u)))
      for (const p of pages) {
        n++
        sources.push({ title: p.title, url: p.url, domain: domainOf(p.url), kind: p.kind, ok: p.ok, snippet: p.ok ? clip(p.text.replace(/\s+/g, ' '), 160) : p.note })
        ctxParts.push(p.ok
          ? `[${n}] ${p.kind.toUpperCase()} — ${p.title}\nURL: ${p.url}\n${p.note ? 'Note: ' + p.note + '\n' : ''}Content:\n${p.text}`
          : `[${n}] ${p.url}\nCOULD NOT BE ACCESSED. ${p.note || ''} Tell the user this honestly and do NOT invent what is on the page.`)
      }
    } else if (b.webSearch === true || b.webSearch === 'on' || (b.webSearch === 'auto' && shouldSearch(userOnly))) {
      let query = clip(userOnly.replace(/\s+/g, ' ').trim(), 300)
      if (msgs.length > 2 || query.split(' ').length > 25) {
        try {
          const hist = msgs.slice(-6, -1).map((m) => `${m.role}: ${clip(String(m.content || '').split('\n\n[Attached')[0], 300)}`).join('\n')
          const q = await complete(provider, model.id, [
            { role: 'system', content: 'You turn the latest user message into ONE concise web search query (max 12 words), using the conversation for context. Output only the query, no quotes.' },
            { role: 'user', content: `Conversation:\n${hist}\n\nLatest message: ${query}` },
          ], { temperature: 0 })
          const cleaned = q.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0]
          if (cleaned && cleaned.length < 200) query = cleaned
        } catch { /* use raw message */ }
      }
      ev({ type: 'status', text: `Searching the web: “${clip(query, 60)}”` })
      const hits = await webSearch(query)
      if (hits.length) {
        ev({ type: 'status', text: 'Reading top sources…' })
        const top = hits.slice(0, 3)
        const pages = await Promise.all(top.map((h) => readUrl(h.url).catch(() => null)))
        hits.forEach((h, i) => {
          n++
          const page = i < 3 ? pages[i] : null
          sources.push({ title: h.title, url: h.url, domain: domainOf(h.url), kind: 'search', ok: true, snippet: h.snippet })
          ctxParts.push(`[${n}] ${h.title}\nURL: ${h.url}\nSnippet: ${h.snippet}${page?.ok ? `\nPage excerpt:\n${clip(page.text, 3500)}` : ''}`)
        })
      } else {
        ctxParts.push('The web search returned no results (search service unavailable). Tell the user the live search failed and answer from your own knowledge with a caveat that it may be outdated.')
      }
    }
    if (sources.length) ev({ type: 'sources', sources })

    const web = ctxParts.length
      ? { block: `LIVE WEB CONTEXT (retrieved just now by the app — treat it as real, current information):\n\n${ctxParts.join('\n\n---\n\n')}\n\nWhen you use these, cite them inline as [1], [2] matching the numbers above. Don't print a separate sources list; the UI shows it. If sources conflict or are thin, say so.` }
      : null

    const oa = [{ role: 'system', content: systemPrompt(b, web) }, ...toOpenAI(msgs, model.vision)]
    ev({ type: 'status', text: web ? 'Writing answer…' : '' })
    ev({ type: 'meta', model: `${provider.name} · ${model.label}` })

    let got = false
    let lastThink = 0
    for await (const chunk of streamChat(provider, model.id, oa, typeof b.temperature === 'number' ? Math.min(1.5, Math.max(0, b.temperature)) : 0.7, ctl.signal)) {
      if (chunk.type === 'content') { got = true; ev({ type: 'token', text: chunk.text }) }
      else if (Date.now() - lastThink > 2500) { lastThink = Date.now(); ev({ type: 'status', text: 'Thinking…' }) }
    }
    if (!got && !ctl.signal.aborted) ev({ type: 'error', error: 'The model returned an empty response. Please try again.' })
    ev({ type: 'done' })
  } catch (e: any) {
    if (!ctl.signal.aborted) ev({ type: 'error', error: e?.message || 'Something went wrong while contacting the AI provider.' })
  } finally {
    if (!res.writableEnded) res.end()
  }
}

// ───────────────────────────── router ─────────────────────────────
export default async function handler(req: Req, res: Res) {
  const route = String(req.query?.r || new URL(req.url || '/', 'http://x').searchParams.get('r') || '')
  try {
    if (route === 'health') return send(res, 200, { ok: true, service: 'astrix-ai' })

    if (route === 'login') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
      const ip = ipOf(req)
      const f = fails.get(ip)
      if (f && Date.now() - f.at < 10 * 60_000 && f.n >= 8) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' })
      const b = readBody(req)
      const ok = await verifyPassword(b.password, typeof b.cred === 'string' ? b.cred : undefined)
      if (!ok) {
        fails.set(ip, { n: (f && Date.now() - f.at < 10 * 60_000 ? f.n : 0) + 1, at: Date.now() })
        await sleep(700)
        return send(res, 401, { error: 'Incorrect password' })
      }
      fails.delete(ip)
      const ttl = b.remember ? 30 * 24 * 3600_000 : 12 * 3600_000
      return send(res, 200, { token: sign({ t: 'sess', exp: Date.now() + ttl, n: crypto.randomBytes(6).toString('hex') }) })
    }

    if (!authed(req)) return send(res, 401, { error: 'Not authenticated' })

    if (route === 'config') {
      const providers = buildProviders()
      const primary = providers[0]
      return send(res, 200, {
        defaultModel: `${primary.id}::${primary.models[0].id}`,
        provider: primary.name,
        keyless: !primary.key,
        models: providers.flatMap((p) => p.models.map((m) => ({ id: `${p.id}::${m.id}`, label: m.label, provider: p.name, vision: m.vision }))),
        vision: providers.some((p) => p.models.some((m) => m.vision)),
        search: searchProviderName(),
        searchKeyed: !!(process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY || process.env.SERPER_API_KEY),
        database: !!process.env.DATABASE_URL,
        passwordStorage: process.env.DATABASE_URL ? 'server' : 'device',
        passwordFromEnv: !!process.env.ASTRIX_PASSWORD,
      })
    }

    if (route === 'change' || route === 'reset') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
      const b = readBody(req)
      const ip = ipOf(req)
      const ok = await verifyPassword(b.current, typeof b.cred === 'string' ? b.cred : undefined)
      if (!ok) { await sleep(700); fails.set(ip, { n: (fails.get(ip)?.n || 0) + 1, at: Date.now() }); return send(res, 403, { error: 'Current password is incorrect' }) }
      if (route === 'reset') {
        if (process.env.DATABASE_URL) await dbSet('cred', null)
        return send(res, 200, { ok: true })
      }
      const next = String(b.next || '')
      if (next.length < 8) return send(res, 400, { error: 'New password must be at least 8 characters' })
      if (next.length > 200) return send(res, 400, { error: 'New password is too long' })
      const cred = makeCred(next)
      if (process.env.DATABASE_URL) await dbSet('cred', cred)
      return send(res, 200, { ok: true, cred, storage: process.env.DATABASE_URL ? 'server' : 'device' })
    }

    if (route === 'chat') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
      return await handleChat(req, res)
    }

    if (route === 'read') {
      const b = readBody(req)
      const page = await readUrl(String(b.url || ''))
      return send(res, 200, { page })
    }

    if (route === 'title') {
      const b = readBody(req)
      const { provider, model } = resolveModel(undefined)
      const t = await complete(provider, model.id, [
        { role: 'system', content: 'Write a very short chat title (2-5 words, no quotes, no trailing punctuation) summarising this exchange. Output only the title.' },
        { role: 'user', content: `User: ${clip(String(b.userText || ''), 400)}\nAssistant: ${clip(String(b.assistantText || ''), 400)}` },
      ], { temperature: 0.3 }).catch(() => '')
      const title = t.replace(/^["'\s#*]+|["'\s.*]+$/g, '').split('\n')[0]
      return send(res, 200, { title: clip(title, 60) })
    }

    if (route === 'memory') {
      const b = readBody(req)
      const { provider, model } = resolveModel(undefined)
      const existing: string[] = Array.isArray(b.existing) ? b.existing.slice(0, 60).map(String) : []
      const out = await complete(provider, model.id, [
        { role: 'system', content: 'You extract durable, useful facts worth remembering about the USER from a chat turn (name details, preferences, goals, schedule, projects, school, hobbies, constraints, or things they explicitly ask you to remember). Ignore one-off questions, trivia and anything sensitive (passwords, financial or health secrets). Return ONLY a JSON array (max 3) of short third-person strings like "Abdulloh does 25-minute IXL sessions weekly". Return [] if nothing is worth saving. Do not repeat anything already known.' },
        { role: 'user', content: `Already known:\n${existing.map((e) => '- ' + e).join('\n') || '(none)'}\n\nUser said: ${clip(String(b.userText || ''), 800)}\nAssistant replied: ${clip(String(b.assistantText || ''), 400)}` },
      ], { temperature: 0 }).catch(() => '')
      let items: string[] = []
      const m = out.match(/\[[\s\S]*\]/)
      if (m) { try { items = JSON.parse(m[0]).filter((x: any) => typeof x === 'string' && x.length > 3 && x.length < 220).slice(0, 3) } catch { /* ignore */ } }
      return send(res, 200, { items })
    }

    return send(res, 404, { error: 'Unknown route' })
  } catch (e: any) {
    if (!res.writableEnded) return send(res, 500, { error: e?.message || 'Server error' })
  }
}

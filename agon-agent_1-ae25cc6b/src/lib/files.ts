import { unzipSync, strFromU8 } from 'fflate'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Attachment } from './types'
import { uid } from './types'

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'html', 'htm', 'css', 'scss', 'js', 'jsx', 'mjs', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'sql', 'yml', 'yaml', 'toml', 'ini', 'env', 'log', 'tex', 'swift', 'kt', 'r', 'lua', 'vue', 'svelte', 'ics', 'srt', 'vtt'])
const MAX_CHARS = 60000

export const ACCEPT = 'image/*,.pdf,.docx,.' + [...TEXT_EXT].join(',.')

const ext = (n: string) => (n.split('.').pop() || '').toLowerCase()
const clip = (s: string) => (s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) + '\n…[truncated]' : s)

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('Could not decode this image'))
    im.src = src
  })
}

function scaleTo(im: HTMLImageElement, max: number, quality: number): string {
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(im.naturalWidth * k))
  c.height = Math.max(1, Math.round(im.naturalHeight * k))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(im, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', quality)
}

async function readImage(file: File): Promise<Attachment> {
  const url = URL.createObjectURL(file)
  try {
    const im = await loadImage(url)
    return {
      id: uid(), kind: 'image', name: file.name || 'image.jpg', mime: file.type, size: file.size,
      dataUrl: scaleTo(im, 1536, 0.82), thumb: scaleTo(im, 200, 0.7),
    }
  } finally { URL.revokeObjectURL(url) }
}

export async function ocrImage(dataUrl: string): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(dataUrl)
    return (data.text || '').trim()
  } finally { await worker.terminate() }
}

async function readPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  let out = ''
  const pages = Math.min(doc.numPages, 60)
  for (let p = 1; p <= pages && out.length < MAX_CHARS; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const text = tc.items.map((i) => ('str' in i ? i.str + ('hasEOL' in i && i.hasEOL ? '\n' : ' ') : '')).join('')
    out += `\n--- Page ${p} ---\n${text.replace(/[ \t]+/g, ' ').trim()}`
  }
  if (doc.numPages > pages) out += `\n…[${doc.numPages - pages} more pages not read]`
  return out.trim()
}

async function readDocx(file: File): Promise<string> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === 'word/document.xml' })
  const xml = files['word/document.xml']
  if (!xml) throw new Error('Not a valid .docx file')
  return strFromU8(xml)
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function processFile(file: File, opts: { vision: boolean; onStage?: (s: string) => void }): Promise<Attachment> {
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB`)
  const e = ext(file.name)

  if (file.type.startsWith('image/')) {
    const att = await readImage(file)
    if (!opts.vision && att.dataUrl) {
      opts.onStage?.('Reading text in image…')
      try {
        const t = await ocrImage(att.dataUrl)
        if (t) { att.text = t.slice(0, 20000); att.textLabel = 'image — OCR text' }
        else att.note = 'No readable text found; the current AI model cannot see pictures.'
      } catch { att.note = 'OCR unavailable; the current AI model cannot see pictures.' }
    }
    return att
  }

  const base = { id: uid(), kind: 'file' as const, name: file.name, mime: file.type || e, size: file.size }
  if (e === 'pdf' || file.type === 'application/pdf') {
    opts.onStage?.('Extracting PDF text…')
    const text = await readPdf(file)
    if (!text.replace(/--- Page \d+ ---/g, '').trim()) throw new Error(`${file.name} has no selectable text (it may be a scan). Upload pages as images instead.`)
    return { ...base, text: clip(text), textLabel: 'PDF' }
  }
  if (e === 'docx') {
    opts.onStage?.('Reading document…')
    return { ...base, text: clip(await readDocx(file)), textLabel: 'document' }
  }
  if (TEXT_EXT.has(e) || file.type.startsWith('text/') || file.type === 'application/json') {
    return { ...base, text: clip(await file.text()), textLabel: 'file' }
  }
  throw new Error(`${file.name}: this file type isn't supported yet (images, PDF, DOCX, text, code, CSV and JSON work)`)
}

export const formatSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`)

#!/usr/bin/env node
/**
 * Light-mode audit
 * ─────────────────
 * Statically scans src/**\/*.tsx for inline styles that hardcode color
 * literals which won't auto-flip between dark and light themes. Each
 * hit is categorized:
 *
 *   OK     — paired with an accent background (white on green, dark
 *            on yellow), works in both modes by design.
 *   CHECK  — color paired with token-bound bg (var(--b1n0-text-1) etc.)
 *            that does flip — usually OK but worth eyeballing.
 *   BREAK  — color sitting on a non-flipping surface (card/transparent/
 *            image overlay). Likely to look wrong in light mode.
 *
 * Run:    node scripts/audit-light-mode.mjs
 * Run:    node scripts/audit-light-mode.mjs --break  (only show BREAK)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const SRC  = join(ROOT, 'src')

// CLI flags
const args = new Set(process.argv.slice(2))
const breakOnly = args.has('--break')

// ── Patterns ────────────────────────────────────────────────────────────
const WHITE_LITERAL = /['"]#(fff|FFF|ffffff|FFFFFF)['"]/
const RGBA_WHITE    = /rgba\(\s*255\s*,\s*255\s*,\s*255/
const RGBA_BLACK    = /rgba\(\s*0\s*,\s*0\s*,\s*0/
const NEAR_BLACK    = /['"]#0[dD]0[dD]0[dD]['"]/
const DARK_SURFACE  = /['"]#(141A1E|1A2226|243038)['"]/

// Accent-bg signals — if the same line has one of these, the white text
// is intentional and works in both modes.
const ACCENT_BG = /background:[^,;]*(var\(--b1n0-(si\b|si-hover|gold|teal-500|teal-700|sidebar-active|pill-active|error)\)|#06D47F|#04B86C|#FFD474|#DC2626|var\(--b1n0-no\b\))/i

// Token-bound surface signals — those DO flip; pair is OK.
const TOKEN_BG = /background:[^,;]*var\(--b1n0-(text-1|text-2|bg|surface|card)\)/i

// Image overlay / gradient signals — those work in both modes (image is the bg).
const IMAGE_OVERLAY = /linear-gradient\([^)]*rgba\(0,\s*0,\s*0/

// ── File walk ───────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) walk(path, out)
    else if (name.endsWith('.tsx')) out.push(path)
  }
  return out
}

// ── Audit ───────────────────────────────────────────────────────────────
const counts = { OK: 0, CHECK: 0, BREAK: 0 }
const hits = []

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf-8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/(?:^|\s)(color|background|border|fill|stroke)\s*:/.test(line)) continue
    const matched =
      WHITE_LITERAL.test(line) ||
      RGBA_WHITE.test(line) ||
      NEAR_BLACK.test(line) ||
      DARK_SURFACE.test(line)
    if (!matched) continue
    // Look 2 lines up and 2 lines down for accent bg context
    const window = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n')
    let verdict
    if (ACCENT_BG.test(window)) verdict = 'OK'
    else if (TOKEN_BG.test(window) || IMAGE_OVERLAY.test(window)) verdict = 'CHECK'
    else verdict = 'BREAK'
    counts[verdict]++
    hits.push({
      file: relative(ROOT, file).replaceAll('\\', '/'),
      line: i + 1,
      verdict,
      content: line.trim().slice(0, 140),
    })
  }
}

// ── Render ──────────────────────────────────────────────────────────────
const C = { reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m', amber: '\x1b[33m', green: '\x1b[32m' }
const tint = { OK: C.green, CHECK: C.amber, BREAK: C.red }

console.log('')
console.log('Light-mode audit — hardcoded color literals in inline styles')
console.log('─'.repeat(60))
console.log(`  ${C.green}OK${C.reset}     ${counts.OK}  — paired with accent bg, works in both modes`)
console.log(`  ${C.amber}CHECK${C.reset}  ${counts.CHECK}  — paired with token bg, likely fine but eyeball it`)
console.log(`  ${C.red}BREAK${C.reset}  ${counts.BREAK}  — sitting on non-flipping surface, likely broken in light`)
console.log('')

const filtered = breakOnly ? hits.filter((h) => h.verdict === 'BREAK') : hits

// Group by file
const byFile = new Map()
for (const h of filtered) {
  if (!byFile.has(h.file)) byFile.set(h.file, [])
  byFile.get(h.file).push(h)
}

for (const [file, items] of byFile) {
  console.log(`${C.dim}${file}${C.reset}`)
  for (const h of items) {
    console.log(`  ${tint[h.verdict]}${h.verdict.padEnd(5)}${C.reset} ${h.line.toString().padStart(4)}  ${h.content}`)
  }
  console.log('')
}

if (counts.BREAK === 0) {
  console.log(`${C.green}✓ No likely-broken sites detected.${C.reset}`)
  process.exit(0)
}
console.log(`${C.amber}${counts.BREAK} likely-broken site(s) to review.${C.reset}`)
console.log(`Run with --break to see only these.`)

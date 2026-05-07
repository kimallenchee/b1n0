#!/usr/bin/env node
/**
 * Pre-build truncation guard.
 *
 * Uses TypeScript's own parser to check if every src/**.ts(x) file
 * is syntactically complete. A truncated mid-write file fails the
 * parse and gets flagged with the line number of the first error.
 *
 * Why this exists: the b1n0 repo's filesystem layer occasionally
 * truncates files mid-write (we've hit it on Portafolio, RatesPanel,
 * EventManager, pricing.ts, this script — the corruption is real
 * and recurring). Vercel finds out 4 seconds into the build with
 * `Expected ")" but found end of file`. This catches it in 200ms
 * locally with a clear error.
 *
 * Run manually:  npm run check:truncation
 * Auto-run:      every `npm run build` (Vercel runs this).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const SRC = 'src'
const flagged = []

function walk (dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) { walk(full); continue }
    if (!/\.(ts|tsx)$/.test(entry)) continue

    const content = readFileSync(full, 'utf8')
    if (content.trim().length === 0) {
      flagged.push({ file: full, line: 0, msg: 'empty file' })
      continue
    }

    const sf = ts.createSourceFile(
      full,
      content,
      ts.ScriptTarget.Latest,
      true,
      full.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    // parseDiagnostics is set by the parser when it hits unrecoverable
    // syntax errors — exactly what a truncated file produces.
    const diags = sf.parseDiagnostics ?? []
    if (diags.length > 0) {
      const d = diags[0]
      const pos = d.start ?? 0
      const { line } = sf.getLineAndCharacterOfPosition(pos)
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n')
      flagged.push({ file: full, line: line + 1, msg })
    }
  }
}

walk(SRC)

if (flagged.length > 0) {
  console.error('\n[check-truncation] FAIL — files have parse errors (likely truncated):\n')
  for (const f of flagged) {
    console.error('  ' + f.file + ':' + f.line)
    console.error('    -> ' + f.msg + '\n')
  }
  console.error(flagged.length + ' file(s) flagged. Build aborted.\n')
  process.exit(1)
}

console.log('[check-truncation] OK - all src/**/*.{ts,tsx} files parsed cleanly.')

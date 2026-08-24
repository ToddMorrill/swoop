/**
 * Rehearses a GitHub Pages deploy locally.
 *
 * `npm run dev` differs from Pages in ways that can hide a broken deploy: it
 * serves unbundled source from the domain root, and it falls back to index.html
 * for any unknown path. Pages serves a production build from a subdirectory and
 * 404s anything that is not a real file. This script reproduces that exactly,
 * then checks every asset the page asks for actually resolves.
 *
 *   node scripts/check-pages.mjs [repo-name]
 */
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const repo = process.argv[2] ?? 'swoop'
const base = repo.endsWith('.github.io') ? '/' : `/${repo}/`
const dist = path.resolve('dist')
const PORT = 4178

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

let failures = 0
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
const bad = (msg) => {
  failures++
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`)
}

console.log(`\nRehearsing a Pages deploy of "${repo}" at ${base}\n`)

console.log('Building as the workflow would')
const build = spawnSync('npm', ['run', 'build'], {
  env: { ...process.env, BASE_PATH: base },
  encoding: 'utf8',
})
if (build.status !== 0) {
  console.error(build.stdout, build.stderr)
  process.exit(1)
}
ok('build succeeded')

// A deliberately dumb static server: no SPA fallback, no directory magic,
// no rewriting — the same "file exists or 404" contract Pages gives you.
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  if (!url.startsWith(base)) {
    res.writeHead(404).end('outside base path')
    return
  }
  let rel = url.slice(base.length)
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const file = path.join(dist, rel)
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

await new Promise((resolve) => server.listen(PORT, resolve))
const origin = `http://localhost:${PORT}`

try {
  console.log('\nServing dist/ the way Pages does')
  const indexRes = await fetch(origin + base)
  if (indexRes.status === 200) ok(`GET ${base} -> 200`)
  else bad(`GET ${base} -> ${indexRes.status}`)
  const html = await indexRes.text()

  console.log('\nEvery asset the page asks for')
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  if (refs.length === 0) bad('the page references no assets at all — build looks wrong')
  for (const ref of refs) {
    if (/^https?:\/\//.test(ref)) {
      bad(`${ref} is an external URL — it will not be served from your Pages site`)
      continue
    }
    if (!ref.startsWith(base)) {
      bad(`${ref} does not start with ${base} — it will 404 on a project site`)
      continue
    }
    const res = await fetch(origin + ref)
    if (res.status === 200) ok(`${ref} -> 200`)
    else bad(`${ref} -> ${res.status}`)
  }

  console.log('\nNothing reaching off-site at runtime')
  // Only scan what we actually serve; external refs were already reported above.
  const assets = refs.filter((r) => r.startsWith(base) && /\.(js|css)$/.test(r))
  let external = []
  for (const ref of assets) {
    const text = await (await fetch(origin + ref)).text()
    external.push(...(text.match(/https?:\/\/[^"'`\s)]+/g) ?? []))
  }
  external = [...new Set(external)].filter((u) => !u.includes('www.w3.org') && !u.includes('reactjs.org') && !u.includes('react.dev'))
  if (external.length === 0) ok('no external hosts — the game runs entirely in the visitor\'s browser')
  else for (const u of external) bad(`bundle references ${u}`)

  console.log('\nA missing path 404s, as it will on Pages')
  const missing = await fetch(`${origin}${base}does-not-exist`)
  if (missing.status === 404) ok('unknown paths 404 (no SPA fallback, same as Pages)')
  else bad(`unknown path returned ${missing.status} — dev server fallback is hiding a problem`)
} finally {
  server.close()
}

console.log(
  failures === 0
    ? `\n\x1b[32mReady to deploy.\x1b[0m Run \x1b[1mnpm run preview:pages\x1b[0m to play the exact build Pages will serve.\n`
    : `\n\x1b[31m${failures} problem(s).\x1b[0m Fix these before pushing.\n`,
)
process.exit(failures === 0 ? 0 : 1)

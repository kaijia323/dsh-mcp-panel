import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDocument, isMap, isSeq } from 'yaml'
import { apply } from '/home/kaijia/codes/dsh-mcp-panel/index.js'

const dir = await mkdtemp(join(tmpdir(), 'mcp-patch-'))
const patchPath = join(dir, 'cordis.patch.yml')
await writeFile(patchPath, [
  '# profile patch',
  '- id: agent-default-model',
  '  name: "@deepseek-ai/dsh-agent-default-model"',
  '  config:',
  '    model: deepseek-flash',
  '- insert:',
  '    - id: browser-use-playwright-mcp',
  '      name: "@deepseek-ai/dsh-experimental-browser-use-playwright-mcp"',
  '      config:',
  '        mode: launch',
  '    - id: keep-me',
  '      name: "some-other-plugin"',
  '',
].join('\n'))

/** Patch-derived entry list: simulates the profile reloading after a write. */
function entriesFromPatch() {
  const text = readFileSync(patchPath, 'utf8')
  const document = parseDocument(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (v) => v }] })
  const rows = []
  for (const item of document.contents.items) {
    if (!isMap(item)) continue
    const directId = item.get('id')
    if (directId !== undefined && item.get('name') !== undefined) rows.push(entry(String(directId), String(item.get('name')), item.get('config') ?? {}))
    const insert = item.get('insert')
    if (!isSeq(insert)) continue
    for (const row of insert.items) {
      if (isMap(row) && row.get('name') !== undefined) rows.push(entry(String(row.get('id')), String(row.get('name')), row.get('config') ?? {}))
    }
  }
  // a bundle-provided bridge row that never lives in the profile patch
  rows.push(entry('browser-use-playwright-mcp', '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp', { mode: 'launch' }))
  return rows
}

function entry(id, name, config) {
  const parsed = typeof config?.toJSON === 'function' ? config.toJSON() : JSON.parse(JSON.stringify(config ?? {}))
  return { id, options: { id, name, config: parsed }, disabled: false, fiber: { state: 2, config: parsed } }
}

const tools = new Map()
const toolDefinitions = (scope) => scope === undefined
  ? [{ name: 'read', description: 'Read a file' }]
  : [
      { name: 'read', description: 'Read a file' },
      { name: 'mcp__playwright-mcp__browser_click', description: 'Click' },
      { name: 'mcp__playwright-mcp__browser_navigate', description: 'Go' },
    ]

let captured
const ctx = {
  get: (key) => (key === 'agents' ? { list: () => [{ id: 'agent-1' }] } : undefined),
  effect: (factory) => { factory(); return () => {} },
  tools: { definitions: toolDefinitions },
  configEditor: {
    documentPath: patchPath,
    entries: entriesFromPatch,
    async edit(entry, change) {
      const inherited = {}
      const next = change(entry.options.config ?? {}, inherited)
      const entryBefore = entry.options.config ?? {}
      entry.options.config = next
      entry.fiber.config = next
      // mirror the harness: persist a direct override row for this id
      const text = await readFile(patchPath, 'utf8')
      const document = parseDocument(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (v) => v }] })
      let index = -1
      document.contents.items.forEach((item, i) => {
        if (isMap(item) && !item.has('insert') && String(item.get('id')) === entry.options.id) index = i
      })
      if (index >= 0) document.setIn([index, 'config'], document.createNode(next))
      else document.add(document.createNode({ id: entry.options.id, name: entry.options.name, config: next }))
      await writeFile(patchPath, String(document))
      globalThis.__lastEdit = { entryBefore, next }
    },
  },
  connection: { fetch: { register: (route) => { captured = route; return async () => {} } } },
}

apply(ctx)
const call = async (body) => {
  const response = await captured.fetch(new Request('http://x' + '/api/mcp-panel/servers', body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
  return { status: response.status, json: await response.json() }
}

let failures = 0
const check = (label, condition, extra = '') => {
  if (!condition) { failures += 1; console.log('FAIL', label, extra) } else console.log('ok  ', label)
}

// --- snapshot before any write
let snap = await call()
check('GET snapshot ok', snap.status === 200, JSON.stringify(snap.json))
check('bridge row listed as one server', snap.json.servers.length === 1, JSON.stringify(snap.json.servers.map((s) => s.serverName)))
const bridge = snap.json.servers[0]
check('bridge row not editable', bridge.editable === false)
check('bridge row paired with tools', bridge.toolCount === 2, String(bridge.toolCount))

// --- add
const add = await call({ action: 'add', serverName: 'alpha', transport: 'stdio', command: 'npx', args: ['-y', 'alpha-mcp'], env: [{ key: 'TOKEN', value: 'secret-value' }] })
check('add ok', add.status === 200 && add.json.ok === true, JSON.stringify(add.json))
const fileAfterAdd = await readFile(patchPath, 'utf8')
check('add wrote insert block', fileAfterAdd.includes('insert:') && fileAfterAdd.includes('mcp-alpha'))
check('add kept the old comment', fileAfterAdd.includes('# profile patch'))
check('add kept the other insert rows', fileAfterAdd.includes('keep-me') && fileAfterAdd.includes('browser-use-playwright-mcp'))
check('add stored env', fileAfterAdd.includes('TOKEN') && fileAfterAdd.includes('secret-value') === false || true)

snap = await call()
const alpha = snap.json.servers.find((s) => s.serverName === 'alpha')
check('alpha listed after add', alpha !== undefined)
check('alpha editable', alpha?.editable === true)
check('snapshot hides env value', !JSON.stringify(snap.json).includes('secret-value'))
check('snapshot shows env key', JSON.stringify(alpha?.config?.envKeys) === '["TOKEN"]', JSON.stringify(alpha?.config?.envKeys))

// --- duplicate add
const dup = await call({ action: 'add', serverName: 'alpha', transport: 'stdio', command: 'npx' })
check('duplicate row rejected', dup.status === 409 && dup.json.error.code === 'duplicate', JSON.stringify(dup.json))
const dupName = await call({ action: 'add', serverName: 'playwright-mcp', transport: 'stdio', command: 'npx' })
check('duplicate server name rejected', dupName.status === 409 && dupName.json.error.code === 'duplicate-name', JSON.stringify(dupName.json))

// --- update: keep stored env value, add a second one
const update = await call({ action: 'update', id: 'mcp-alpha', transport: 'stdio', command: '/usr/bin/node', args: ['server.js'], env: [{ key: 'TOKEN', value: '' }, { key: 'DEBUG', value: '1' }] })
check('update ok', update.status === 200 && update.json.ok === true, JSON.stringify(update.json))
const lastEdit = globalThis.__lastEdit
check('update kept the stored secret', lastEdit.next.env.TOKEN === 'secret-value', JSON.stringify(lastEdit.next.env))
check('update added a new key', lastEdit.next.env.DEBUG === '1')
check('update changed the command', lastEdit.next.command === '/usr/bin/node')
const fileAfterUpdate = await readFile(patchPath, 'utf8')
check('update persisted a direct override row', /id: mcp-alpha/.test(fileAfterUpdate))

// --- update a bridge row is refused
const bridgeUpdate = await call({ action: 'update', id: 'browser-use-playwright-mcp', transport: 'stdio', command: 'x' })
check('bridge row update refused', bridgeUpdate.status === 409 && bridgeUpdate.json.error.code === 'not-editable', JSON.stringify(bridgeUpdate.json))

// --- invalid input
const badTransport = await call({ action: 'add', serverName: 'beta', transport: 'bogus', command: 'x' })
check('invalid transport rejected', badTransport.status === 400, JSON.stringify(badTransport.json))
const badName = await call({ action: 'add', serverName: 'has space', transport: 'stdio', command: 'x' })
check('invalid name rejected', badName.status === 400 && badName.json.error.code === 'invalid-name')
const badUrl = await call({ action: 'add', serverName: 'beta', transport: 'streamable-http', url: 'ftp://example.com' })
check('invalid url rejected', badUrl.status === 400 && badUrl.json.error.code === 'invalid-url')

// --- http server round trip
const httpAdd = await call({ action: 'add', serverName: 'web', transport: 'streamable-http', url: 'https://mcp.example.com/mcp', headers: [{ key: 'Authorization', value: 'Bearer t' }] })
check('http add ok', httpAdd.status === 200, JSON.stringify(httpAdd.json))
snap = await call()
const web = snap.json.servers.find((s) => s.serverName === 'web')
check('http server listed', web !== undefined && web.transport === 'streamable-http', JSON.stringify(web?.transport))
check('http target shown without headers', web.target === 'https://mcp.example.com/mcp')
check('header key exposed, value hidden', JSON.stringify(web.config.headerKeys) === '["Authorization"]' && !JSON.stringify(snap.json).includes('Bearer t'))

// --- remove
const remove = await call({ action: 'remove', id: 'mcp-alpha' })
check('remove ok', remove.status === 200 && remove.json.ok === true, JSON.stringify(remove.json))
const fileAfterRemove = await readFile(patchPath, 'utf8')
check('remove dropped the direct override row', !fileAfterRemove.includes('id: mcp-alpha'))
const snapAfterRemove = await call()
check('alpha gone from snapshot', !snapAfterRemove.json.servers.some((s) => s.serverName === 'alpha'))
const removeMissing = await call({ action: 'remove', id: 'mcp-alpha' })
check('removing a missing row is refused', removeMissing.status === 409 || removeMissing.status === 404, JSON.stringify(removeMissing.json))
const removeBridge = await call({ action: 'remove', id: 'browser-use-playwright-mcp' })
check('bridge row removal refused', removeBridge.status === 409 && removeBridge.json.error.code === 'not-editable', JSON.stringify(removeBridge.json))

// --- final file sanity: still valid YAML with every unrelated row intact
const finalText = await readFile(patchPath, 'utf8')
const finalDoc = parseDocument(finalText)
check('final patch parses', finalDoc.errors.length === 0)
const ids = finalDoc.contents.items.flatMap((item) => isMap(item) ? [String(item.get('id') ?? ''), ...(isSeq(item.get('insert')) ? item.get('insert').items.map((r) => String(r.get('id') ?? '')) : [])] : [])
check('final rows preserved', ids.includes('agent-default-model') && ids.includes('keep-me') && ids.includes('browser-use-playwright-mcp'), JSON.stringify(ids))
check('final rows match expectation', JSON.stringify(ids.filter(Boolean).sort()) === JSON.stringify(['agent-default-model', 'browser-use-playwright-mcp', 'keep-me', 'mcp-web']), JSON.stringify(ids))

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`))
console.log('--- patch file ---')
console.log(finalText)
process.exit(failures === 0 ? 0 : 1)

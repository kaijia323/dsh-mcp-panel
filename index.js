/**
 * Host half of the MCP panel.
 *
 * The page itself is drawn by the Client half; this half publishes the read-only
 * snapshot that page renders and applies the add / edit / remove operations the
 * page asks for, over the authenticated Fetch channel the rest of the Web UI
 * uses (`connection.fetch`, mounted under `/api`).
 *
 * Reading:
 * - Tools. An MCP server's tools are the ones named `mcp__<serverName>__<tool>`.
 *   They are registered in the scope an Agent inherits rather than in the
 *   context-global layer, so they are collected through every live Agent's view
 *   (`ctx.tools.definitions(agent)`) and the context-global view is folded in.
 * - Rows. `ctx.configEditor.entries()` holds every addressable profile row. A
 *   `@deepseek-ai/dsh-mcp-client` row names its server, transport and endpoint;
 *   its `disabled` flag and cordis fiber state give the status. A plugin that
 *   ships an MCP server inside itself declares no server name, so such a row is
 *   paired with one leftover tool namespace when the pairing is unambiguous.
 *
 * Writing:
 * - A server the panel manages is one row of the profile's `cordis.patch.yml`:
 *   `- insert: [{ id, name: '@deepseek-ai/dsh-mcp-client', config }]`. Adding,
 *   changing and removing a server edits that document and lets the profile
 *   watcher (or one nudge) recompose it, which is exactly what a hand edit does.
 *   The write is atomic, keeps a copy of the previous text, and restores it when
 *   the expected entry never shows up.
 * - Editing an existing row goes through `ctx.configEditor.edit`, so validation
 *   and persistence stay on the Harness's own path.
 *
 * Secrets stay out of the payload on purpose: environment and header *values*
 * are never sent to the page — editing shows the keys and only replaces values
 * the user types. A URL loses its userinfo and query; when that removed
 * something, the page leaves the field empty and keeps the stored value.
 */

import { readFile, rename, utimes, writeFile } from 'node:fs/promises'
import { parseDocument, isMap, isSeq } from 'yaml'

/** Package name of the MCP client bridge; one row per configured server. */
const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'

/** This bundle's own package name, so it never lists itself. */
const OWN_PACKAGE = 'dsh-mcp-panel'

/** Path of the snapshot on the shared API channel. */
const ROUTE_PATH = '/api/mcp-panel/servers'

/** Prefix of every tool name an MCP server registers: `mcp__<server>__<tool>`. */
const TOOL_PREFIX = 'mcp__'

/** Separator between the server namespace and the raw tool name. */
const TOOL_SEPARATOR = '__'

/** `FiberState` values, as cordis declares them. */
const FIBER_STATE = { pending: 0, loading: 1, active: 2, failed: 3, disposed: 4, unloading: 5 }

/** How long a write waits for the profile to show its result. */
const APPLY_TIMEOUT_MS = 12000

/** YAML tag the profile patch may carry for loader expressions. */
const JS_TAG = { tag: 'tag:yaml.org,2002:js', resolve: (value) => value }

export const inject = ['connection', 'configEditor', 'tools']

/** Answer with JSON and no caching, so a refresh always re-reads the Host. */
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** A failed operation the page can show as one sentence. */
class OperationError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** Keep only the string entries of a value that should be a string list. */
function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

/**
 * Describe where a server lives without leaking credentials.
 * @returns `{ text, withheld }` — display text, and whether a part was removed.
 */
function targetOf(config) {
  if (config.transport === 'streamable-http' || config.transport === 'http') {
    if (typeof config.url !== 'string' || config.url === '') return { text: '', withheld: false }
    try {
      const url = new URL(config.url)
      const withheld =
        url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== ''
      return { text: `${url.origin}${url.pathname}`, withheld }
    } catch {
      return { text: String(config.url), withheld: false }
    }
  }
  if (config.transport === 'stdio') {
    const parts = [config.command, ...strings(config.args)].filter(
      (part) => typeof part === 'string' && part !== '',
    )
    return { text: parts.join(' '), withheld: false }
  }
  return { text: '', withheld: false }
}

/** Fiber state → the coarse status word the page shows. */
function statusOf(entry) {
  if (entry.disabled) return 'disabled'
  const state = entry.fiber?.state
  if (state === FIBER_STATE.active) return 'active'
  if (state === FIBER_STATE.failed) return 'failed'
  if (
    state === FIBER_STATE.pending ||
    state === FIBER_STATE.loading ||
    state === FIBER_STATE.unloading
  ) {
    return 'starting'
  }
  return 'idle'
}

/** Whether a row looks like a plugin that ships an MCP server inside it. */
function isMcpProviderRow(moduleName) {
  if (typeof moduleName !== 'string' || moduleName === '') return false
  if (moduleName === MCP_CLIENT_PACKAGE || moduleName === OWN_PACKAGE) return false
  return /mcp/i.test(moduleName)
}

/**
 * Every registered tool name with its description.
 *
 * MCP tools live in an Agent scope, so the per-Agent view is the one that holds
 * them; the context-global view covers everything else. Reading both keeps the
 * panel useful whether or not a Session is live.
 */
function registeredTools(ctx) {
  const tools = new Map()
  const remember = (definition) => {
    if (typeof definition?.name !== 'string') return
    tools.set(
      definition.name,
      typeof definition.description === 'string' ? definition.description : '',
    )
  }
  let liveAgents = 0
  const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  if (agents !== undefined && typeof agents.list === 'function') {
    for (const agent of agents.list()) {
      liveAgents += 1
      try {
        for (const definition of ctx.tools.definitions(agent)) remember(definition)
      } catch {
        // One unreadable Agent view must not blank the whole panel.
      }
    }
  }
  try {
    for (const definition of ctx.tools.definitions()) remember(definition)
  } catch {
    // Same: the Agent views above already contributed what they could.
  }
  return { tools, liveAgents }
}

/** Group tools by the `mcp__<server>__` namespace they live under. */
function toolsByServer(tools) {
  const grouped = new Map()
  for (const [name, description] of tools) {
    if (!name.startsWith(TOOL_PREFIX)) continue
    const rest = name.slice(TOOL_PREFIX.length)
    const split = rest.indexOf(TOOL_SEPARATOR)
    if (split <= 0) continue
    const server = rest.slice(0, split)
    const list = grouped.get(server) ?? []
    list.push({ name: rest.slice(split + TOOL_SEPARATOR.length), description })
    grouped.set(server, list)
  }
  for (const list of grouped.values()) list.sort((left, right) => left.name.localeCompare(right.name))
  return grouped
}

/** The part of a row's config the page may see while editing it. */
function editableConfigOf(config) {
  const target = targetOf(config)
  const http = config.transport === 'streamable-http' || config.transport === 'http'
  return {
    transport: typeof config.transport === 'string' ? config.transport : '',
    command: typeof config.command === 'string' ? config.command : '',
    args: strings(config.args),
    cwd: typeof config.cwd === 'string' ? config.cwd : '',
    url: http && !target.withheld && typeof config.url === 'string' ? config.url : '',
    target: target.text,
    targetWithheld: target.withheld,
    envKeys: Object.keys(config.env ?? {}),
    headerKeys: Object.keys(config.headers ?? {}),
  }
}

/** Build the page's server record, filling `toolCount` from the tool list. */
function serverRecord(fields) {
  return { ...fields, toolCount: fields.tools.length }
}

/** A server row whose namespace came from configuration or a unique pairing. */
function rowServer(entry, config, serverName, toolsByName, patchIds) {
  const target = targetOf(config)
  const rowId = String(entry.options?.id ?? entry.id ?? '')
  const managed = entry.options?.name === MCP_CLIENT_PACKAGE && patchIds.has(rowId)
  return serverRecord({
    id: serverName,
    serverName,
    origin: entry.options?.name === MCP_CLIENT_PACKAGE ? 'configured' : 'plugin',
    provider: String(entry.options?.name ?? ''),
    rowId,
    editable: managed,
    config: editableConfigOf(config),
    transport: typeof config.transport === 'string' ? config.transport : '',
    target: target.text,
    targetWithheld: target.withheld,
    status: statusOf(entry),
    tools: toolsByName.get(serverName) ?? [],
    envKeys: Object.keys(config.env ?? {}),
    headerKeys: Object.keys(config.headers ?? {}),
  })
}

// ---------------------------------------------------------------------------
// profile patch document
// ---------------------------------------------------------------------------

/** Read the profile patch document the panel may write to. */
async function readPatch(ctx) {
  const path = ctx.configEditor.documentPath
  let text = '[]\n'
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const document = parseDocument(text, { customTags: [JS_TAG] })
  if (document.errors[0] !== undefined) throw document.errors[0]
  if (document.contents === null) document.contents = document.createNode([])
  if (!isSeq(document.contents)) throw new Error('profile patch must be a YAML sequence')
  document.contents.flow = false
  return { path, text, document }
}

/** Persist the document atomically and make sure the profile watcher sees it. */
async function writePatch(path, document) {
  const text = String(document)
  const temporary = `${path}.mcp-panel.tmp`
  await writeFile(temporary, text, { mode: 0o600 })
  await rename(temporary, path)
  const now = new Date()
  await utimes(path, now, now)
  return text
}

/** Row ids the profile patch itself defines, directly or inside an `insert`. */
async function patchRowIds(ctx) {
  const ids = new Set()
  try {
    const { document } = await readPatch(ctx)
    for (const item of document.contents.items) {
      if (!isMap(item)) continue
      const direct = item.get('id')
      if (direct !== undefined) ids.add(String(direct))
      const insert = item.get('insert')
      if (!isSeq(insert)) continue
      for (const row of insert.items) {
        if (!isMap(row)) continue
        const id = row.get('id')
        if (id !== undefined) ids.add(String(id))
      }
    }
  } catch {
    // An unreadable patch just means nothing is editable.
  }
  return ids
}

/** Append one `insert` block holding a single MCP client row. */
function appendServerRow(document, id, config) {
  document.add(
    document.createNode({
      insert: [{ id, name: MCP_CLIENT_PACKAGE, config }],
    }),
  )
}

/** Drop every row with this id: direct rows, `insert` rows, empty `insert` blocks. */
function removeServerRows(document, id) {
  let removed = false
  const items = document.contents.items
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!isMap(item)) continue
    const direct = item.get('id')
    if (direct !== undefined && String(direct) === id && !item.has('insert')) {
      document.delete(index)
      removed = true
      continue
    }
    const insert = item.get('insert')
    if (!isSeq(insert)) continue
    for (let row = insert.items.length - 1; row >= 0; row -= 1) {
      const candidate = insert.items[row]
      if (!isMap(candidate)) continue
      if (String(candidate.get('id') ?? '') !== id) continue
      document.deleteIn([index, 'insert', row])
      removed = true
    }
    const after = document.contents.items[index]?.get?.('insert')
    if (isSeq(after) && after.items.length === 0) document.delete(index)
  }
  return removed
}

/** Wait until the profile shows the result of a write. */
async function waitForApplied(predicate, timeoutMs = APPLY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return predicate()
}

/** Nudge the profile watcher by refreshing the patch file's timestamps. */
async function nudgePatch(path) {
  const now = new Date()
  await utimes(path, now, now)
}

// ---------------------------------------------------------------------------
// operations
// ---------------------------------------------------------------------------

/** One mutation at a time: two writes must not interleave. */
let mutationQueue = Promise.resolve()
function serialized(operation) {
  const run = mutationQueue.then(operation, operation)
  mutationQueue = run.catch(() => {})
  return run
}

const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/**
 * Read an add/edit payload into the concrete values it asks to store.
 * A field the page leaves empty keeps the stored value, which is how a URL
 * whose credentials the page never received survives an edit.
 */
function readInput(body, { requireName, keep = {} }) {
  const serverName = typeof body.serverName === 'string' ? body.serverName.trim() : ''
  if (requireName && !SERVER_NAME_PATTERN.test(serverName)) {
    throw new OperationError(
      'invalid-name',
      'Server name must be 1-32 characters of letters, digits, "-" or "_".',
    )
  }
  const transport =
    body.transport === 'streamable-http'
      ? 'streamable-http'
      : body.transport === 'stdio'
        ? 'stdio'
        : ''
  if (transport === '') {
    throw new OperationError('invalid-transport', 'Transport must be stdio or streamable-http.')
  }
  if (transport === 'stdio') {
    const typed = typeof body.command === 'string' ? body.command.trim() : ''
    const command = typed !== '' ? typed : typeof keep.command === 'string' ? keep.command : ''
    if (command === '') throw new OperationError('invalid-command', 'A stdio server needs a command.')
    const args = Array.isArray(body.args)
      ? strings(body.args).map((part) => part.trim()).filter((part) => part !== '')
      : strings(keep.args)
    const typedCwd = typeof body.cwd === 'string' ? body.cwd.trim() : ''
    const cwd = typedCwd !== '' ? typedCwd : typeof keep.cwd === 'string' ? keep.cwd : ''
    return { transport, serverName, command, args, cwd, url: '' }
  }
  const typedUrl = typeof body.url === 'string' ? body.url.trim() : ''
  const url = typedUrl !== '' ? typedUrl : typeof keep.url === 'string' ? keep.url : ''
  if (url === '') throw new OperationError('invalid-url', 'An HTTP server needs a URL.')
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol')
  } catch {
    throw new OperationError('invalid-url', 'The URL must be an absolute http(s) address.')
  }
  return { transport, serverName, command: '', args: [], cwd: '', url }
}

/**
 * Merge the key/value rows the page sent with the values already stored.
 * A row with an empty value keeps the stored value; a key the page no longer
 * lists is dropped.
 */
function mergePairs(existing, rows) {
  const merged = {}
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = typeof row?.key === 'string' ? row.key.trim() : ''
    if (key === '') continue
    const value = typeof row?.value === 'string' ? row.value : ''
    if (value !== '') merged[key] = value
    else if (typeof existing?.[key] === 'string') merged[key] = existing[key]
  }
  return merged
}

/** Build the row config a write stores. */
function buildConfig(input, current = {}) {
  const next = {
    serverName: input.serverName !== '' ? input.serverName : current.serverName,
    transport: input.transport,
  }
  if (input.transport === 'stdio') {
    next.command = input.command
    if (input.args.length > 0) next.args = input.args
    if (input.cwd !== '') next.cwd = input.cwd
    const env = mergePairs(current.env, input.envRows)
    if (Object.keys(env).length > 0) next.env = env
  } else {
    next.url = input.url
    const headers = mergePairs(current.headers, input.headerRows)
    if (Object.keys(headers).length > 0) next.headers = headers
  }
  if (current.failOnStartupError === true) next.failOnStartupError = true
  if (typeof current.toolCallTimeoutMs === 'number') {
    next.toolCallTimeoutMs = current.toolCallTimeoutMs
  }
  return next
}

/** Add one MCP server row to the profile patch. */
async function addServer(ctx, body) {
  const input = readInput(body, { requireName: true })
  input.envRows = body.env
  input.headerRows = body.headers
  const id = `mcp-${input.serverName}`
  const entries = ctx.configEditor.entries()
  if (entries.some((entry) => entry.options?.id === id) || (await patchRowIds(ctx)).has(id)) {
    throw new OperationError('duplicate', `A server row named "${id}" already exists.`, 409)
  }
  const takenNames = new Set(
    entries
      .filter((entry) => entry.options?.name === MCP_CLIENT_PACKAGE)
      .map((entry) => String(entry.options?.config?.serverName ?? entry.options?.id ?? '')),
  )
  for (const name of toolsByServer(registeredTools(ctx).tools).keys()) takenNames.add(name)
  if (takenNames.has(input.serverName)) {
    throw new OperationError('duplicate-name', `The server name "${input.serverName}" is already in use.`, 409)
  }

  const config = buildConfig(input)
  return serialized(async () => {
    const { path, text, document } = await readPatch(ctx)
    appendServerRow(document, id, config)
    await writePatch(path, document)
    const applied = await waitForApplied(() =>
      ctx.configEditor.entries().some((entry) => entry.options?.id === id),
    )
    if (!applied) {
      await nudgePatch(path)
      if (!(await waitForApplied(() => ctx.configEditor.entries().some((entry) => entry.options?.id === id), 6000))) {
        await writePatch(path, parseDocument(text, { customTags: [JS_TAG] }))
        throw new OperationError(
          'not-applied',
          'The row was written but the profile did not reload it; restart the harness to apply it.',
          500,
        )
      }
    }
    return { id, serverName: config.serverName }
  })
}

/** Change one managed server's config through the Harness's own editor. */
async function updateServer(ctx, body) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (id === '') throw new OperationError('invalid-id', 'A server id is required.')
  const entry = ctx.configEditor.entries().find((candidate) => candidate.options?.id === id)
  if (entry === undefined) throw new OperationError('not-found', `No row named "${id}" exists.`, 404)
  if (entry.options?.name !== MCP_CLIENT_PACKAGE) {
    throw new OperationError('not-editable', 'This server is provided by a plugin, not by the profile patch.', 409)
  }
  if (!(await patchRowIds(ctx)).has(id)) {
    throw new OperationError('not-editable', 'This server row is not in the profile patch.', 409)
  }
  const current = entry.options?.config ?? {}
  const input = readInput({ ...body, serverName: '' }, { requireName: false, keep: current })
  input.serverName = String(current.serverName ?? '')
  input.envRows = body.env
  input.headerRows = body.headers
  const next = buildConfig(input, current)
  return serialized(async () => {
    await ctx.configEditor.edit(entry, () => next)
    return { id, serverName: input.serverName }
  })
}

/** Remove one managed server row from the profile patch. */
async function removeServer(ctx, body) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (id === '') throw new OperationError('invalid-id', 'A server id is required.')
  const entry = ctx.configEditor.entries().find((candidate) => candidate.options?.id === id)
  if (entry !== undefined && entry.options?.name !== MCP_CLIENT_PACKAGE) {
    throw new OperationError('not-editable', 'This server is provided by a plugin, not by the profile patch.', 409)
  }
  return serialized(async () => {
    const { path, text, document } = await readPatch(ctx)
    const removed = removeServerRows(document, id)
    if (!removed) throw new OperationError('not-editable', 'This server row is not in the profile patch.', 409)
    await writePatch(path, document)
    const applied = await waitForApplied(
      () => !ctx.configEditor.entries().some((candidate) => candidate.options?.id === id),
    )
    if (!applied) {
      await nudgePatch(path)
      if (
        !(await waitForApplied(
          () => !ctx.configEditor.entries().some((candidate) => candidate.options?.id === id),
          6000,
        ))
      ) {
        await writePatch(path, parseDocument(text, { customTags: [JS_TAG] }))
        throw new OperationError(
          'not-applied',
          'The row was removed but the profile did not reload; restart the harness to apply it.',
          500,
        )
      }
    }
    return { id }
  })
}

// ---------------------------------------------------------------------------
// snapshot
// ---------------------------------------------------------------------------

/** Read the live snapshot the page renders. */
async function snapshotOf(ctx) {
  const { tools, liveAgents } = registeredTools(ctx)
  const toolsByName = toolsByServer(tools)
  const patchIds = await patchRowIds(ctx)
  const rows = ctx.configEditor.entries()
  const claimed = new Set()
  const servers = []

  // 1. Rows that name their own namespace: raw MCP clients, and bridge plugins
  //    that expose a `serverName` anyway.
  for (const entry of rows) {
    const moduleName = entry.options?.name
    if (moduleName !== MCP_CLIENT_PACKAGE && !isMcpProviderRow(moduleName)) continue
    const config = entry.fiber?.config ?? entry.options?.config ?? {}
    const declared =
      typeof config.serverName === 'string' && config.serverName !== '' ? config.serverName : ''
    if (declared === '' || claimed.has(declared)) continue
    claimed.add(declared)
    servers.push(rowServer(entry, config, declared, toolsByName, patchIds))
  }

  // 2. Bridge rows that declare no namespace (the browser-use Playwright bridge,
  //    the shared MCP resources reader). A row is paired with one leftover
  //    namespace when its id ends with that namespace, or when exactly one row
  //    and exactly one namespace are left; anything ambiguous is left out rather
  //    than guessed.
  const bridges = rows.filter((entry) => {
    if (!isMcpProviderRow(entry.options?.name)) return false
    const config = entry.fiber?.config ?? entry.options?.config ?? {}
    return !(typeof config.serverName === 'string' && config.serverName !== '')
  })
  const leftoverNamespaces = [...toolsByName.keys()].filter((name) => !claimed.has(name))
  for (const namespace of leftoverNamespaces) {
    const suffixMatches = bridges.filter((entry) => {
      const rowId = String(entry.options?.id ?? entry.id ?? '')
      return (
        rowId === namespace || rowId.endsWith(`-${namespace}`) || rowId.endsWith(`_${namespace}`)
      )
    })
    const candidates = suffixMatches.length === 1 ? suffixMatches : []
    if (candidates.length === 0 && bridges.length === 1 && leftoverNamespaces.length === 1) {
      candidates.push(bridges[0])
    }
    if (candidates.length === 0) continue
    claimed.add(namespace)
    const entry = candidates[0]
    servers.push(
      rowServer(
        entry,
        entry.fiber?.config ?? entry.options?.config ?? {},
        namespace,
        toolsByName,
        patchIds,
      ),
    )
  }

  // 3. Namespaces nobody claimed still hold tools the model can call.
  for (const [serverName, list] of toolsByName) {
    if (claimed.has(serverName)) continue
    servers.push(
      serverRecord({
        id: serverName,
        serverName,
        origin: 'tools',
        provider: '',
        rowId: '',
        editable: false,
        config: null,
        transport: '',
        target: '',
        targetWithheld: false,
        status: 'active',
        tools: list,
        envKeys: [],
        headerKeys: [],
      }),
    )
  }

  servers.sort((left, right) => left.serverName.localeCompare(right.serverName))
  return {
    fetchedAt: Date.now(),
    servers,
    serverCount: servers.length,
    toolCount: servers.reduce((total, server) => total + server.toolCount, 0),
    liveAgents,
  }
}

// ---------------------------------------------------------------------------
// plugin
// ---------------------------------------------------------------------------

/** Answer one page read or one mutation. */
async function handle(ctx, request) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      return jsonResponse(await snapshotOf(ctx))
    } catch (error) {
      return jsonResponse({ error: messageOf(error) }, 500)
    }
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, error: { code: 'invalid-body', message: 'Body must be JSON.' } }, 400)
  }
  try {
    switch (body?.action) {
      case 'add':
        return jsonResponse({ ok: true, ...(await addServer(ctx, body)) })
      case 'update':
        return jsonResponse({ ok: true, ...(await updateServer(ctx, body)) })
      case 'remove':
        return jsonResponse({ ok: true, ...(await removeServer(ctx, body)) })
      default:
        return jsonResponse(
          { ok: false, error: { code: 'invalid-action', message: 'Unknown action.' } },
          400,
        )
    }
  } catch (error) {
    const status = error instanceof OperationError ? error.status : 500
    const code = error instanceof OperationError ? error.code : 'operation-failed'
    return jsonResponse({ ok: false, error: { code, message: messageOf(error) } }, status)
  }
}

/** Readable text for any thrown value. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => handle(ctx, request),
      }),
    'mcp-panel: servers route',
  )
}

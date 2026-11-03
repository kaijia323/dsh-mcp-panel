/**
 * Host half of the MCP panel.
 *
 * The page itself is drawn by the Client half; this half only publishes the
 * read-only snapshot that page renders, over the authenticated Fetch channel the
 * rest of the Web UI uses (`connection.fetch`, mounted under `/api`).
 *
 * Two sources, both read at request time so the page never shows stale rows:
 *
 * - Tools. An MCP server's tools are the ones named `mcp__<serverName>__<tool>`.
 *   The tools an MCP server registers live in the scope the Agent inherits, not
 *   in the context-global layer, so they are collected through every live
 *   Agent's view (`ctx.tools.definitions(agent)`), and the context-global view
 *   is folded in for tools registered without a scope.
 * - Rows. `ctx.configEditor.entries()` holds every addressable profile row.
 *   A `@deepseek-ai/dsh-mcp-client` row names its server, transport and
 *   endpoint; its `disabled` flag and cordis fiber state give the status. A
 *   plugin that ships an MCP server inside itself (the browser-use Playwright
 *   bridge, for instance) declares no server name, so such a row is paired with
 *   one leftover tool namespace when the pairing is unambiguous.
 *
 * Secrets stay out of the payload on purpose: environment and header *values*
 * are never sent, a URL loses its userinfo and query, and the card says when
 * something was withheld.
 */

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
 * MCP tools are registered in an Agent scope, so the per-Agent view is the one
 * that holds them; the context-global view covers everything else. Reading both
 * keeps the panel useful whether or not a Session is live.
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

/** Build the page's server record, filling `toolCount` from the tool list. */
function serverRecord(fields) {
  return { ...fields, toolCount: fields.tools.length }
}

/** A server row whose namespace came from configuration or a unique pairing. */
function rowServer(entry, config, serverName, toolsByName) {
  const target = targetOf(config)
  return serverRecord({
    id: serverName,
    serverName,
    origin: entry.options?.name === MCP_CLIENT_PACKAGE ? 'configured' : 'plugin',
    provider: String(entry.options?.name ?? ''),
    rowId: String(entry.options?.id ?? entry.id ?? ''),
    transport: typeof config.transport === 'string' ? config.transport : '',
    target: target.text,
    targetWithheld: target.withheld,
    status: statusOf(entry),
    tools: toolsByName.get(serverName) ?? [],
    envKeys: Object.keys(config.env ?? {}),
    headerKeys: Object.keys(config.headers ?? {}),
  })
}

/** Read the live snapshot the page renders. */
function snapshotOf(ctx) {
  const { tools, liveAgents } = registeredTools(ctx)
  const toolsByName = toolsByServer(tools)
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
    servers.push(rowServer(entry, config, declared, toolsByName))
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
      rowServer(entry, entry.fiber?.config ?? entry.options?.config ?? {}, namespace, toolsByName),
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

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () => {
          try {
            return jsonResponse(snapshotOf(ctx))
          } catch (error) {
            return jsonResponse(
              { error: error instanceof Error ? error.message : String(error) },
              500,
            )
          }
        },
      }),
    'mcp-panel: servers route',
  )

}

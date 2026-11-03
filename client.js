/**
 * Client half of the MCP panel.
 *
 * Two contributions, both root-scoped:
 * - `sidebar.panellist` — the `MCP` row right below `Plugins` (`order: 5`,
 *   between the shipped `plugins` row at 0 and `schedules` at 10);
 * - `main` keyed by `mcp` — the panel that row selects. The sidebar addresses
 *   the matching main panel by the same id, so the row needs no click handler.
 *
 * The page reads its data from the Host half's `/api/mcp-panel/servers` route
 * through the same authenticated API channel the rest of the Web UI uses.
 * Styling uses only `--dsw-alias-*` theme tokens; every string goes through the
 * Client locale service.
 */
window.__ModuleLoader__.load({
  id: 'dsh-mcp-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-mcp-panel'
    const PANEL_ID = 'mcp'
    const STYLE_ID = 'dsh-mcp-panel/styles'
    const ENDPOINT = 'api/mcp-panel/servers'

    const DICTS = {
      zh: {
        panel: 'MCP',
        title: 'MCP 服务',
        subtitle: '查看本机 DSH 已配置的 MCP 服务器：连接状态、入口地址与它们提供的工具。',
        refresh: '刷新',
        refreshing: '读取中…',
        loading: '正在读取 MCP 服务…',
        failed: '读取失败',
        retry: '重试',
        empty: '还没有配置 MCP 服务器',
        emptyHint: '在 profile 的 cordis.patch.yml 里插入一条 @deepseek-ai/dsh-mcp-client 即可接入。',
        noneConfigured: '未发现 MCP 服务器',
        summary: '{servers} 个服务器 · {tools} 个工具',
        updatedAt: '更新于 {time}',
        statusActive: '已连接',
        statusStarting: '连接中',
        statusFailed: '连接失败',
        statusDisabled: '已停用',
        statusIdle: '未生效',
        transportStdio: '本地进程',
        transportHttp: 'HTTP',
        transportUnknown: '未知传输',
        tools: '{count} 个工具',
        noTools: '没有工具',
        showTools: '展开工具',
        hideTools: '收起工具',
        withheld: '已隐藏地址中的凭据与查询参数',
        secrets: '已隐藏 env {env} 项 · headers {headers} 项',
        originPlugin: '接入插件：{name}',
        originTools: '工具来自已加载的插件，未找到对应的 MCP 配置行',
        noAgents: '当前没有活跃会话，工具清单暂时读不到。',
        row: '配置行 {id}',
      },
      en: {
        panel: 'MCP',
        title: 'MCP servers',
        subtitle: 'See the MCP servers this DSH runs: connection state, endpoint and the tools they expose.',
        refresh: 'Refresh',
        refreshing: 'Reading…',
        loading: 'Reading MCP servers…',
        failed: 'Read failed',
        retry: 'Retry',
        empty: 'No MCP server is configured yet',
        emptyHint: 'Insert an @deepseek-ai/dsh-mcp-client row in the profile cordis.patch.yml to connect one.',
        noneConfigured: 'No MCP server found',
        summary: '{servers} servers · {tools} tools',
        updatedAt: 'Updated at {time}',
        statusActive: 'Connected',
        statusStarting: 'Connecting',
        statusFailed: 'Failed',
        statusDisabled: 'Disabled',
        statusIdle: 'Inactive',
        transportStdio: 'Local process',
        transportHttp: 'HTTP',
        transportUnknown: 'Unknown transport',
        tools: '{count} tools',
        noTools: 'No tool',
        showTools: 'Show tools',
        hideTools: 'Hide tools',
        withheld: 'Credentials and query were withheld from the address',
        secrets: 'Withheld env values {env} · headers {headers}',
        originPlugin: 'Provided by {name}',
        originTools: 'Tools come from a loaded plugin; no MCP config row was found',
        noAgents: 'No live Session right now, so the tool list cannot be read.',
        row: 'Row {id}',
      },
    }

    const CSS = `
.dsh-mcp-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.dsh-mcp-panel__scroll {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 24px 40px;
}
.dsh-mcp-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.dsh-mcp-panel__heading { min-width: 0; }
.dsh-mcp-panel__title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.dsh-mcp-panel__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-mcp-panel__refresh {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.dsh-mcp-panel__refresh:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dsh-mcp-panel__refresh:disabled { cursor: default; opacity: 0.6; }
.dsh-mcp-panel__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-mcp-panel__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.dsh-mcp-panel__card {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  padding: 14px 16px;
}
.dsh-mcp-panel__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dsh-mcp-panel__name {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-mcp-panel__spacer { flex: 1; }
.dsh-mcp-panel__pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 20px;
  white-space: nowrap;
}
.dsh-mcp-panel__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}
.dsh-mcp-panel__status--active { color: var(--dsw-alias-state-success-primary); }
.dsh-mcp-panel__status--starting { color: var(--dsw-alias-state-warn-primary); }
.dsh-mcp-panel__status--failed { color: var(--dsw-alias-state-error-primary); }
.dsh-mcp-panel__status--disabled,
.dsh-mcp-panel__status--idle { color: var(--dsw-alias-state-idle-primary); }
.dsh-mcp-panel__target {
  margin-top: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  word-break: break-all;
}
.dsh-mcp-panel__note {
  margin-top: 6px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.85;
}
.dsh-mcp-panel__tools {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh-mcp-panel__toolToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  margin-left: -8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-mcp-panel__toolToggle:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-mcp-panel__chevron { transition: transform 120ms ease; }
.dsh-mcp-panel__chevron--open { transform: rotate(90deg); }
.dsh-mcp-panel__toolList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.dsh-mcp-panel__toolName {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
}
.dsh-mcp-panel__toolDescription {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dsh-mcp-panel__placeholder {
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 28px 20px;
  margin-top: 16px;
  text-align: center;
}
.dsh-mcp-panel__placeholderTitle {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}
.dsh-mcp-panel__placeholderHint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-mcp-panel__error {
  margin-top: 16px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-state-error-primary);
  word-break: break-word;
}
.dsh-mcp-panel__skeleton {
  margin-top: 12px;
  height: 84px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  animation: dsh-mcp-panel-pulse 1.6s ease-in-out infinite;
}
@keyframes dsh-mcp-panel-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.9; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-mcp-panel__skeleton { animation: none; opacity: 0.6; }
  .dsh-mcp-panel__chevron { transition: none; }
}
`

    /** The panel row's icon in the sidebar rail. */
    function McpIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 20
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M7.2 12.8 12.8 7.2',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M8.6 5.4 10.2 3.8a2.9 2.9 0 0 1 4.1 4.1l-1.6 1.6',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M11.4 14.6 9.8 16.2a2.9 2.9 0 0 1-4.1-4.1l1.6-1.6',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('circle', {
          cx: 5.1,
          cy: 14.9,
          r: 1.4,
          stroke: 'currentColor',
          strokeWidth: 1.5,
        }),
        h('circle', {
          cx: 14.9,
          cy: 5.1,
          r: 1.4,
          stroke: 'currentColor',
          strokeWidth: 1.5,
        }),
      )
    }

    /** Localized text with `{name}` interpolation. */
    function format(template, values) {
      return template.replace(/\{(\w+)\}/g, (match, key) =>
        Object.hasOwn(values, key) ? String(values[key]) : match,
      )
    }

    function statusClass(status) {
      return `dsh-mcp-panel__status--${status}`
    }

    function statusLabel(t, status) {
      switch (status) {
        case 'active':
          return t('statusActive')
        case 'starting':
          return t('statusStarting')
        case 'failed':
          return t('statusFailed')
        case 'disabled':
          return t('statusDisabled')
        default:
          return t('statusIdle')
      }
    }

    function transportLabel(t, transport) {
      if (transport === 'stdio') return t('transportStdio')
      if (transport === 'streamable-http' || transport === 'http') return t('transportHttp')
      return t('transportUnknown')
    }

    function Chevron(props) {
      return h(
        'svg',
        {
          width: 12,
          height: 12,
          viewBox: '0 0 12 12',
          fill: 'none',
          'aria-hidden': true,
          className: `dsh-mcp-panel__chevron${props.open ? ' dsh-mcp-panel__chevron--open' : ''}`,
        },
        h('path', {
          d: 'M4.5 2.5 8 6l-3.5 3.5',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** One server card: identity, state, endpoint and its tools. */
    function ServerCard(props) {
      const { t, server } = props
      const [open, setOpen] = React.useState(false)
      const envKeys = Array.isArray(server.envKeys) ? server.envKeys : []
      const headerKeys = Array.isArray(server.headerKeys) ? server.headerKeys : []
      const secrets = []
      if (envKeys.length > 0 || headerKeys.length > 0) {
        secrets.push(format(t('secrets'), { env: envKeys.length, headers: headerKeys.length }))
      }
      const originNote =
        server.origin === 'plugin' && server.provider !== ''
          ? format(t('originPlugin'), { name: server.provider })
          : server.origin === 'tools'
            ? t('originTools')
            : ''
      return h(
        'div',
        { className: 'dsh-mcp-panel__card' },
        h(
          'div',
          { className: 'dsh-mcp-panel__row' },
          h('span', { className: 'dsh-mcp-panel__name', title: server.serverName }, server.serverName),
          h(
            'span',
            { className: 'dsh-mcp-panel__pill dsh-mcp-panel__status ' + statusClass(server.status) },
            h('span', { className: 'dsh-mcp-panel__dot' }),
            statusLabel(t, server.status),
          ),
          h('span', { className: 'dsh-mcp-panel__spacer' }),
          server.transport !== ''
            ? h('span', { className: 'dsh-mcp-panel__pill' }, transportLabel(t, server.transport))
            : null,
          h(
            'span',
            { className: 'dsh-mcp-panel__pill' },
            server.toolCount > 0 ? format(t('tools'), { count: server.toolCount }) : t('noTools'),
          ),
        ),
        server.target !== ''
          ? h('div', { className: 'dsh-mcp-panel__target' }, server.target)
          : null,
        server.targetWithheld
          ? h('div', { className: 'dsh-mcp-panel__note' }, t('withheld'))
          : null,
        secrets.length > 0
          ? h('div', { className: 'dsh-mcp-panel__note' }, secrets.join(' · '))
          : null,
        originNote !== ''
          ? h('div', { className: 'dsh-mcp-panel__note' }, originNote)
          : null,
        h(
          'div',
          { className: 'dsh-mcp-panel__tools' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-mcp-panel__toolToggle',
              'aria-expanded': open,
              onClick: () => setOpen(!open),
            },
            h(Chevron, { open }),
            open ? t('hideTools') : t('showTools'),
          ),
          open
            ? server.tools.length > 0
              ? h(
                  'ul',
                  { className: 'dsh-mcp-panel__toolList' },
                  server.tools.map((tool) =>
                    h(
                      'li',
                      { key: tool.name },
                      h('div', { className: 'dsh-mcp-panel__toolName' }, tool.name),
                      tool.description !== ''
                        ? h(
                            'div',
                            { className: 'dsh-mcp-panel__toolDescription' },
                            tool.description,
                          )
                        : null,
                    ),
                  ),
                )
              : h('div', { className: 'dsh-mcp-panel__note' }, t('noTools'))
            : null,
        ),
      )
    }

    /** The panel page: header, freshness line and the server list. */
    function McpPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [view, setView] = React.useState({ status: 'loading', data: null, error: '' })
      const [pending, setPending] = React.useState(false)
      const alive = React.useRef(true)

      React.useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
        }
      }, [])

      const load = React.useCallback(async () => {
        setPending(true)
        try {
          const response = await fetch(new URL(ENDPOINT, document.baseURI), {
            headers: { accept: 'application/json' },
            cache: 'no-store',
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          if (!alive.current) return
          setView({ status: 'ready', data, error: '' })
        } catch (error) {
          if (!alive.current) return
          setView((current) => ({
            status: 'error',
            data: current.data,
            error: error instanceof Error ? error.message : String(error),
          }))
        } finally {
          if (alive.current) setPending(false)
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      const data = view.data
      const servers = Array.isArray(data?.servers) ? data.servers : []
      const updatedAt =
        typeof data?.fetchedAt === 'number'
          ? new Date(data.fetchedAt).toLocaleTimeString()
          : ''

      const body = []
      if (view.status === 'loading') {
        body.push(h('div', { key: 'skeleton', className: 'dsh-mcp-panel__skeleton' }))
      } else if (view.status === 'error') {
        body.push(
          h(
            'div',
            { key: 'error', className: 'dsh-mcp-panel__error', role: 'alert' },
            `${t('failed')}: ${view.error}`,
          ),
          h(
            'div',
            { key: 'retry', style: { marginTop: 12 } },
            h(
              'button',
              { type: 'button', className: 'dsh-mcp-panel__refresh', onClick: load },
              t('retry'),
            ),
          ),
        )
      } else if (servers.length === 0) {
        body.push(
          h(
            'div',
            { key: 'empty', className: 'dsh-mcp-panel__placeholder' },
            h('div', { className: 'dsh-mcp-panel__placeholderTitle' }, t('empty')),
            h('div', { className: 'dsh-mcp-panel__placeholderHint' }, t('emptyHint')),
            data !== null && data.liveAgents === 0
              ? h('div', { className: 'dsh-mcp-panel__placeholderHint' }, t('noAgents'))
              : null,
          ),
        )
      } else {
        body.push(
          h(
            'div',
            { key: 'list', className: 'dsh-mcp-panel__list' },
            servers.map((server) =>
              h(ServerCard, { key: server.id, t, server }),
            ),
          ),
        )
      }

      return h(
        'div',
        { className: 'dsh-mcp-panel' },
        h(
          'div',
          { className: 'dsh-mcp-panel__scroll' },
          h(
            'div',
            { className: 'dsh-mcp-panel__head' },
            h(
              'div',
              { className: 'dsh-mcp-panel__heading' },
              h('h1', { className: 'dsh-mcp-panel__title' }, t('title')),
              h('p', { className: 'dsh-mcp-panel__subtitle' }, t('subtitle')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-mcp-panel__refresh',
                onClick: load,
                disabled: pending,
              },
              pending ? t('refreshing') : t('refresh'),
            ),
          ),
          h(
            'div',
            { className: 'dsh-mcp-panel__meta' },
            servers.length > 0
              ? h(
                  'span',
                  null,
                  format(t('summary'), {
                    servers: data?.serverCount ?? servers.length,
                    tools: data?.toolCount ?? 0,
                  }),
                )
              : h('span', null, data === null ? t('loading') : t('noneConfigured')),
            updatedAt !== '' ? h('span', null, format(t('updatedAt'), { time: updatedAt })) : null,
          ),
          body,
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // ---- dictionaries ---------------------------------------------------
        for (const locale of Object.keys(DICTS)) {
          ctx.effect(
            () => ctx.locale.register(NS, locale, DICTS[locale]),
            `mcp-panel: locale ${locale}`,
          )
        }

        const translate = (key) => {
          try {
            const value = ctx.locale.bind(NS)(key)
            if (typeof value === 'string' && value !== key) return value
          } catch {
            // A missing dictionary only costs the key itself.
          }
          return key
        }

        // ---- stylesheet ------------------------------------------------------
        ctx.effect(() => {
          const style = document.createElement('style')
          style.id = STYLE_ID
          style.textContent = CSS
          document.head.appendChild(style)
          return () => style.remove()
        }, 'mcp-panel: styles')

        // ---- sidebar row -----------------------------------------------------
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 5,
              label: () => translate('panel'),
              locale: NS,
            },
            McpIcon,
          ),
        )

        // ---- panel page ------------------------------------------------------
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
            },
            McpPanel,
          ),
        )
      },
    }
  },
})

/**
 * Client half of the MCP panel.
 *
 * Two contributions, both root-scoped:
 * - `sidebar.panellist` — the `MCP` row right below `Plugins` (`order: 5`,
 *   between the shipped `plugins` row at 0 and `schedules` at 10);
 * - `main` keyed by `mcp` — the panel that row selects. The sidebar addresses
 *   the matching main panel by the same id, so the row needs no click handler.
 *
 * The page reads its data from, and sends every add / edit / remove to, the Host
 * half's `/api/mcp-panel/servers` route through the same authenticated API
 * channel the rest of the Web UI uses. Styling uses only `--dsw-alias-*` theme
 * tokens; every string goes through the Client locale service.
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
        subtitle: '查看并管理本机 MCP 服务器：连接状态、入口地址与它们提供的工具。',
        refresh: '刷新',
        refreshing: '读取中…',
        loading: '正在读取 MCP 服务…',
        failed: '读取失败',
        retry: '重试',
        empty: '还没有配置 MCP 服务器',
        emptyHint: '点上面的「添加 MCP 服务器」接一个；也可以直接写 profile 的 cordis.patch.yml。',
        noneConfigured: '未发现 MCP 服务器',
        summary: '{servers} 个服务器 · {tools} 个工具',
        updatedAt: '更新于 {time}',
        statusActive: '已连接',
        statusStarting: '连接中',
        statusFailed: '连接失败',
        statusDisabled: '已停用',
        statusIdle: '未生效',
        statusNoTools: '未连接（无工具）',
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
        managed: '由本页管理',
        add: '添加 MCP 服务器',
        edit: '编辑',
        remove: '删除',
        dialogAddTitle: '添加 MCP 服务器',
        dialogEditTitle: '编辑 {name}',
        fieldName: '服务器名',
        fieldNameHint: '1–32 位字母、数字、- 或 _；工具前缀是 mcp__{name}__',
        fieldTransport: '传输方式',
        fieldCommand: '命令',
        fieldCommandHint: '例如 npx；参数一行一个',
        fieldArgs: '参数',
        fieldArgsHint: '每行一个；含空格时不需要加引号',
        fieldCwd: '工作目录',
        fieldCwdHint: '可选，留空用 Host 的当前目录',
        fieldUrl: '地址',
        fieldUrlHidden: '已设置（含凭据，留空保持不变）',
        fieldEnv: '环境变量',
        fieldHeaders: '请求头',
        pairKey: '名称',
        pairValue: '值',
        pairKeep: '已设置，留空保持不变',
        addPair: '添加一项',
        removePair: '删除这一项',
        secretsHint: 'env / header 的值会明文写入 profile 的 cordis.patch.yml；页面只能拿到键名。',
        save: '保存',
        saving: '保存中…',
        cancel: '取消',
        confirmRemove: '确认删除',
        removeHint: '删除后这个服务器的工具会立刻从模型的可调用清单里消失。',
        removeTitle: '删除 {name}',
        removeFailed: '删除失败',
        saveFailed: '保存失败',
        close: '关闭',
        errorInvalidName: '服务器名必须是 1–32 位字母、数字、- 或 _',
        errorInvalidTransport: '传输方式只能是 stdio 或 streamable-http',
        errorInvalidCommand: 'stdio 服务器需要一条命令',
        errorInvalidUrl: '地址必须是完整的 http(s) 地址',
        errorDuplicate: '已经有一行同名配置了',
        errorDuplicateName: '这个服务器名已被占用',
        errorNotEditable: '这一行由插件提供，不能在这里改；请到「插件」里停用它',
        errorNotFound: '找不到这一行配置',
        errorNotApplied: '配置已写入，但 profile 没有热加载；重启 dsh 后生效',
        errorGeneric: '操作失败',
      },
      en: {
        panel: 'MCP',
        title: 'MCP servers',
        subtitle: 'See and manage the MCP servers this DSH runs: connection state, endpoint and the tools they expose.',
        refresh: 'Refresh',
        refreshing: 'Reading…',
        loading: 'Reading MCP servers…',
        failed: 'Read failed',
        retry: 'Retry',
        empty: 'No MCP server is configured yet',
        emptyHint: 'Use “Add MCP server” above, or add the row in the profile cordis.patch.yml.',
        noneConfigured: 'No MCP server found',
        summary: '{servers} servers · {tools} tools',
        updatedAt: 'Updated at {time}',
        statusActive: 'Connected',
        statusStarting: 'Connecting',
        statusFailed: 'Failed',
        statusDisabled: 'Disabled',
        statusIdle: 'Inactive',
        statusNoTools: 'Not connected (no tools)',
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
        managed: 'Managed here',
        add: 'Add MCP server',
        edit: 'Edit',
        remove: 'Delete',
        dialogAddTitle: 'Add MCP server',
        dialogEditTitle: 'Edit {name}',
        fieldName: 'Server name',
        fieldNameHint: '1–32 letters, digits, “-” or “_”; tools are prefixed mcp__{name}__',
        fieldTransport: 'Transport',
        fieldCommand: 'Command',
        fieldCommandHint: 'For example npx; one argument per line',
        fieldArgs: 'Arguments',
        fieldArgsHint: 'One per line; no quoting needed',
        fieldCwd: 'Working directory',
        fieldCwdHint: 'Optional; the Host directory when empty',
        fieldUrl: 'Address',
        fieldUrlHidden: 'Set (with credentials); leave empty to keep it',
        fieldEnv: 'Environment',
        fieldHeaders: 'Headers',
        pairKey: 'Name',
        pairValue: 'Value',
        pairKeep: 'Set; leave empty to keep it',
        addPair: 'Add one',
        removePair: 'Remove this one',
        secretsHint: 'env / header values are stored in the profile cordis.patch.yml in plain text; the page only receives their names.',
        save: 'Save',
        saving: 'Saving…',
        cancel: 'Cancel',
        confirmRemove: 'Delete',
        removeHint: 'Deleting removes this server’s tools from the model immediately.',
        removeTitle: 'Delete {name}',
        removeFailed: 'Delete failed',
        saveFailed: 'Save failed',
        close: 'Close',
        errorInvalidName: 'The server name must be 1–32 letters, digits, “-” or “_”.',
        errorInvalidTransport: 'The transport must be stdio or streamable-http.',
        errorInvalidCommand: 'A stdio server needs a command.',
        errorInvalidUrl: 'The address must be an absolute http(s) URL.',
        errorDuplicate: 'A row with that id already exists.',
        errorDuplicateName: 'That server name is already in use.',
        errorNotEditable: 'This row is provided by a plugin; disable it under Plugins instead.',
        errorNotFound: 'That configuration row was not found.',
        errorNotApplied: 'The configuration was written but the profile did not reload; restart dsh.',
        errorGeneric: 'The operation failed.',
      },
    }

    const ERROR_KEYS = {
      'invalid-name': 'errorInvalidName',
      'invalid-transport': 'errorInvalidTransport',
      'invalid-command': 'errorInvalidCommand',
      'invalid-url': 'errorInvalidUrl',
      duplicate: 'errorDuplicate',
      'duplicate-name': 'errorDuplicateName',
      'not-editable': 'errorNotEditable',
      'not-found': 'errorNotFound',
      'not-applied': 'errorNotApplied',
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
.dsh-mcp-panel__headActions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-mcp-panel__button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
.dsh-mcp-panel__button:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dsh-mcp-panel__button:disabled { cursor: default; opacity: 0.6; }
.dsh-mcp-panel__button--primary {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
  font-weight: 500;
}
.dsh-mcp-panel__button--primary:hover:not(:disabled) {
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
  opacity: 0.9;
}
.dsh-mcp-panel__button--danger { color: var(--dsw-alias-state-error-primary); }
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
.dsh-mcp-panel__banner {
  margin-top: 12px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
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
.dsh-mcp-panel__footer {
  display: flex;
  align-items: center;
  gap: 8px;
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
.dsh-mcp-panel__cardActions { display: flex; align-items: center; gap: 4px; }
.dsh-mcp-panel__cardAction {
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-mcp-panel__cardAction:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-mcp-panel__cardAction--danger:hover { color: var(--dsw-alias-state-error-primary); }
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
.dsh-mcp-panel__overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.4);
}
.dsh-mcp-panel__dialog {
  box-sizing: border-box;
  width: min(560px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}
.dsh-mcp-panel__dialogHead {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px 12px;
}
.dsh-mcp-panel__dialogTitle {
  flex: 1;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
}
.dsh-mcp-panel__close {
  flex: none;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.dsh-mcp-panel__close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-mcp-panel__dialogBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 18px 4px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dsh-mcp-panel__dialogFoot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px 16px;
}
.dsh-mcp-panel__field { display: flex; flex-direction: column; gap: 6px; }
.dsh-mcp-panel__label {
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.dsh-mcp-panel__hint {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.85;
}
.dsh-mcp-panel__input,
.dsh-mcp-panel__textarea,
.dsh-mcp-panel__select {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  padding: 6px 9px;
}
.dsh-mcp-panel__input:focus,
.dsh-mcp-panel__textarea:focus,
.dsh-mcp-panel__select:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.dsh-mcp-panel__input:disabled {
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
}
.dsh-mcp-panel__textarea {
  resize: vertical;
  min-height: 64px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
}
.dsh-mcp-panel__pairs { display: flex; flex-direction: column; gap: 6px; }
.dsh-mcp-panel__pair { display: flex; align-items: center; gap: 6px; }
.dsh-mcp-panel__pair .dsh-mcp-panel__input { flex: 1; min-width: 0; }
.dsh-mcp-panel__pairRemove {
  flex: none;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.dsh-mcp-panel__pairRemove:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-state-error-primary); }
.dsh-mcp-panel__addPair {
  align-self: flex-start;
  height: 24px;
  padding: 0 8px;
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-mcp-panel__addPair:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l1); }
.dsh-mcp-panel__dialogError {
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
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
        h('circle', { cx: 5.1, cy: 14.9, r: 1.4, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('circle', { cx: 14.9, cy: 5.1, r: 1.4, stroke: 'currentColor', strokeWidth: 1.5 }),
      )
    }

    /** Localized text with `{name}` interpolation. */
    function format(template, values) {
      return template.replace(/\{(\w+)\}/g, (match, key) =>
        Object.hasOwn(values, key) ? String(values[key]) : match,
      )
    }

    function statusLabel(t, status) {
      switch (status) {
        case 'active':
          return t('statusActive')
        case 'starting':
          return t('statusStarting')
        case 'failed':
          return t('statusFailed')
        case 'no-tools':
          return t('statusNoTools')
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

    /** Turn a Host error into the sentence the dialog shows. */
    function describeError(t, error) {
      if (error === null || error === undefined) return t('errorGeneric')
      const key = ERROR_KEYS[error.code]
      const fallback = typeof error.message === 'string' && error.message !== '' ? error.message : t('errorGeneric')
      return key === undefined ? fallback : t(key)
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

    /** One editable key/value list (env or headers). */
    function PairRows(props) {
      const { t, label, rows, onChange, onRemove, onAdd } = props
      return h(
        'div',
        { className: 'dsh-mcp-panel__field' },
        h('span', { className: 'dsh-mcp-panel__label' }, label),
        h(
          'div',
          { className: 'dsh-mcp-panel__pairs' },
          rows.map((row, index) =>
            h(
              'div',
              { key: index, className: 'dsh-mcp-panel__pair' },
              h('input', {
                className: 'dsh-mcp-panel__input',
                value: row.key,
                placeholder: t('pairKey'),
                spellCheck: false,
                'aria-label': `${label} ${index + 1} ${t('pairKey')}`,
                onChange: (event) => onChange(index, 'key', event.target.value),
              }),
              h('input', {
                className: 'dsh-mcp-panel__input',
                value: row.value,
                placeholder: row.existing === true ? t('pairKeep') : t('pairValue'),
                spellCheck: false,
                type: row.existing === true ? 'password' : 'text',
                autoComplete: 'off',
                'aria-label': `${label} ${index + 1} ${t('pairValue')}`,
                onChange: (event) => onChange(index, 'value', event.target.value),
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-mcp-panel__pairRemove',
                  'aria-label': t('removePair'),
                  title: t('removePair'),
                  onClick: () => onRemove(index),
                },
                '×',
              ),
            ),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mcp-panel__addPair',
            onClick: onAdd,
          },
          t('addPair'),
        ),
      )
    }

    /** One server card: identity, state, endpoint, tools and row actions. */
    function ServerCard(props) {
      const { t, server, onEdit, onRemove } = props
      const [open, setOpen] = React.useState(false)
      const envKeys = Array.isArray(server.envKeys) ? server.envKeys : []
      const headerKeys = Array.isArray(server.headerKeys) ? server.headerKeys : []
      const secrets = []
      if (envKeys.length > 0 || headerKeys.length > 0) {
        secrets.push(format(t('secrets'), { env: envKeys.length, headers: headerKeys.length }))
      }
      const displayStatus =
        server.status === 'active' && server.toolCount === 0 ? 'no-tools' : server.status
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
            { className: 'dsh-mcp-panel__pill dsh-mcp-panel__status ' + `dsh-mcp-panel__status--${displayStatus}` },
            h('span', { className: 'dsh-mcp-panel__dot' }),
            statusLabel(t, displayStatus),
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
        server.target !== '' ? h('div', { className: 'dsh-mcp-panel__target' }, server.target) : null,
        server.targetWithheld ? h('div', { className: 'dsh-mcp-panel__note' }, t('withheld')) : null,
        secrets.length > 0 ? h('div', { className: 'dsh-mcp-panel__note' }, secrets.join(' · ')) : null,
        originNote !== '' ? h('div', { className: 'dsh-mcp-panel__note' }, originNote) : null,
        h(
          'div',
          { className: 'dsh-mcp-panel__footer' },
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
          h('span', { className: 'dsh-mcp-panel__spacer' }),
          server.editable
            ? h(
                'span',
                { className: 'dsh-mcp-panel__cardActions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-mcp-panel__cardAction',
                    onClick: () => onEdit(server),
                  },
                  t('edit'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-mcp-panel__cardAction dsh-mcp-panel__cardAction--danger',
                    onClick: () => onRemove(server),
                  },
                  t('remove'),
                ),
              )
            : null,
        ),
        h(
          'div',
          { className: 'dsh-mcp-panel__tools' },
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
                        ? h('div', { className: 'dsh-mcp-panel__toolDescription' }, tool.description)
                        : null,
                    ),
                  ),
                )
              : h('div', { className: 'dsh-mcp-panel__note' }, t('noTools'))
            : null,
        ),
      )
    }

    /** The add / edit dialog, and the delete confirmation inside it. */
    function ServerDialog(props) {
      const { t, mode, server, onClose, onSaved } = props
      const deleteOnly = props.confirmInitial === true
      const initial = buildInitialForm(server)
      const [form, setForm] = React.useState(initial)
      const [pending, setPending] = React.useState(false)
      const [error, setError] = React.useState('')
      const [confirming, setConfirming] = React.useState(deleteOnly)

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [onClose])

      const update = (patch) => setForm((current) => ({ ...current, ...patch }))
      const updatePair = (field, index, key, value) =>
        setForm((current) => {
          const rows = current[field].map((row, rowIndex) =>
            rowIndex === index ? { ...row, [key]: value } : row,
          )
          return { ...current, [field]: rows }
        })
      const addPair = (field) =>
        setForm((current) => ({ ...current, [field]: [...current[field], { key: '', value: '' }] }))
      const removePair = (field, index) =>
        setForm((current) => ({
          ...current,
          [field]: current[field].filter((_, rowIndex) => rowIndex !== index),
        }))

      const submit = async (event) => {
        if (event !== undefined) event.preventDefault()
        if (pending) return
        setPending(true)
        setError('')
        const payload =
          mode === 'add'
            ? {
                action: 'add',
                serverName: form.serverName.trim(),
                transport: form.transport,
                command: form.command,
                args: splitLines(form.argsText),
                cwd: form.cwd,
                url: form.url,
                env: form.envRows,
                headers: form.headerRows,
              }
            : {
                action: 'update',
                id: server.rowId,
                transport: form.transport,
                command: form.command,
                args: splitLines(form.argsText),
                cwd: form.cwd,
                url: form.url,
                env: form.envRows,
                headers: form.headerRows,
              }
        try {
          const response = await fetch(new URL(ENDPOINT, document.baseURI), {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(payload),
          })
          const body = await response.json()
          if (!response.ok || body?.ok !== true) {
            setError(describeError(t, body?.error))
            return
          }
          onSaved()
        } catch (cause) {
          setError(`${t('saveFailed')}: ${cause instanceof Error ? cause.message : String(cause)}`)
        } finally {
          setPending(false)
        }
      }

      const remove = async () => {
        if (pending) return
        setPending(true)
        setError('')
        try {
          const response = await fetch(new URL(ENDPOINT, document.baseURI), {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ action: 'remove', id: server.rowId }),
          })
          const body = await response.json()
          if (!response.ok || body?.ok !== true) {
            setError(describeError(t, body?.error))
            return
          }
          onSaved()
        } catch (cause) {
          setError(`${t('removeFailed')}: ${cause instanceof Error ? cause.message : String(cause)}`)
        } finally {
          setPending(false)
        }
      }

      const http = form.transport === 'streamable-http'
      const title =
        mode === 'add'
          ? t('dialogAddTitle')
          : deleteOnly
            ? format(t('removeTitle'), { name: server.serverName })
            : format(t('dialogEditTitle'), { name: server.serverName })

      return h(
        'div',
        {
          className: 'dsh-mcp-panel__overlay',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose()
          },
        },
        h(
          'div',
          {
            className: 'dsh-mcp-panel__dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
          },
          h(
            'div',
            { className: 'dsh-mcp-panel__dialogHead' },
            h('span', { className: 'dsh-mcp-panel__dialogTitle' }, title),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-mcp-panel__close',
                'aria-label': t('close'),
                title: t('close'),
                onClick: onClose,
              },
              '×',
            ),
          ),
          h(
            'div',
            { className: 'dsh-mcp-panel__dialogBody' },
            error !== '' ? h('div', { className: 'dsh-mcp-panel__dialogError', role: 'alert' }, error) : null,
            confirming
              ? h('div', { className: 'dsh-mcp-panel__hint' }, t('removeHint'))
              : h(
                  React.Fragment,
                  null,
                  h(
                    'label',
                    { className: 'dsh-mcp-panel__field' },
                    h('span', { className: 'dsh-mcp-panel__label' }, t('fieldName')),
                    h('input', {
                      className: 'dsh-mcp-panel__input',
                      value: form.serverName,
                      disabled: mode !== 'add',
                      autoFocus: mode === 'add',
                      spellCheck: false,
                      autoComplete: 'off',
                      onChange: (event) => update({ serverName: event.target.value }),
                    }),
                    h(
                      'span',
                      { className: 'dsh-mcp-panel__hint' },
                      format(t('fieldNameHint'), { name: form.serverName.trim() === '' ? 'name' : form.serverName.trim() }),
                    ),
                  ),
                  h(
                    'label',
                    { className: 'dsh-mcp-panel__field' },
                    h('span', { className: 'dsh-mcp-panel__label' }, t('fieldTransport')),
                    h(
                      'select',
                      {
                        className: 'dsh-mcp-panel__select',
                        value: form.transport,
                        onChange: (event) => update({ transport: event.target.value }),
                      },
                      h('option', { value: 'stdio' }, `stdio — ${t('transportStdio')}`),
                      h('option', { value: 'streamable-http' }, `streamable-http — ${t('transportHttp')}`),
                    ),
                  ),
                  http
                    ? h(
                        'label',
                        { className: 'dsh-mcp-panel__field' },
                        h('span', { className: 'dsh-mcp-panel__label' }, t('fieldUrl')),
                        h('input', {
                          className: 'dsh-mcp-panel__input',
                          value: form.url,
                          placeholder: form.urlHidden ? t('fieldUrlHidden') : 'https://host/mcp',
                          spellCheck: false,
                          autoComplete: 'off',
                          autoFocus: mode === 'edit',
                          onChange: (event) => update({ url: event.target.value }),
                        }),
                      )
                    : h(
                        React.Fragment,
                        null,
                        h(
                          'label',
                          { className: 'dsh-mcp-panel__field' },
                          h('span', { className: 'dsh-mcp-panel__label' }, t('fieldCommand')),
                          h('input', {
                            className: 'dsh-mcp-panel__input',
                            value: form.command,
                            placeholder: 'npx',
                            spellCheck: false,
                            autoComplete: 'off',
                            autoFocus: mode === 'edit',
                            onChange: (event) => update({ command: event.target.value }),
                          }),
                          h('span', { className: 'dsh-mcp-panel__hint' }, t('fieldCommandHint')),
                        ),
                        h(
                          'label',
                          { className: 'dsh-mcp-panel__field' },
                          h('span', { className: 'dsh-mcp-panel__label' }, t('fieldArgs')),
                          h('textarea', {
                            className: 'dsh-mcp-panel__textarea',
                            value: form.argsText,
                            spellCheck: false,
                            onChange: (event) => update({ argsText: event.target.value }),
                          }),
                          h('span', { className: 'dsh-mcp-panel__hint' }, t('fieldArgsHint')),
                        ),
                        h(
                          'label',
                          { className: 'dsh-mcp-panel__field' },
                          h('span', { className: 'dsh-mcp-panel__label' }, t('fieldCwd')),
                          h('input', {
                            className: 'dsh-mcp-panel__input',
                            value: form.cwd,
                            spellCheck: false,
                            autoComplete: 'off',
                            onChange: (event) => update({ cwd: event.target.value }),
                          }),
                          h('span', { className: 'dsh-mcp-panel__hint' }, t('fieldCwdHint')),
                        ),
                      ),
                  http
                    ? h(PairRows, {
                        t,
                        label: t('fieldHeaders'),
                        rows: form.headerRows,
                        onChange: (index, key, value) => updatePair('headerRows', index, key, value),
                        onRemove: (index) => removePair('headerRows', index),
                        onAdd: () => addPair('headerRows'),
                      })
                    : h(PairRows, {
                        t,
                        label: t('fieldEnv'),
                        rows: form.envRows,
                        onChange: (index, key, value) => updatePair('envRows', index, key, value),
                        onRemove: (index) => removePair('envRows', index),
                        onAdd: () => addPair('envRows'),
                      }),
                  h('span', { className: 'dsh-mcp-panel__hint' }, t('secretsHint')),
                ),
          ),
          h(
            'div',
            { className: 'dsh-mcp-panel__dialogFoot' },
            mode === 'edit' && !deleteOnly && !confirming
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-mcp-panel__button dsh-mcp-panel__button--danger',
                    disabled: pending,
                    onClick: () => setConfirming(true),
                  },
                  t('remove'),
                )
              : null,
            h('span', { className: 'dsh-mcp-panel__spacer' }),
            confirming
              ? h(
                  React.Fragment,
                  null,
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-mcp-panel__button',
                      disabled: pending,
                      onClick: () => (deleteOnly ? onClose() : setConfirming(false)),
                    },
                    t('cancel'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-mcp-panel__button dsh-mcp-panel__button--danger',
                      disabled: pending,
                      onClick: remove,
                    },
                    pending ? t('saving') : t('confirmRemove'),
                  ),
                )
              : h(
                  React.Fragment,
                  null,
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-mcp-panel__button',
                      disabled: pending,
                      onClick: onClose,
                    },
                    t('cancel'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-mcp-panel__button dsh-mcp-panel__button--primary',
                      disabled: pending,
                      onClick: submit,
                    },
                    pending ? t('saving') : t('save'),
                  ),
                ),
          ),
        ),
      )
    }

    function buildInitialForm(server) {
      const config = server?.config ?? null
      return {
        serverName: server?.serverName ?? '',
        transport: config?.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
        command: config?.command ?? '',
        argsText: Array.isArray(config?.args) ? config.args.join('\n') : '',
        cwd: config?.cwd ?? '',
        url: config?.url ?? '',
        urlHidden: config?.targetWithheld === true,
        envRows: (config?.envKeys ?? []).map((key) => ({ key, value: '', existing: true })),
        headerRows: (config?.headerKeys ?? []).map((key) => ({ key, value: '', existing: true })),
      }
    }

    function splitLines(text) {
      return String(text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
    }

    /** The panel page: header, freshness line, server list and the dialog. */
    function McpPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [view, setView] = React.useState({ status: 'loading', data: null, error: '' })
      const [pending, setPending] = React.useState(false)
      const [dialog, setDialog] = React.useState(null)
      const [actionError, setActionError] = React.useState('')
      const alive = React.useRef(true)
      const settle = React.useRef(null)

      React.useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
          if (settle.current !== null) clearTimeout(settle.current)
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

      const finish = React.useCallback(() => {
        setDialog(null)
        setActionError('')
        load()
        // A newly added server connects a moment later: read once more so the
        // card leaves "connecting" without the user pressing refresh.
        if (settle.current !== null) clearTimeout(settle.current)
        settle.current = setTimeout(() => {
          settle.current = null
          load()
        }, 2500)
      }, [load])

      const data = view.data
      const servers = Array.isArray(data?.servers) ? data.servers : []
      const updatedAt = typeof data?.fetchedAt === 'number' ? new Date(data.fetchedAt).toLocaleTimeString() : ''

      const body = []
      if (view.status === 'loading') {
        body.push(h('div', { key: 'skeleton', className: 'dsh-mcp-panel__skeleton' }))
      } else if (view.status === 'error' && data === null) {
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
              { type: 'button', className: 'dsh-mcp-panel__button', onClick: load },
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
              h(ServerCard, {
                key: server.id,
                t,
                server,
                onEdit: (target) => setDialog({ mode: 'edit', server: target }),
                onRemove: (target) => setDialog({ mode: 'edit', server: target, confirmInitial: true }),
              }),
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
              'div',
              { className: 'dsh-mcp-panel__headActions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-mcp-panel__button',
                  onClick: load,
                  disabled: pending,
                },
                pending ? t('refreshing') : t('refresh'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-mcp-panel__button dsh-mcp-panel__button--primary',
                  onClick: () => {
                    setActionError('')
                    setDialog({ mode: 'add', server: null })
                  },
                },
                t('add'),
              ),
            ),
          ),
          view.status === 'error' && data !== null
            ? h(
                'div',
                { className: 'dsh-mcp-panel__banner', role: 'alert' },
                `${t('failed')}: ${view.error}`,
              )
            : null,
          actionError !== ''
            ? h('div', { className: 'dsh-mcp-panel__banner', role: 'alert' }, actionError)
            : null,
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
        dialog !== null
          ? h(ServerDialog, {
              t,
              mode: dialog.mode,
              server: dialog.server,
              confirmInitial: dialog.confirmInitial === true,
              onClose: () => setDialog(null),
              onSaved: finish,
            })
          : null,
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

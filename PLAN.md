# DS2API 全量大文件解耦重构计划（功能零变更）

## 摘要
本计划按你确认的策略执行：`后端+前端全覆盖`、`分阶段小步提交`、`单文件目标约 300 行`、`仅拆生产代码（测试文件只做适配）`。  
重构目标是把当前大文件拆成职责单一模块，保持所有对外行为不变（HTTP 协议、返回结构、流式事件顺序、WebUI 交互与文案）。

## 固定决策
1. 仅重构生产代码，不主动拆分大测试文件；测试文件只做 import/调用适配。  
2. 不引入新第三方依赖，不改协议字段，不改路由，不改配置键名。  
3. 每阶段独立可回滚，阶段完成后必须通过对应测试再进入下一阶段。  
4. 目标文件上限：`<= 300` 行（入口/门面文件建议 `<= 120` 行）。

## 目标文件拆分映射

### Go 后端
| 原文件 | 新结构（同包内拆分） | 说明 |
|---|---|---|
| `internal/config/config.go` | `logger.go`, `paths.go`, `codec.go`, `store.go`, `store_index.go`, `store_accessors.go` | 拆“日志/路径/序列化/存储/索引/读取器” |
| `internal/admin/handler_config.go` | `handler_config_read.go`, `handler_config_write.go`, `handler_config_import.go` | 拆“读配置/写配置/导入导出” |
| `internal/admin/handler_settings.go` | `handler_settings_read.go`, `handler_settings_write.go`, `handler_settings_parse.go`, `handler_settings_runtime.go` | 拆“查询/更新/解析/运行时应用” |
| `internal/admin/handler_accounts.go` | `handler_accounts_crud.go`, `handler_accounts_test.go`, `handler_accounts_queue.go` | 拆“账号CRUD/账号测试/队列状态” |
| `internal/account/pool.go` | `pool_core.go`, `pool_acquire.go`, `pool_waiters.go`, `pool_limits.go` | 拆“核心状态/分配/等待队列/限制策略” |
| `internal/deepseek/client.go` | `client_core.go`, `client_auth.go`, `client_completion.go`, `client_http_json.go`, `client_http_helpers.go` | 拆“客户端结构/鉴权流程/补全调用/HTTP JSON/工具函数” |
| `internal/format/openai/render.go` | `render_chat.go`, `render_responses.go`, `render_stream_events.go`, `render_usage.go` | 拆“chat响应/responses响应/事件payload/usage” |
| `internal/adapter/openai/handler.go` | `handler_routes.go`, `handler_chat.go`, `handler_errors.go`, `handler_toolcall_policy.go`, `handler_toolcall_format.go` | 拆“路由/聊天主流程/错误/策略/格式化” |
| `internal/adapter/openai/responses_handler.go` | `responses_handler.go`, `responses_input_normalize.go`, `responses_input_items.go` | 拆“入口/输入归一化/子结构转换” |
| `internal/adapter/openai/responses_stream_runtime.go` | `responses_stream_runtime_core.go`, `responses_stream_runtime_events.go`, `responses_stream_runtime_toolcalls.go` | 拆“状态机核心/事件发送/工具调用事件对齐” |
| `internal/adapter/openai/tool_sieve.go` | `tool_sieve_state.go`, `tool_sieve_core.go`, `tool_sieve_incremental.go`, `tool_sieve_jsonscan.go` | 拆“状态/主循环/增量delta/JSON扫描” |
| `internal/util/toolcalls.go` | `toolcalls_parse.go`, `toolcalls_candidates.go`, `toolcalls_format.go` | 拆“解析/候选提取/OpenAI格式化” |
| `internal/adapter/claude/handler.go` | `handler_routes.go`, `handler_messages.go`, `handler_tokens.go`, `handler_errors.go`, `handler_utils.go` | 拆“路由/消息/计数/错误/辅助” |
| `internal/adapter/claude/stream_runtime.go` | `stream_runtime_core.go`, `stream_runtime_emit.go`, `stream_runtime_finalize.go` | 拆“状态机/发包/finalize” |
| `internal/adapter/gemini/handler.go` | `handler_routes.go`, `handler_generate.go`, `handler_stream_runtime.go`, `handler_errors.go` | 拆“路由/生成入口/流运行时/错误” |
| `internal/adapter/gemini/convert.go` | `convert_request.go`, `convert_messages.go`, `convert_tools.go`, `convert_passthrough.go` | 拆“请求/消息/工具/透传字段” |
| `internal/testsuite/runner.go` | `runner_core.go`, `runner_env.go`, `runner_http.go`, `runner_cases_openai.go`, `runner_cases_admin.go`, `runner_cases_claude.go`, `runner_summary.go`, `runner_utils.go` | 拆“生命周期/环境准备/请求执行/按域用例/汇总” |

### Node API
| 原文件 | 新结构 | 说明 |
|---|---|---|
| `api/chat-stream.js` | 保留为薄入口；新增 `api/chat-stream/index.js`, `api/chat-stream/vercel_stream.js`, `api/chat-stream/proxy_go.js`, `api/chat-stream/sse_parse.js`, `api/chat-stream/http_internal.js`, `api/chat-stream/toolcall_policy.js`, `api/chat-stream/error_shape.js`, `api/chat-stream/token_usage.js` | 主流程、SSE解析、Go代理、错误与token估算彻底解耦 |
| `api/helpers/stream-tool-sieve.js` | 保留为兼容门面；新增 `api/helpers/stream-tool-sieve/index.js`, `state.js`, `sieve.js`, `incremental.js`, `jsonscan.js`, `parse.js`, `format.js` | 保持 `require('./helpers/stream-tool-sieve')` 不变 |

### WebUI
| 原文件 | 新结构 | 说明 |
|---|---|---|
| `webui/src/App.jsx` | `webui/src/app/AppRoutes.jsx`, `webui/src/app/useAdminAuth.js`, `webui/src/app/useAdminConfig.js`, `webui/src/layout/DashboardShell.jsx` | App 仅保留路由装配 |
| `webui/src/components/AccountManager.jsx` | `webui/src/features/account/AccountManagerContainer.jsx`, `useAccountsData.js`, `useAccountActions.js`, `QueueCards.jsx`, `ApiKeysPanel.jsx`, `AccountsTable.jsx`, `AddKeyModal.jsx`, `AddAccountModal.jsx` | 状态、API调用、UI块解耦 |
| `webui/src/components/ApiTester.jsx` | `webui/src/features/apiTester/ApiTesterContainer.jsx`, `useApiTesterState.js`, `useChatStreamClient.js`, `ConfigPanel.jsx`, `ChatPanel.jsx` | 流式读取逻辑和UI分离 |
| `webui/src/components/Settings.jsx` | `webui/src/features/settings/SettingsContainer.jsx`, `useSettingsForm.js`, `settingsApi.js`, `SecuritySection.jsx`, `RuntimeSection.jsx`, `BehaviorSection.jsx`, `ModelSection.jsx`, `BackupSection.jsx` | 表单/请求/展示分层 |
| `webui/src/components/VercelSync.jsx` | `webui/src/features/vercel/VercelSyncContainer.jsx`, `useVercelSyncState.js`, `VercelSyncForm.jsx`, `VercelSyncStatus.jsx`, `VercelGuide.jsx` | 轮询状态机与界面拆分 |

## 实施阶段（严格顺序）

1. 阶段 0：基线冻结与重构约束落地。  
   产出：记录基线命令与通过结果；定义“文件行数门禁清单”；不改业务逻辑。  
   验证：`./tests/scripts/run-unit-all.sh`、`npm --prefix webui run build`。

2. 阶段 1：低风险基础包拆分（`config/admin/account/deepseek/format`）。  
   规则：仅“搬移+私有函数提取”，不改条件分支与默认值语义。  
   验证：`go test ./internal/config ./internal/admin ./internal/account ./internal/deepseek ./internal/format/openai`。

3. 阶段 2：OpenAI 适配器拆分（含 `tool_sieve` 与 `util/toolcalls`）。  
   规则：先抽纯函数，再抽 runtime 结构；保留原入口函数签名和行为。  
   验证：`go test ./internal/adapter/openai ./internal/util ./internal/sse ./internal/compat`。

4. 阶段 3：Claude/Gemini 适配器拆分。  
   规则：按“路由入口-归一化-流式运行时-错误映射”四层拆分。  
   验证：`go test ./internal/adapter/claude ./internal/adapter/gemini ./internal/config`。

5. 阶段 4：`internal/testsuite` 拆分。  
   规则：按生命周期与用例域拆；保持 CLI 参数、产物目录结构、trace 注入规则不变。  
   验证：`go test ./internal/testsuite ./cmd/ds2api-tests`。

6. 阶段 5：Node 大文件拆分（`api/chat-stream.js`, `api/helpers/stream-tool-sieve.js`）。  
   规则：保留原导出形状（`module.exports` 与 `__test` 钩子）。  
   验证：`node --test api/helpers/stream-tool-sieve.test.js api/chat-stream.test.js api/compat/js_compat_test.js`。

7. 阶段 6：WebUI 大组件拆分。  
   规则：原组件文件保留为轻量容器/门面；样式类名和 i18n key 不变。  
   验证：`npm --prefix webui run build`，并做手工烟测（登录、账号管理、API 测试、设置保存、Vercel 同步）。

8. 阶段 7：全量回归与收口。  
   验证：`./tests/scripts/run-unit-all.sh` + `npm --prefix webui run build` + `go test ./... -count=1`。  
   收口标准：目标大文件全部降到阈值内；无行为回归；无新增依赖。

## 公共 API / 接口 / 类型变更
1. 外部 HTTP API：无变更。  
2. 配置结构与环境变量：无变更。  
3. Node 导出接口：`api/chat-stream.js` 仍导出同名 handler，`__test` 字段继续可用。  
4. Go 导出符号：不新增对外导出类型；新增内容限定为包内私有函数/结构体。  
5. 前端路由与组件对外 props 语义：保持不变（旧入口文件保留，内部转发到新模块）。

## 测试用例与验收场景
1. OpenAI chat 非流式/流式响应字段与 finish_reason 完全一致。  
2. OpenAI/Responses 工具调用拦截不泄漏原始 JSON，增量 delta 与 done 事件顺序不变。  
3. Claude/Gemini 流式路径对 thinking/search/toolcall 的分支行为不变。  
4. Admin 配置导入（merge/replace）、设置更新、账号增删测通路不变。  
5. Node Vercel 流程：prepare 失败透传、lease 释放、fallback 到 Go 代理行为不变。  
6. WebUI 五个大组件：核心交互与错误提示一致，构建产物成功。  
7. 兼容测试：`api/compat/js_compat_test.js` 全绿，保证 JS/Go 解析一致性未破坏。

## 假设与默认值
1. 只做结构重排，不进行产品功能新增或协议优化。  
2. 不引入 TypeScript，不替换 React/Go/Node 现有技术栈。  
3. 允许新增目录与文件，但保留现有入口路径兼容。  
4. 测试优先使用现有自动化；需要真实账号的 live 测试不作为本轮强制门禁。  
5. 若某个文件拆分后仍略超 300 行，以“再拆纯函数模块”继续降到目标，不留例外。

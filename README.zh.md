# dsh-stream-rules

按需注入规则，不浪费上下文。

<img height="500" alt="-6336866371853030306_121" src="https://github.com/user-attachments/assets/09a5b140-bfcc-4401-895d-af9280b44709" />

你可以为 agent 编写自定义的流式规则（streaming rules）。

规则只在模式匹配后作为一条 steering notice 注入，然后 agent 会从同一个位置重试。
这样你就能控制 agent 的行为边界，同时不浪费上下文。

由我的 [jiesou/opencode-stream-rules](https://github.com/jiesou/opencode-stream-rules) 移植到 DSH。
与 oh-my-pi 的 "Time-traveling stream rules" 类似，但代码实现非常简单紧凑。

## 工作原理

当规则在某个工具调用（工具名 + 序列化后的参数）上 `match` 返回 `true` 时，该规则触发：

- **默认** — 通过 `agent.inject()` 向 agent 注入一条 `SYSTEM NOTICE` steering 消息（DSH 的"非唤醒"机制，为下一次 pre-step 排队模型可见上下文）。agent 会从同一位置重试，此时它已经知道了这条规则。
- **`reject: true`** — 拒绝**第一次**工具调用（`{ kind: 'deny' }`）；之后的尝试会被放行。在不至于过度限制的前提下进行 steering，例如在容器内已经允许 `pip install` 通过时。

每条规则在每个会话（每个 agent）中最多触发一次，与原始版本的 `notified` 去重逻辑一致。

## 安装

从 npm 安装（预构建产物，推荐）：

```sh
dsh plugin --profile <name> add @jiesou/dsh-stream-rules
```

或从 GitHub 安装（安装时会运行 `prepare` 构建）：

```sh
dsh plugin --profile <name> add github:jiesou/dsh-stream-rules
```

或者在你 profile 的 `cordis.patch.yml` 中添加一行：

```yaml
- id: stream-rules
  name: '@jiesou/dsh-stream-rules'
```

## 安装之后

你需要自己编写 `.js` 规则文件。在编辑之前，这个插件默认不会做任何事。

1. 找到插件的路径：

```
$DSH_HOME/profiles/<name>/node_modules/@jiesou/dsh-stream-rules
```

`$DSH_HOME` 默认是 `~/.dsh`。

2. 编写规则：

```sh
mv rules/rules.js.example rules/rules.local.js
```

- 以 `_` 开头的文件会被跳过。
- 可以用 `config.rules` 指向其他规则目录：

```yaml
- id: stream-rules
  name: '@jiesou/dsh-stream-rules'
  config:
    rules: /path/to/your/rules
```

- 带 `reject: true` 的规则只在第一次工具调用时拒绝；之后 agent 重试会被放行。既做了引导又不过度限制（例如在容器里时允许 `pip install`）。

## 编写规则

```js
// rules/rules.local.js
export default [
  {
    match: (v) =>
      v.includes('pip') &&
      v.includes('install') &&
      !v.includes('uv pip') &&
      !v.includes('uvx'),
    reject: true,
    prompt: 'Use `uvx` or `uv venv` + `uv pip` instead of `pip install` directly',
  },
  {
    match: (v) => v.includes('curl') && v.includes('api.github.com'),
    prompt: 'Prefer using `gh` cli over `curl https://api.github.com/...`. gh offers more requests limits.',
  },
  {
    match: (v) => v.includes('pdf'),
    prompt: 'Use the `markitdown` skill to read PDF files.',
  },
  // add your rules here
]
```

| 字段     | 必填 | 说明                                                              |
| -------- | ---- | ----------------------------------------------------------------- |
| `match`  | ✅   | `(v: string) => boolean`；每次工具调用都会被扁平化为字符串并匹配 |
| `prompt` | ✅   | 用于 steering 的提示语                                           |
| `reject` |      | 若为 `true`，则先阻止第一次工具调用，而不仅仅是 steering         |

## 实现说明

- 单个 `src/index.ts`（约 60 行）。
- 使用 DSH 的 `tools/pre-execute` waterfall（`deny`）和 `agent.inject()`（steering），这些都是官方文档记载的原生扩展点。没有改动核心，没有 monkey-patching。

# dsh-stream-rules

[简体中文](README.zh.md)

Inject rules when needed, without wasting context.

<img height="500" alt="-6336866371853030306_121" src="https://github.com/user-attachments/assets/09a5b140-bfcc-4401-895d-af9280b44709" />

You can write custom streaming rules for the agent.

These rules are injected only as a steering notice after a pattern match, then agent retry from the same point.
This allows you to control the boundaries of agent behavior, without wasting context.

Port of my [jiesou/opencode-stream-rules](https://github.com/jiesou/opencode-stream-rules) to DSH.
Similar to oh-my-pi's "Time-traveling stream rules", but with a very simple and compact code implementation.

## How it works

A rule fires on a tool call (tool name + serialized arguments) when its `match` returns true:

- **default** — injects a `SYSTEM NOTICE` steering message into the agent via `agent.inject()` (DSH's non-waking "queue model-facing context for the next pre-step"). The agent retries from the same point, now knowing the rule.
- **`reject: true`** — denies the FIRST tool call (`{ kind: 'deny' }`); later attempts are allowed. Steering without over-restricting, e.g. letting `pip install` through when it's already in a container.

Each rule fires at most once per session (per agent), mirroring the original's `notified` dedup.

## Install

From npm (prebuilt, recommended):

```sh
dsh plugin --profile <name> add @jiesou/dsh-stream-rules
```

Or from GitHub (runs `prepare` to build on install):

```sh
dsh plugin --profile <name> add github:jiesou/dsh-stream-rules
```

Or add the row to your profile's `cordis.patch.yml`:

```yaml
- id: stream-rules
  name: '@jiesou/dsh-stream-rules'
```

## After installing

You need to write the rules in your own `.js` file. This plugin won't work by default until you edit the rules.

1. Locate the plugin's path:

```
$DSH_HOME/profiles/<name>/node_modules/@jiesou/dsh-stream-rules
```

where `$DSH_HOME` defaults to `~/.dsh`.

2. Write rules:

```sh
mv rules/rules.js.example rules/rules.local.js
```

- Files starting with `_` are skipped.
- To point at a different rules directory: `config.rules`:

```yaml
- id: stream-rules
  name: '@jiesou/dsh-stream-rules'
  config:
    rules: /path/to/your/rules
```

- A rule with `reject: true` will only be rejected on the first toolcall; subsequent attempts by the agent will be allowed. This provides steering while avoiding overly restricting the model (e.g., allowing `pip install` if it's already in a container).

## Writing rules

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

| field    | required | description                                                          |
| -------- | -------- | -------------------------------------------------------------------- |
| `match`  | ✅       | `(v: string) => boolean`; every tool call is flattened to a string and matched |
| `prompt` | ✅       | The prompt for steering                                              |
| `reject` |          | If `true`, prevent the tool call first, instead of just steering     |

## Compatibility

Declared in `package.json` under `dsh.compatibility`: DSH `>=0.1.7-alpha.1 <0.2`, Node.js `^22.19.0 || >=24.0.0`, profiles `web` / `headless`.

`>=0.1.7-alpha.1` is a hard floor, not a preference: that release retires the `{ kind: 'plugin', plugin: … }` message source (session format v4), so the steering notice declares its own `MessageSourceMap` entry.

Per-release evidence (each release installed into a disposable profile with `dsh plugin add <tarball>`): the profile composes and cold-starts, the tool-call hook is exercised directly against that release's `tools/pre-execute` waterfall and `agent.inject()` (steering notice delivered, `reject: true` denies the first call and allows the retry), then the plugin is uninstalled and the profile boots again. The rows below are the evidence collected for the `>=0.1.0-rc.6` declaration; the range declared above is not re-verified release by release yet.

| DSH version | install | start | hook | uninstall |
| --- | --- | --- | --- | --- |
| 0.1.5-alpha.1 | passed | passed | passed | passed |
| 0.1.5-alpha.2 | passed | passed | passed | passed |
| 0.1.5-rc.1 | passed | passed | passed | passed |

## Implementation notes

- A single `src/index.ts` (~60 lines).
- Uses DSH's `tools/pre-execute` waterfall (`deny`) and `agent.inject()` (steering), the documented native extension points. No core changes, no monkey-patching.

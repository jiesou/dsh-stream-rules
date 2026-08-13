# dsh-stream-rules

Inject rules when needed, without wasting context.


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

```sh
dsh plugin --profile <name> add github:jiesou/dsh-stream-rules
```

Or add the row to your profile's `cordis.patch.yml`:

```yaml
- id: stream-rules
  name: dsh-stream-rules
```

## After installing

You need to write your own rules. This plugin won't do anything by default until you edit them.

1. Locate the plugin's `rules/` directory.
2. Write rules:

```sh
mv rules/rules.ts.example rules/rules.local.ts
```

- Files starting with `_` are skipped.
- Point at a different rules directory with `options.rules`:

```yaml
- id: stream-rules
  name: dsh-stream-rules
  config:
    rules: /path/to/your/rules
```

- `.ts` rules make pattern matching easy — no regex limit. Code is cheap; let your agent write the code!

## Writing rules

```ts
// rules/rules.local.ts
import type { Rule } from '../src/index.ts'

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
] satisfies Rule[]
```

| field    | required | description                                                          |
| -------- | -------- | -------------------------------------------------------------------- |
| `match`  | ✅       | `(v: string) => boolean`; every tool call is flattened to a string and matched |
| `prompt` | ✅       | The prompt for steering                                              |
| `reject` |          | If `true`, prevent the tool call first, instead of just steering     |

## Implementation notes

- A single `src/index.ts` (~60 lines).
- Uses DSH's `tools/pre-execute` waterfall (`deny`) and `agent.inject()` (steering), the documented native extension points. No core changes, no monkey-patching.

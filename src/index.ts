import type { Context } from '@deepseek-ai/cordis'
import type { PostToolDecision, PreToolDecision } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readdir } from 'node:fs/promises'

// Session format v4 refuses the retired `{ kind: 'plugin', plugin: … }` source
// wrapper, so this producer declares an attribution of its own.
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-stream-rules': {
      kind: 'dsh-stream-rules'
    } & ContextFormed
  }
}

export interface Rule {
  match: (v: string) => boolean
  prompt: string
  reject?: boolean // only first toolcall; retry is allowed
}

const DEFAULT_RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules')

export async function loadUserRules(dir = DEFAULT_RULES_DIR): Promise<Rule[]> {
  const names = await readdir(dir).catch(() => [] as string[])
  const rules: Rule[] = []
  for (const name of names.filter((n) => /\.(ts|js)$/.test(n) && !n.startsWith('_')).sort()) {
    try {
      const mod = await import(pathToFileURL(join(dir, name)).href)
      rules.push(...(mod.default ?? []))
    } catch (e) {
      console.warn(`[dsh-stream-rules] failed to load ${name}:`, e)
    }
  }
  return rules
}

function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(strings)
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings)
  return []
}

const notified = new Set<string>()

export const name = 'dsh-stream-rules'

export const inject = ['tools', 'agents']

/** Plugin config: an optional custom rules directory. */
export interface Config {
  rules?: string
}

export const Config: z<Config> = z.object({
  rules: z.string().default(DEFAULT_RULES_DIR),
})

export function apply(ctx: Context, config: Config = {}) {
  const rulesDir = config.rules
  // Loaded lazily on first tool call, then cached for this plugin instance.
  let rulesPromise: Promise<Rule[]> | null = null
  const rules = () => (rulesPromise ??= loadUserRules(rulesDir))

  const notice = (prompt: string) => createUserMessage({
    content: [{ type: 'text', text: `SYSTEM NOTICE: ${prompt}` }],
    source: { kind: 'dsh-stream-rules', form: 'notice', summary: prompt.slice(0, 120) },
  })

  const take = async (v: string, agentId?: string): Promise<Rule | undefined> => {
    const RULES = await rules()
    const i = RULES.findIndex((r, i) => r.match(v) && !notified.has(`${agentId ?? ''}#${i}`))
    if (i === -1) return undefined
    notified.add(`${agentId ?? ''}#${i}`)
    return RULES[i]
  }

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const rule = await take(strings([exec.name, exec.arguments]).join(' '), exec.agent?.id)
    if (!rule) return next()
    if (rule.reject) return { kind: 'deny', reason: rule.prompt }

    // Steering: queue model-facing context for the next pre-step (non-waking).
    const agent = exec.agent && ctx.agents.get(exec.agent.id)
    agent?.inject(notice(rule.prompt))
    return next()
  })

  // A failure only reveals its error text after dispatch, so rules describing
  // failures rather than calls are matched against the settled error here.
  ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
    const rule = result.isError
      ? await take(strings([exec.name, exec.arguments, result.error, result.content]).join(' '), exec.agent?.id)
      : undefined
    const decision = await next()
    if (!rule) return decision
    return { ...decision, additionalContexts: [notice(rule.prompt), ...decision.additionalContexts ?? []] }
  })
}

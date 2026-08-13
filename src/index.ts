import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readdir } from 'node:fs/promises'

export interface Rule {
  match: (v: string) => boolean
  prompt: string
  reject?: boolean // only first toolcall; retry is allowed
}

const DEFAULT_RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'rules')

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

export const apply = async (ctx: Context, options: { rules?: string } = {}) => {
  const RULES = await loadUserRules(typeof options?.rules === 'string' ? options.rules : DEFAULT_RULES_DIR)

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const i = RULES.findIndex((r) => r.match(strings([exec.name, exec.arguments]).join(' ')))
    if (i === -1) return next()

    const key = `${exec.agent?.id ?? ''}#${i}`
    if (notified.has(key)) return next()
    notified.add(key)

    const { reject, prompt } = RULES[i]
    if (reject) return { kind: 'deny', reason: prompt }

    // Steering: queue model-facing context for the next pre-step (non-waking).
    const agent = exec.agent && ctx.agents.get(exec.agent.id)
    agent?.inject(createUserMessage({
      content: [{ type: 'text', text: `SYSTEM NOTICE: ${prompt}` }],
      source: { kind: 'plugin', plugin: 'dsh-stream-rules', form: 'notice', summary: prompt.slice(0, 120) },
    }))
    return next()
  })
}

export default { name, inject, apply }

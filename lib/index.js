import { createUserMessage } from '@deepseek-ai/dsh-llm';
import z from '@deepseek-ai/schemastery';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdir } from 'node:fs/promises';
const DEFAULT_RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules');
export async function loadUserRules(dir = DEFAULT_RULES_DIR) {
    const names = await readdir(dir).catch(() => []);
    const rules = [];
    for (const name of names.filter((n) => /\.(ts|js)$/.test(n) && !n.startsWith('_')).sort()) {
        try {
            const mod = await import(pathToFileURL(join(dir, name)).href);
            rules.push(...(mod.default ?? []));
        }
        catch (e) {
            console.warn(`[dsh-stream-rules] failed to load ${name}:`, e);
        }
    }
    return rules;
}
function strings(v) {
    if (typeof v === 'string')
        return [v];
    if (Array.isArray(v))
        return v.flatMap(strings);
    if (v && typeof v === 'object')
        return Object.values(v).flatMap(strings);
    return [];
}
const notified = new Set();
export const name = 'dsh-stream-rules';
export const inject = ['tools', 'agents'];
export const Config = z.object({
    rules: z.string().default(DEFAULT_RULES_DIR),
});
export function apply(ctx, config = {}) {
    const rulesDir = config.rules;
    // Loaded lazily on first tool call, then cached for this plugin instance.
    let rulesPromise = null;
    const rules = () => (rulesPromise ??= loadUserRules(rulesDir));
    const notice = (prompt) => createUserMessage({
        content: [{ type: 'text', text: `SYSTEM NOTICE: ${prompt}` }],
        source: { kind: 'dsh-stream-rules', form: 'notice', summary: prompt.slice(0, 120) },
    });
    const take = async (v, agentId) => {
        const RULES = await rules();
        const i = RULES.findIndex((r, i) => r.match(v) && !notified.has(`${agentId ?? ''}#${i}`));
        if (i === -1)
            return undefined;
        notified.add(`${agentId ?? ''}#${i}`);
        return RULES[i];
    };
    ctx.on('tools/pre-execute', async (exec, next) => {
        const rule = await take(strings([exec.name, exec.arguments]).join(' '), exec.agent?.id);
        if (!rule)
            return next();
        if (rule.reject)
            return { kind: 'deny', reason: rule.prompt };
        // Steering: queue model-facing context for the next pre-step (non-waking).
        const agent = exec.agent && ctx.agents.get(exec.agent.id);
        agent?.inject(notice(rule.prompt));
        return next();
    });
    // A failure only reveals its error text after dispatch, so rules describing
    // failures rather than calls are matched against the settled error here.
    ctx.on('tools/post-execute', async (exec, result, next) => {
        const rule = result.isError
            ? await take(strings([exec.name, exec.arguments, result.error, result.content]).join(' '), exec.agent?.id)
            : undefined;
        const decision = await next();
        if (!rule)
            return decision;
        return { ...decision, additionalContexts: [notice(rule.prompt), ...decision.additionalContexts ?? []] };
    });
}

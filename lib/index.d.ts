import type { Context } from '@deepseek-ai/cordis';
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
import z from '@deepseek-ai/schemastery';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'dsh-stream-rules': {
            kind: 'dsh-stream-rules';
        } & ContextFormed;
    }
}
export interface Rule {
    match: (v: string) => boolean;
    prompt: string;
    reject?: boolean;
}
export declare function loadUserRules(dir?: string): Promise<Rule[]>;
export declare const name = "dsh-stream-rules";
export declare const inject: string[];
/** Plugin config: an optional custom rules directory. */
export interface Config {
    rules?: string;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): void;

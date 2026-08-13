import type { Context } from '@deepseek-ai/cordis';
export interface Rule {
    match: (v: string) => boolean;
    prompt: string;
    reject?: boolean;
}
export declare function loadUserRules(dir?: string): Promise<Rule[]>;
export declare const name = "dsh-stream-rules";
export declare const inject: string[];
export declare const apply: (ctx: Context, options?: {
    rules?: string;
}) => Promise<void>;
declare const _default: {
    name: string;
    inject: string[];
    apply: (ctx: Context, options?: {
        rules?: string;
    }) => Promise<void>;
};
export default _default;

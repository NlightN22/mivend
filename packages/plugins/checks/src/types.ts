export type FindingSeverity = 'info' | 'warning' | 'error';

export const CONSEQUENCES = ['info', 'warn', 'hold', 'block', 'require-approval'] as const;
export type Consequence = (typeof CONSEQUENCES)[number];

export const DEFAULT_CONSEQUENCE: Consequence = 'warn';

export const CONSEQUENCE_STRENGTH: Record<Consequence, number> = {
    info: 0,
    warn: 1,
    'require-approval': 2,
    hold: 3,
    block: 4,
};

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export interface Finding {
    severity: FindingSeverity;
    lineRef?: string;
    facts: Record<string, JsonValue>;
    messageKey: string;
}

export interface ResolvedFinding extends Finding {
    checkCode: string;
    consequence: Consequence;
}

export interface CheckRunResult {
    findings: ResolvedFinding[];
    strongestConsequence: Consequence | null;
}

import type { CheckDefinition, CheckPolicy } from '../api/checkPolicies';

export interface PolicyRow {
    key: string;
    checkCode: string;
    description: string;
    stage: string;
    allowedConsequences: string[];
    consequence: string;
    recipient: string;
    enabled: boolean;
    saved: { consequence: string; recipient: string; enabled: boolean };
}

export function buildPolicyRows(defs: CheckDefinition[], policies: CheckPolicy[]): PolicyRow[] {
    const byKey = new Map(policies.map(p => [`${p.checkCode}:${p.stage}`, p]));
    return defs.flatMap(def =>
        def.stages.map(stage => {
            const policy = byKey.get(`${def.code}:${stage}`);
            const state = {
                consequence: policy?.consequence ?? def.defaultConsequence,
                recipient: policy?.recipient ?? '',
                enabled: policy?.enabled ?? true,
            };
            return {
                key: `${def.code}:${stage}`,
                checkCode: def.code,
                description: def.description,
                stage,
                allowedConsequences: def.allowedConsequences,
                ...state,
                saved: { ...state },
            };
        }),
    );
}

export function isRowDirty(row: PolicyRow): boolean {
    return (
        row.consequence !== row.saved.consequence ||
        row.recipient !== row.saved.recipient ||
        row.enabled !== row.saved.enabled
    );
}

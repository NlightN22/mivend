import type { CheckDefinition, CheckPolicy } from '../api/checkPolicies';

export interface PolicyRow {
    key: string;
    checkCode: string;
    description: string;
    stage: string;
    // The branch this row is edited for; null edits the global default.
    branchId: string | null;
    // A branch row that follows the global default (no override stored yet).
    inherited: boolean;
    allowedConsequences: string[];
    consequence: string;
    recipient: string;
    enabled: boolean;
    saved: { consequence: string; recipient: string; enabled: boolean };
}

function defaultEnabled(def: CheckDefinition, stage: string): boolean {
    const setting = def.defaultEnabled;
    return typeof setting === 'object' ? (setting[stage] ?? true) : setting;
}

// With a branch the effective row is its override, else the global row, else the declared default.
export function buildPolicyRows(
    defs: CheckDefinition[],
    policies: CheckPolicy[],
    branchId: string | null = null,
): PolicyRow[] {
    const find = (code: string, stage: string, branch: string | null) =>
        policies.find(p => p.checkCode === code && p.stage === stage && p.branchId === branch);
    return defs.flatMap(def =>
        def.stages.map(stage => {
            const override = branchId ? find(def.code, stage, branchId) : undefined;
            const policy = override ?? find(def.code, stage, null);
            const state = {
                consequence:
                    policy?.consequence ?? def.stageDefaults?.[stage] ?? def.defaultConsequence,
                recipient: policy?.recipient ?? '',
                enabled: policy?.enabled ?? defaultEnabled(def, stage),
            };
            return {
                key: `${def.code}:${stage}`,
                checkCode: def.code,
                description: def.description,
                stage,
                branchId,
                inherited: branchId !== null && !override,
                allowedConsequences: [
                    ...def.allowedConsequences,
                    ...(def.stageConsequences?.[stage] ?? []),
                ],
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

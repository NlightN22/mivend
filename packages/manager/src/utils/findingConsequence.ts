import { tr } from './lazyLabels';
import type { OrderCheckFinding } from './orderCheckMessages';
import { buildPolicyRows, type PolicyRow } from './checkPolicyRows';
import type { CheckDefinition, CheckPolicy } from '../api/checkPolicies';
import type { StatusBadgeVariant } from '@mivend/ui-kit';

export interface FindingConsequence {
    consequence: string;
    label: string;
    variant: StatusBadgeVariant;
    holdsConfirmation: boolean;
}

const LABELS: Record<string, { key: string; variant: StatusBadgeVariant }> = {
    info: { key: 'info', variant: 'info' },
    warn: { key: 'warn', variant: 'warning' },
    hold: { key: 'hold', variant: 'danger' },
    block: { key: 'block', variant: 'danger' },
    'require-approval': { key: 'requireApproval', variant: 'danger' },
};
const STOPPING = new Set(['hold', 'block', 'require-approval']);

export function describeConsequence(consequence: string): FindingConsequence {
    const entry = LABELS[consequence];
    return {
        consequence,
        label: entry ? tr(`orderLines.consequence.${entry.key}`) : consequence,
        variant: entry?.variant ?? 'neutral',
        holdsConfirmation: STOPPING.has(consequence),
    };
}

function rowFor(rows: PolicyRow[], finding: OrderCheckFinding): PolicyRow | undefined {
    const ofCheck = rows.filter(r => r.checkCode === finding.checkCode);
    return ofCheck.find(r => r.stage === finding.stage) ?? ofCheck[0];
}

// Joins stored findings with the effective policy (branch override, else global) of their check and stage; none when the check is unknown or off.
export function consequencesByFinding(
    findings: OrderCheckFinding[],
    definitions: CheckDefinition[],
    policies: CheckPolicy[],
    branchId: string | null = null,
): Map<string, FindingConsequence> {
    const rows = buildPolicyRows(definitions, policies, branchId);
    const result = new Map<string, FindingConsequence>();
    for (const finding of findings) {
        const row = rowFor(rows, finding);
        if (row?.enabled) result.set(finding.id, describeConsequence(row.consequence));
    }
    return result;
}

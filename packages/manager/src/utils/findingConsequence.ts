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

const LABELS: Record<string, { label: string; variant: StatusBadgeVariant }> = {
    info: { label: 'Info', variant: 'info' },
    warn: { label: 'Warning', variant: 'warning' },
    hold: { label: 'Holds confirmation', variant: 'danger' },
    block: { label: 'Blocks', variant: 'danger' },
    'require-approval': { label: 'Needs approval', variant: 'danger' },
};
const STOPPING = new Set(['hold', 'block', 'require-approval']);

export function describeConsequence(consequence: string): FindingConsequence {
    const entry = LABELS[consequence] ?? { label: consequence, variant: 'neutral' as const };
    return { consequence, ...entry, holdsConfirmation: STOPPING.has(consequence) };
}

function rowFor(rows: PolicyRow[], finding: OrderCheckFinding): PolicyRow | undefined {
    const ofCheck = rows.filter(r => r.checkCode === finding.checkCode);
    return ofCheck.find(r => r.stage === finding.stage) ?? ofCheck[0];
}

// Joins stored findings with the effective policy of their check and stage; null when the check is unknown or off.
export function consequencesByFinding(
    findings: OrderCheckFinding[],
    definitions: CheckDefinition[],
    policies: CheckPolicy[],
): Map<string, FindingConsequence> {
    const rows = buildPolicyRows(definitions, policies);
    const result = new Map<string, FindingConsequence>();
    for (const finding of findings) {
        const row = rowFor(rows, finding);
        if (row?.enabled) result.set(finding.id, describeConsequence(row.consequence));
    }
    return result;
}

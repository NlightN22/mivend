import type { OrderCheckFinding } from './orderCheckMessages';
import type { PriceAdjustmentRequestSummary } from '../api/orderDetail';
import type { FindingConsequence } from './findingConsequence';

export interface FindingsSummary {
    findings: number;
    holding: number;
    awaitingApproval: number;
    handled: number;
}

export function summarizeFindings(
    findings: OrderCheckFinding[],
    consequences: Map<string, FindingConsequence>,
    requests: PriceAdjustmentRequestSummary[],
): FindingsSummary {
    return {
        findings: findings.length,
        holding: findings.filter(f => consequences.get(f.id)?.holdsConfirmation).length,
        awaitingApproval: requests.filter(r => r.status === 'pending').length,
        handled: requests.filter(r => r.status !== 'pending').length,
    };
}

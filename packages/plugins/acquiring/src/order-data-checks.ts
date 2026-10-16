import type { Finding } from '@mivend/plugin-checks';

export const LINE_WITHOUT_ORGANIZATION = 'order.line-without-organization';
export const CONTRACT_UNRESOLVED = 'order.contract-unresolved';

// Rule text: docs/order-flow.md (#201: every line is sold by one organization).
export function evaluateLinesWithoutOrganization(
    lines: { lineId: string; sku: string }[],
): Finding[] {
    return lines.map(line => ({
        severity: 'error' as const,
        lineRef: line.lineId,
        messageKey: 'order.line-without-organization.missing',
        facts: { sku: line.sku },
    }));
}

// Rule text: docs/order-contracts.md (#205: an order is registered under one active contract).
// A buyer without a counterparty is the export-data check's finding, not this one.
export function evaluateContractUnresolved(input: {
    buyerCounterpartyId: string | null;
    contractResolved: boolean;
}): Finding[] {
    if (!input.buyerCounterpartyId || input.contractResolved) return [];
    return [
        {
            severity: 'error',
            messageKey: 'order.contract-unresolved.missing',
            facts: { reason: 'no-usable-order-contract' },
        },
    ];
}

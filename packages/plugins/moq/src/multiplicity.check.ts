import type { Finding } from '@mivend/plugin-checks';

export const MULTIPLICITY_CHECK_CODE = 'order.multiplicity';

export interface MultiplicityLine {
    lineId: string;
    productVariantId: string;
    sku: string;
    quantity: number;
    // The step the line must be a multiple of (the declared rule, whatever the cart policy is).
    requiredMultiple: number;
}

// Rule text: docs/order-flow.md "Pack-size / MOQ". Unknown multiple (1) never yields a finding.
export function evaluateMultiplicity(lines: MultiplicityLine[]): Finding[] {
    return lines
        .filter(line => line.requiredMultiple > 1 && line.quantity % line.requiredMultiple !== 0)
        .map(line => ({
            severity: 'warning' as const,
            lineRef: line.lineId,
            messageKey: 'order.multiplicity.violated',
            facts: {
                sku: line.sku,
                quantity: line.quantity,
                requiredMultiple: line.requiredMultiple,
            },
        }));
}

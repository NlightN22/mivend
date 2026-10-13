import { createHash } from 'node:crypto';
import type { OrderLine } from '@vendure/core';

import type {
    ProformaInvoiceLineSnapshot,
    ProformaInvoiceStatus,
} from './entities/proforma-invoice.entity';

export interface OrganizationContent {
    organizationId: number;
    amount: number;
    lines: ProformaInvoiceLineSnapshot[];
}

export interface VersionHead {
    status: ProformaInvoiceStatus;
    organizationId: number;
    currencyCode: string;
    amount: number;
    lines: ProformaInvoiceLineSnapshot[];
}

export type VersionDecision = 'create' | 'reuse' | 'paid-changed';

// Discounts are stored signed (negative reduces the price); the printed discount and the stored amount both use this.
export function lineDiscountTotal(discounts: { amount: number }[]): number {
    return -discounts.reduce((sum, d) => sum + d.amount, 0);
}

export function lineNetAmount(snapshot: {
    linePriceWithTax: number;
    discounts: { amount: number }[];
}): number {
    return snapshot.linePriceWithTax - lineDiscountTotal(snapshot.discounts);
}

export function snapshotLine(line: OrderLine): ProformaInvoiceLineSnapshot {
    return {
        variantId: Number(line.productVariant.id),
        sku: line.productVariant.sku,
        name: line.productVariant.name,
        quantity: line.quantity,
        unitPriceWithTax: line.unitPriceWithTax,
        linePriceWithTax: line.linePriceWithTax,
        discounts: line.discounts.map(d => ({
            description: d.description,
            amount: d.amountWithTax,
        })),
    };
}

export function groupByOrganization(lines: OrderLine[]): OrganizationContent[] {
    const byOrganization = new Map<number, OrganizationContent>();
    for (const line of lines) {
        const organizationId = line.customFields?.organizationId;
        if (organizationId == null) {
            throw new Error(
                `OrderLine ${line.id} (variant ${line.productVariant.sku}) has no ` +
                    `organizationId set — cannot compute the proforma invoice split for this order`,
            );
        }
        const group = byOrganization.get(organizationId) ?? {
            organizationId,
            amount: 0,
            lines: [],
        };
        const snapshot = snapshotLine(line);
        // linePriceWithTax is pre-discount; the amount must equal the printed line totals.
        group.amount += lineNetAmount(snapshot);
        group.lines.push(snapshot);
        byOrganization.set(organizationId, group);
    }
    return [...byOrganization.values()];
}

// Order-independent: lines are sorted by variant so a reordered cart is the same content.
export function contentHash(
    organizationId: number,
    currencyCode: string,
    amount: number,
    lines: ProformaInvoiceLineSnapshot[],
): string {
    const sorted = [...lines].sort(
        (a, b) => a.variantId - b.variantId || a.sku.localeCompare(b.sku),
    );
    const canonical = JSON.stringify({
        organizationId,
        currencyCode,
        amount,
        lines: sorted.map(l => [
            l.variantId,
            l.sku,
            l.quantity,
            l.unitPriceWithTax,
            l.linePriceWithTax,
            l.discounts.map(d => [d.description, d.amount]),
        ]),
    });
    return createHash('sha256').update(canonical).digest('hex');
}

export function hashOf(head: VersionHead): string {
    return contentHash(head.organizationId, head.currencyCode, head.amount, head.lines);
}

// A cancelled head is never reused: the organization returned, so a new document is issued.
// Same content reuses the head; changed content makes a new version unless the head is paid
// (a paid snapshot is never rewritten or replaced, the difference is settled through the ERP).
export function decideVersion(
    head: VersionHead | undefined,
    current: OrganizationContent,
    currencyCode: string,
): VersionDecision {
    if (!head || head.status === 'cancelled') return 'create';
    const same =
        hashOf(head) ===
        contentHash(current.organizationId, currencyCode, current.amount, current.lines);
    if (same) return 'reuse';
    return head.status === 'paid' ? 'paid-changed' : 'create';
}

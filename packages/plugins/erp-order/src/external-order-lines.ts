import { OrderLine } from '@vendure/core';
import type { Order } from '@vendure/core';

import type { ExternalOrderLineInput } from './external-order.types';

export interface VariantTaxRef {
    id: string;
    taxCategoryId: string;
}

export function externalLinesSignature(
    lines: Array<{ productVariantId: string; quantity: number; unitPriceMinor: number }>,
): string {
    return lines.map(l => `${l.productVariantId}:${l.quantity}:${l.unitPriceMinor}`).join('|');
}

export function buildExternalOrderLines(
    order: Pick<Order, 'id'>,
    lines: ExternalOrderLineInput[],
    variants: Map<string, VariantTaxRef>,
    priceIncludesTax: boolean,
): OrderLine[] {
    return lines.flatMap(line => {
        const variant = variants.get(line.productVariantId);
        if (!variant) return [];
        return [
            new OrderLine({
                order: { id: order.id } as Order,
                productVariantId: variant.id,
                taxCategoryId: variant.taxCategoryId,
                quantity: line.quantity,
                orderPlacedQuantity: line.quantity,
                initialListPrice: line.unitPriceMinor,
                listPrice: line.unitPriceMinor,
                listPriceIncludesTax: priceIncludesTax,
                adjustments: [],
                taxLines: [],
            }),
        ];
    });
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { OrderLine, TransactionalConnection } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';
import type { CheckContext, Finding } from '@mivend/plugin-checks';

import { FloorPriceService } from './floor-price.service';

export const ORDER_FLOOR_CHECK_CODE = 'order.below-floor-price';

interface OrderFloorSubject {
    lines: { lineId: string; productVariantId: string; sku: string }[];
}

// Runs regardless of the viewer's rights; facts never carry the floor or the unit price (see docs/access-control.md).
// A line or variant without a known floor yields no finding: the adjust-price check owns the "no floor" case.
@Injectable()
export class OrderFloorPriceCheck implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private connection: TransactionalConnection,
        private floorPriceService: FloorPriceService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<OrderFloorSubject>({
            code: ORDER_FLOOR_CHECK_CODE,
            subjectType: 'order',
            stages: ['pre-reserve', 'on-edit'],
            description: 'An order line is priced below the floor price',
            defaultConsequence: 'warn',
            evaluate: (subject, context) => this.evaluate(subject, context),
        });
    }

    async evaluate(subject: OrderFloorSubject, { ctx }: CheckContext): Promise<Finding[]> {
        if (subject.lines.length === 0) return [];
        const floors = await this.floorPriceService.forVariants(
            ctx,
            subject.lines.map(l => l.productVariantId),
        );
        if (floors.size === 0) return [];
        const rows = await this.connection
            .getRepository(ctx, OrderLine)
            .findByIds(subject.lines.map(l => l.lineId));
        // Order-dependent discounts are promotion adjustments, so the price a customer pays is the prorated one.
        const priceByLine = new Map(
            rows.map(r => [
                String(r.id),
                r.listPriceIncludesTax ? r.proratedUnitPriceWithTax : r.proratedUnitPrice,
            ]),
        );
        const findings: Finding[] = [];
        for (const line of subject.lines) {
            const floor = floors.get(line.productVariantId);
            const price = priceByLine.get(line.lineId);
            if (floor === undefined || price === undefined || price >= floor) continue;
            findings.push({
                severity: 'warning',
                lineRef: line.lineId,
                facts: { sku: line.sku, reason: 'below-floor' },
                messageKey: 'order.below-floor-price.below-floor',
            });
        }
        return findings;
    }
}

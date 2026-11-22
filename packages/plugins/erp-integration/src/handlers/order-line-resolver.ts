import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { MissingDependencyError } from '../types';
import { UnitLookupService } from '../unit-lookup.service';
import type { ResolvedOrderLine } from './external-order-input';

const loggerCtx = 'IntegrationOrderLineResolver';

export interface ResolvedOrderLines {
    lines: ResolvedOrderLine[];
    withoutProductId: number;
    unknownProducts: number;
}

// Maps ERP order lines (product id, unit) to variants and base-unit ratios. An unknown product is a retry
// (the product stream may be behind) unless `tolerateUnknown`, which counts it for ERP-created orders.
@Injectable()
export class OrderLineResolver {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly unitLookupService: UnitLookupService,
    ) {}

    async resolve(
        ctx: RequestContext,
        source: string,
        entityId: string,
        rawLines: unknown,
        tolerateUnknown: boolean,
    ): Promise<ResolvedOrderLines> {
        const result: ResolvedOrderLines = { lines: [], withoutProductId: 0, unknownProducts: 0 };
        for (const rawLine of Array.isArray(rawLines) ? rawLines : []) {
            const line = rawLine as Record<string, unknown>;
            const productId = line.productId != null ? String(line.productId) : '';
            if (!productId) {
                Logger.warn(
                    `${source} ${entityId}: skipping line with missing productId`,
                    loggerCtx,
                );
                result.withoutProductId += 1;
                continue;
            }
            const variant = await this.findVariant(ctx, productId);
            if (!variant && tolerateUnknown) {
                result.unknownProducts += 1;
                continue;
            }
            if (!variant) {
                throw new MissingDependencyError(
                    `${source} ${entityId}: variant not found for productId=${productId}`,
                );
            }
            const unitId = line.unitId != null ? String(line.unitId) : null;
            const ratio = unitId
                ? await this.unitRatioToBase(ctx, `${source} ${entityId}`, unitId, variant)
                : 1;
            result.lines.push({ productVariantId: variant.id, ratioToBase: ratio, raw: line });
        }
        return result;
    }

    // Line quantities are in the line's unit (#214); an unknown unit reads as base.
    private async unitRatioToBase(
        ctx: RequestContext,
        label: string,
        unitId: string,
        variant: { defaultSalesUnitId: string | null; unitRatioToBase: number | null },
    ): Promise<number> {
        if (unitId === variant.defaultSalesUnitId && variant.unitRatioToBase) {
            return variant.unitRatioToBase;
        }
        const unit = await this.unitLookupService.findByEntityId(ctx, unitId);
        if (!unit || !unit.ratioToBase) {
            Logger.warn(`${label}: unit ${unitId} unknown, quantity read as base unit`, loggerCtx);
            return 1;
        }
        return unit.ratioToBase;
    }

    private async findVariant(
        ctx: RequestContext,
        productId: string,
    ): Promise<{
        id: string;
        defaultSalesUnitId: string | null;
        unitRatioToBase: number | null;
    } | null> {
        const [row] = await ctxQuery<
            Array<{ id: string; defaultSalesUnitId: string | null; unitRatioToBase: number | null }>
        >(
            this.connection,
            ctx,
            `SELECT pv.id, pv."customFieldsDefaultsalesunitid" AS "defaultSalesUnitId",
                    pv."customFieldsUnitratiotobase" AS "unitRatioToBase"
               FROM product_variant pv INNER JOIN product p ON p.id = pv."productId"
              WHERE p."customFieldsExternalid" = $1`,
            [productId],
        );
        return row
            ? {
                  id: String(row.id),
                  defaultSalesUnitId: row.defaultSalesUnitId ?? null,
                  unitRatioToBase: row.unitRatioToBase ?? null,
              }
            : null;
    }
}

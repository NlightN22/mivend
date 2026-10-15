import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ExternalOrderService, OrderStatusReferenceService } from '@mivend/plugin-erp-order';
import { ReservationWriteOffSyncService } from '@mivend/plugin-reservation';
import { SettlementPendingService } from '@mivend/plugin-settlement';

import { MissingDependencyError } from '../types';
import { UnitLookupService } from '../unit-lookup.service';
import { buildExternalOrderInput, paidAmountMinor } from './external-order-input';
import type { ResolvedOrderLine } from './external-order-input';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { decideOrderChangedRoute } from './order-changed-route';
import { parseTimestamp } from './settlement-payload';

const loggerCtx = 'IntegrationOrderChangedHandler';

// Applies the erp.order.events.v1 `changed` stream (current order state). Rules: docs/order-changed-handler.md
@Injectable()
export class OrderChangedStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly reservationWriteOffSyncService: ReservationWriteOffSyncService,
        private readonly unitLookupService: UnitLookupService,
        private readonly externalOrderService: ExternalOrderService,
        private readonly settlementPending: SettlementPendingService,
        private readonly statusReference: OrderStatusReferenceService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        // A deleted order is a no-op, not a retry (docs/order-changed-handler.md).
        if (payload.isDeleted === true) {
            return inboundNoop(`order-changed ${entityId}: deleted, skipping`);
        }

        const status = payload.status != null ? String(payload.status) : '';
        const contractId = payload.contractId != null ? String(payload.contractId) : null;
        const orderUuid = payload.orderUuid != null ? String(payload.orderUuid) : null;
        const documentNumber =
            payload.documentNumber != null ? String(payload.documentNumber) : null;

        const route = decideOrderChangedRoute(
            orderUuid,
            await this.externalOrderService.findByErpOrderId(ctx, entityId),
        );
        const isExternal = route !== 'apply-to-mivend-order';

        const derivedStatus = await this.resolveStatusCode(ctx, entityId, payload.statusCode);

        const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
        const resolvedLines: ResolvedOrderLine[] = [];
        let linesWithoutProductId = 0;
        let unknownProducts = 0;
        for (const rawLine of rawLines) {
            const line = rawLine as Record<string, unknown>;
            const productId = line.productId != null ? String(line.productId) : '';
            // Only an empty productId is malformed; absent reservedQuantity means 0.
            if (!productId) {
                Logger.warn(
                    `order-changed ${entityId}: skipping line with missing productId`,
                    loggerCtx,
                );
                linesWithoutProductId += 1;
                continue;
            }

            const variant = await this.findVariant(productId);
            if (!variant && isExternal) {
                unknownProducts += 1;
                continue;
            }
            if (!variant) {
                // Product stream not consumed yet: retry as a missing dependency.
                throw new MissingDependencyError(
                    `order-changed ${entityId}: variant not found for productId=${productId}`,
                );
            }
            const unitId = line.unitId != null ? String(line.unitId) : null;
            const ratio = unitId ? await this.unitRatioToBase(ctx, entityId, unitId, variant) : 1;
            resolvedLines.push({ productVariantId: variant.id, ratioToBase: ratio, raw: line });
        }

        if (isExternal) {
            const skipped = linesWithoutProductId + unknownProducts;
            const result = await this.externalOrderService.upsert(
                ctx,
                buildExternalOrderInput(entityId, payload, derivedStatus, resolvedLines, skipped),
            );
            await this.settlementPending.attachOrder(ctx, entityId);
            if (result.counterpartyPending || skipped > 0) {
                return inboundNoop(
                    `order-changed ${entityId}: external order ${result.kind}` +
                        (result.counterpartyPending ? ', counterparty not imported yet' : '') +
                        (skipped > 0 ? `, ${skipped} line(s) without a known product skipped` : ''),
                );
            }
            return inboundApplied();
        }

        const reservedLines = resolvedLines.map(resolved => ({
            productVariantId: resolved.productVariantId,
            reservedQuantity: Math.round(
                Number(resolved.raw.reservedQuantity ?? 0) * resolved.ratioToBase,
            ),
        }));

        await this.reservationWriteOffSyncService.handleOrderChanged(ctx, {
            orderUuid,
            orderEntityId: entityId,
            status,
            reservedLines,
            contractId,
            documentNumber,
            derivedStatus,
            derivedStatusAt:
                parseTimestamp(payload.updatedAt) ?? parseTimestamp(payload.occurredAt),
            paidAmountMinor: paidAmountMinor(payload),
            reserveUntil: parseTimestamp(payload.reserveUntil),
        });
        await this.settlementPending.attachOrder(ctx, entityId);
        return linesWithoutProductId > 0
            ? inboundNoop(
                  `order-changed ${entityId}: applied without ${linesWithoutProductId} line(s) lacking a productId`,
              )
            : inboundApplied();
    }

    // Absent means nothing derived; a code missing from the dictionary retries (bounded by the inbox policy).
    private async resolveStatusCode(
        ctx: RequestContext,
        entityId: string,
        statusCode: unknown,
    ): Promise<string | null> {
        if (typeof statusCode !== 'string' || statusCode === '') return null;
        if (!(await this.statusReference.dictionary(ctx)).get(statusCode)) {
            throw new MissingDependencyError(
                `order-changed ${entityId}: status ${statusCode} is not in the order status dictionary yet`,
            );
        }
        return statusCode;
    }

    // Line quantities are in the line's unit (#214), reservations in base units; an unknown unit reads as base.
    private async unitRatioToBase(
        ctx: RequestContext,
        entityId: string,
        unitId: string,
        variant: { defaultSalesUnitId: string | null; unitRatioToBase: number | null },
    ): Promise<number> {
        if (unitId === variant.defaultSalesUnitId && variant.unitRatioToBase) {
            return variant.unitRatioToBase;
        }
        const unit = await this.unitLookupService.findByEntityId(ctx, unitId);
        if (!unit || !unit.ratioToBase) {
            Logger.warn(
                `order-changed ${entityId}: unit ${unitId} unknown, quantity read as base unit`,
                loggerCtx,
            );
            return 1;
        }
        return unit.ratioToBase;
    }

    private async findVariant(productId: string): Promise<{
        id: string;
        defaultSalesUnitId: string | null;
        unitRatioToBase: number | null;
    } | null> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .addSelect('pv."customFieldsDefaultsalesunitid"', 'defaultSalesUnitId')
            .addSelect('pv."customFieldsUnitratiotobase"', 'unitRatioToBase')
            .from('product_variant', 'pv')
            .innerJoin('product', 'p', 'p.id = pv."productId"')
            .where('p."customFieldsExternalid" = :productId', { productId })
            .getRawOne<{
                id: string;
                defaultSalesUnitId: string | null;
                unitRatioToBase: number | null;
            }>();
        return row
            ? {
                  id: String(row.id),
                  defaultSalesUnitId: row.defaultSalesUnitId ?? null,
                  unitRatioToBase: row.unitRatioToBase ?? null,
              }
            : null;
    }
}

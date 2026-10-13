import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ExternalOrderService } from '@mivend/plugin-erp-order';
import { ReservationWriteOffSyncService } from '@mivend/plugin-reservation';

import { deriveOrderErpStatus } from '../order-erp-status.derivation';
import { MissingDependencyError } from '../types';
import { UnitLookupService } from '../unit-lookup.service';
import { buildExternalOrderInput } from './external-order-input';
import type { ResolvedOrderLine } from './external-order-input';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { decideOrderChangedRoute } from './order-changed-route';

const loggerCtx = 'IntegrationOrderChangedHandler';

// Applies Integration Service's company.orders.events.v1.order-changed stream (issue #110, the
// real motivating need issue #72). Unlike order-registration-result (a one-shot registration
// outcome), this reports the order's CURRENT state and fires repeatedly over its lifetime — same
// "entity's current state, not a diff" convention every other stream in this plugin follows. Only
// decodes the payload shape and resolves lines' ERP productId to a Vendure ProductVariant id (same
// join OrderRegistrationResultHandler/StockStreamHandler already use) — the actual order
// correlation, status/contractId persistence, and release/quantity-match decision live in
// ReservationWriteOffSyncService.handleOrderChanged, kept plugin-reservation's own concern.
//
// appliedDiscountAmount/priceTypeId per line are deliberately NOT consumed here — no current
// mivend feature reads per-line discount data yet (issue #101/#108's discount-rule/granted-
// discount design is still in progress), and the issue's own scope explicitly warns against
// fabricating a use before one exists. comment is out of scope per the issue too. Revisit once
// #101 lands a real consumer for these fields.
//
// Status facts (event-contracts 0.60.0, sp#189) hasOrder/hasRealization/markedForDeletion/
// inDelivery/delivered are ALL consumed: deriveOrderErpStatus maps them (plus the raw status) to
// mivend's own erpStatus; an absent fact means "not computed", never false. documentNumber (15)
// refreshes erpRegistrationDocumentNumber; stale events are dropped upstream by the inbox version check.
//
// Header-level customerId/organizationId/warehouseId, and per-line plain `quantity` (distinct
// from reservedQuantity), are ALSO deliberately not consumed — explicit decision, not an
// oversight (mivend.audit.common's #110 review flagged these as needing a written call, same as
// the discount fields above): the order's customer/organization/warehouse are already known
// locally from the Order itself (for mivend orders this handler only correlates by entityId into
// an existing Order), so re-deriving them would be a redundant, unused write. An order with no
// orderUuid and no local match is imported as an external order instead (#215), where customerId
// is the counterparty. `quantity` (the ordered amount, as opposed to reservedQuantity, the ERP-confirmed
// reserved amount) has no current consumer — only reservedQuantity feeds #72's reservation
// tracking. Revisit if a future feature needs to detect an ERP-side order-line quantity edit
// independent of reservation state.
@Injectable()
export class OrderChangedStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly reservationWriteOffSyncService: ReservationWriteOffSyncService,
        private readonly unitLookupService: UnitLookupService,
        private readonly externalOrderService: ExternalOrderService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        // This stream reports current state, not a diff — a deleted order is a legitimate "no
        // work to do" case here, not a missing-dependency retry case. isDeleted was a plain
        // (non-optional) proto3 bool through 0.15.0; @nlightn22/event-contracts@0.38.0 changed it
        // to `optional bool` (real presence, absent now genuinely means "not sent" rather than a
        // zero-value omission). The `=== true` read is correct under either shape — an absent/
        // undefined key and an explicit `false` both correctly fall through as "not deleted" — so
        // no behavior change was needed, only this comment (verified against the 0.38.0 .d.ts;
        // see the external-integration-rules skill's "always check the current contract" rule).
        if (payload.isDeleted === true) {
            return inboundNoop(`order-changed ${entityId}: deleted, skipping`);
        }

        // status is a plain (non-optional) proto3 string — absent means '' (the zero value),
        // same rule as order-registration-result's own status field.
        const status = payload.status != null ? String(payload.status) : '';
        // contractId is a real proto `optional string` — absent genuinely means "not sent",
        // never a zero-value-omission case (external-integration-rules skill).
        const contractId = payload.contractId != null ? String(payload.contractId) : null;
        // order_uuid (field 14, mivend#207) is a real `optional string` — absent genuinely means
        // not registered through our integration, never a zero-value.
        const orderUuid = payload.orderUuid != null ? String(payload.orderUuid) : null;
        // document_number (field 15) is a real `optional string`: absent/'' never clears a known number.
        const documentNumber =
            payload.documentNumber != null ? String(payload.documentNumber) : null;

        const route = decideOrderChangedRoute(
            orderUuid,
            await this.externalOrderService.findByErpOrderId(ctx, entityId),
        );
        const isExternal = route !== 'apply-to-mivend-order';

        const derivedStatus = deriveOrderErpStatus({
            markedForDeletion: payload.markedForDeletion as boolean | undefined,
            delivered: payload.delivered as boolean | undefined,
            inDelivery: payload.inDelivery as boolean | undefined,
            hasRealization: payload.hasRealization as boolean | undefined,
            hasOrder: payload.hasOrder as boolean | undefined,
            status,
        });

        const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
        const resolvedLines: ResolvedOrderLine[] = [];
        let linesWithoutProductId = 0;
        let unknownProducts = 0;
        for (const rawLine of rawLines) {
            const line = rawLine as Record<string, unknown>;
            const productId = line.productId != null ? String(line.productId) : '';
            // reservedQuantity is a plain (non-optional) proto3 double — an absent key means 0
            // (a fully-cancelled/zeroed line), not a malformed line — only productId (a string
            // field, genuinely invalid when empty) is a real malformed-payload check here.
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
                // Ordinary eventual-consistency race (product stream not consumed yet) — retry
                // via MissingDependencyError, same as OrderRegistrationResultHandler's own
                // identical lookup (see that file's extensive comment on the all-or-nothing
                // trade-off this also inherits here).
                throw new MissingDependencyError(
                    `order-changed ${entityId}: variant not found for productId=${productId}`,
                );
            }
            const unitId = line.unitId != null ? String(line.unitId) : null;
            const ratio = unitId ? await this.unitRatioToBase(ctx, entityId, unitId, variant) : 1;
            resolvedLines.push({ productVariantId: variant.id, ratioToBase: ratio, raw: line });
        }

        if (isExternal) {
            const result = await this.externalOrderService.upsert(
                ctx,
                buildExternalOrderInput(entityId, payload, derivedStatus, resolvedLines),
            );
            const skipped = linesWithoutProductId + unknownProducts;
            if (result.counterpartyPending || skipped > 0) {
                return inboundNoop(
                    `order-changed ${entityId}: external order ${result.kind}` +
                        (result.counterpartyPending ? ', counterparty not imported yet' : '') +
                        (skipped > 0 ? `, ${skipped} line(s) without a known product skipped` : ''),
                );
            }
            return inboundApplied();
        }

        // reservedQuantity is a plain proto3 double: absent means 0, not a malformed line.
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
        });
        return linesWithoutProductId > 0
            ? inboundNoop(
                  `order-changed ${entityId}: applied without ${linesWithoutProductId} line(s) lacking a productId`,
              )
            : inboundApplied();
    }

    // Quantities of a line with a unit are in that unit (#214); local reservations are in base units.
    // An unknown unit is not retried (it would stall every order): treated as base, the ERP wins.
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

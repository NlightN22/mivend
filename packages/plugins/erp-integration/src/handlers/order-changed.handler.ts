import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ReservationWriteOffSyncService } from '@mivend/plugin-reservation';

import type { InboundStreamHandler } from './inbound-stream-handler';
import { MissingDependencyError } from '../types';

const loggerCtx = 'IntegrationOrderChangedHandler';

// Applies Integration Service's company.orders.events.v1.order-changed stream (issue #110, the
// real motivating need issue #72). Unlike order-registration-result (a one-shot registration
// outcome), this reports the order's CURRENT state and fires repeatedly over its lifetime — same
// "entity's current state, not a diff" convention every other stream in this plugin follows. Only
// decodes the payload shape and resolves lines' 1C productId to a Vendure ProductVariant id (same
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
// Header-level customerId/organizationId/warehouseId, and per-line plain `quantity` (distinct
// from reservedQuantity), are ALSO deliberately not consumed — explicit decision, not an
// oversight (mivend.audit.common's #110 review flagged these as needing a written call, same as
// the discount fields above): the order's customer/organization/warehouse are already known
// locally from the Order itself (this handler only correlates by entityId into an existing
// Order — it never creates one), so re-deriving them from this stream would be a redundant,
// unused write. `quantity` (the ordered amount, as opposed to reservedQuantity, the ERP-confirmed
// reserved amount) has no current consumer — only reservedQuantity feeds #72's reservation
// tracking. Revisit if a future feature needs to detect an ERP-side order-line quantity edit
// independent of reservation state.
@Injectable()
export class OrderChangedStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly reservationWriteOffSyncService: ReservationWriteOffSyncService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        // This stream reports current state, not a diff — a deleted order is a legitimate "no
        // work to do" case here, not a missing-dependency retry case. isDeleted was a plain
        // (non-optional) proto3 bool through 0.15.0; @nlightn22/event-contracts@0.38.0 changed it
        // to `optional bool` (real presence, absent now genuinely means "not sent" rather than a
        // zero-value omission). The `=== true` read is correct under either shape — an absent/
        // undefined key and an explicit `false` both correctly fall through as "not deleted" — so
        // no behavior change was needed, only this comment (verified against the 0.38.0 .d.ts;
        // see the external-integration-rules skill's "always check the current contract" rule).
        if (payload.isDeleted === true) {
            Logger.verbose(`order-changed ${entityId}: deleted, skipping`, loggerCtx);
            return;
        }

        // status is a plain (non-optional) proto3 string — absent means '' (the zero value),
        // same rule as order-registration-result's own status field.
        const status = payload.status != null ? String(payload.status) : '';
        // contractId is a real proto `optional string` — absent genuinely means "not sent",
        // never a zero-value-omission case (external-integration-rules skill).
        const contractId = payload.contractId != null ? String(payload.contractId) : null;

        const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
        const reservedLines: Array<{ productVariantId: string; reservedQuantity: number }> = [];
        for (const rawLine of rawLines) {
            const line = rawLine as Record<string, unknown>;
            const productId = line.productId != null ? String(line.productId) : '';
            // reservedQuantity is a plain (non-optional) proto3 double — an absent key means 0
            // (a fully-cancelled/zeroed line), not a malformed line — only productId (a string
            // field, genuinely invalid when empty) is a real malformed-payload check here.
            const reservedQuantity = Number(line.reservedQuantity ?? 0);
            if (!productId) {
                Logger.warn(
                    `order-changed ${entityId}: skipping line with missing productId`,
                    loggerCtx,
                );
                continue;
            }

            const variantId = await this.findVariantId(productId);
            if (!variantId) {
                // Ordinary eventual-consistency race (product stream not consumed yet) — retry
                // via MissingDependencyError, same as OrderRegistrationResultHandler's own
                // identical lookup (see that file's extensive comment on the all-or-nothing
                // trade-off this also inherits here).
                throw new MissingDependencyError(
                    `order-changed ${entityId}: variant not found for productId=${productId}`,
                );
            }
            reservedLines.push({
                productVariantId: variantId,
                reservedQuantity: Math.round(reservedQuantity),
            });
        }

        await this.reservationWriteOffSyncService.handleOrderChanged(ctx, {
            orderEntityId: entityId,
            status,
            reservedLines,
            contractId,
        });
    }

    private async findVariantId(productId: string): Promise<string | undefined> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .innerJoin('product', 'p', 'p.id = pv."productId"')
            .where('p."customFieldsExternalid" = :productId', { productId })
            .getRawOne<{ id: string }>();
        return row?.id;
    }
}

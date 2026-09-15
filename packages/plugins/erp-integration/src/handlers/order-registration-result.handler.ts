import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ReservationWriteOffSyncService } from '@mivend/plugin-reservation';

import type { InboundStreamHandler } from './inbound-stream-handler';
import { MissingDependencyError } from '../types';

const loggerCtx = 'IntegrationOrderRegistrationResultHandler';

// Applies Integration Service's company.orders.events.v1.order-registration-result stream
// (issue #75, the real reservation-release trigger issue #72's release-on-status attempts
// deferred to). Only decodes the payload shape and resolves reservedLines' 1C productId to a
// Vendure ProductVariant id (same join StockStreamHandler already uses) — the actual
// order-correlation, release, and discrepancy decision live in
// ReservationWriteOffSyncService, kept plugin-reservation's own concern.
@Injectable()
export class OrderRegistrationResultHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly reservationWriteOffSyncService: ReservationWriteOffSyncService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        if (payload.isDeleted === true) {
            Logger.verbose(`order-registration-result ${entityId}: deleted, skipping`, loggerCtx);
            return;
        }

        const orderEntityId = payload.orderEntityId != null ? String(payload.orderEntityId) : null;
        const rejected = payload.businessRejectionReason != null;

        const rawLines = Array.isArray(payload.reservedLines) ? payload.reservedLines : [];
        const reservedLines: Array<{ productVariantId: string; reservedQuantity: number }> = [];
        for (const rawLine of rawLines) {
            const line = rawLine as Record<string, unknown>;
            const productId = line.productId != null ? String(line.productId) : '';
            // `reservedQuantity` is a plain (non-optional) proto3 double — same zero-value-
            // omission shape as stock.handler.ts's quantity/availableQuantity (mivend.issue.84.88,
            // external-integration-rules skill's "Non-optional proto3 scalar fields"). An absent
            // key means reservedQuantity=0 (e.g. a fully-cancelled/zeroed line), not a malformed
            // line — only productId (a string field, genuinely invalid when empty) is a real
            // malformed-payload check here.
            const reservedQuantity = Number(line.reservedQuantity ?? 0);
            if (!productId) {
                Logger.warn(
                    `order-registration-result ${entityId}: skipping line with missing productId`,
                    loggerCtx,
                );
                continue;
            }

            const variantId = await this.findVariantId(productId);
            if (!variantId) {
                // Issue #96: ordinary eventual-consistency race (product stream not consumed
                // yet), not necessarily a permanently-stale mapping — retry via
                // MissingDependencyError. A genuinely stale/missing externalId mapping still
                // surfaces visibly: this row dead-letters (inbox 'failed') once the 24h
                // wall-clock budget in IntegrationInboxService.markMissingDependency is exceeded,
                // same as mivend.audit.72's HIGH finding required (never silently dropped).
                //
                // All-or-nothing trade-off (mivend.audit.90's review of #96, accepted as-is by
                // the developer): throwing here aborts apply() before
                // reservationWriteOffSyncService is ever called, so every OTHER, already-
                // resolvable line in the same multi-line order is now held back too, for up to
                // this handler's own backoff/24h budget — not just the one genuinely unresolved
                // line. This is the exact stream issue #93 built a dedicated low-latency critical
                // lane for (reservation release depends on it), so this is a real latency cost on
                // the most latency-sensitive path in the system whenever a multi-line order has
                // one late-arriving product mapping. Deliberately accepted over the more complex
                // alternative (apply resolvable lines immediately, retry only the unresolved
                // one) — simplicity/correctness (no partial-apply bookkeeping) won over
                // preserving the pre-#96 per-line-independent latency. Revisit only if this
                // latency cost is actually observed to matter in practice.
                throw new MissingDependencyError(
                    `order-registration-result ${entityId}: variant not found for productId=${productId}`,
                );
            }
            reservedLines.push({
                productVariantId: variantId,
                reservedQuantity: Math.round(reservedQuantity),
            });
        }

        await this.reservationWriteOffSyncService.handleOrderRegistrationResult(ctx, {
            orderEntityId,
            rejected,
            reservedLines,
            // Issue #96: an unresolved variant now throws MissingDependencyError above instead of
            // being collected here — always empty from this caller. The field itself stays on
            // OrderRegistrationResultInput (reservation-write-off-sync.service.ts) as defensive
            // input shape for any other future caller, unrelated to this plugin's own retry
            // mechanism.
            unresolvedProductIds: [],
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

import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ReservationWriteOffSyncService } from '@mivend/plugin-reservation';

import { MissingDependencyError } from '../types';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationOrderRegistrationResultHandler';

// Applies Integration Service's company.orders.events.v1.order-registration-result stream
// (issue #75, the real reservation-release trigger issue #72's release-on-status attempts
// deferred to). Only decodes the payload shape, resolves reservedLines' ERP productId to a
// Vendure ProductVariant id (same join StockStreamHandler already uses), and resolves
// requestEntityId to a local orderId via integration_outbox — the actual order-correlation
// decision (which key to trust), release, and discrepancy logic live in
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
    ): Promise<InboundOutcome> {
        if (payload.isDeleted === true) {
            return inboundNoop(`order-registration-result ${entityId}: deleted, skipping`);
        }

        const orderEntityId = payload.orderEntityId != null ? String(payload.orderEntityId) : null;
        // Issue #204 follow-up: a rejected result carries no orderEntityId — correlate via
        // requestEntityId instead, see findLocalOrderIdByRequestEntityId below.
        const requestEntityId =
            payload.requestEntityId != null && payload.requestEntityId !== ''
                ? String(payload.requestEntityId)
                : null;
        const localOrderId = requestEntityId
            ? await this.findLocalOrderIdByRequestEntityId(requestEntityId)
            : null;
        const businessRejectionReason = payload.businessRejectionReason as
            | Record<string, unknown>
            | undefined
            | null;
        const rejected = businessRejectionReason != null;
        // BusinessRejectionReason.code/message are both plain (non-optional) proto3 strings — an
        // absent key means '' (zero-value-omission rule), not null.
        const rejectionReasonCode =
            businessRejectionReason != null ? String(businessRejectionReason.code ?? '') : null;
        const rejectionReasonText =
            businessRejectionReason != null ? String(businessRejectionReason.message ?? '') : null;
        // document_number is a real proto `optional string` — absent genuinely means "not
        // assigned yet" (e.g. a rejected result), not a zero-value-omission case.
        const documentNumber =
            payload.documentNumber != null ? String(payload.documentNumber) : null;
        // status is a plain (non-optional) proto3 string — absent means '' (the zero value),
        // same rule as every other plain scalar field (external-integration-rules skill).
        const status = payload.status != null ? String(payload.status) : '';

        const rawLines = Array.isArray(payload.reservedLines) ? payload.reservedLines : [];
        const reservedLines: Array<{ productVariantId: string; reservedQuantity: number }> = [];
        let linesWithoutProductId = 0;
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
                linesWithoutProductId += 1;
                continue;
            }

            const variantId = await this.findVariantId(productId);
            if (!variantId) {
                // Product not consumed yet (cross-topic race) — retried via the inbox; the whole
                // order waits, so no line is written half-applied (docs: external-integration-rules).
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
            requestEntityId,
            localOrderId,
            rejected,
            reservedLines,
            // Issue #96: an unresolved variant now throws MissingDependencyError above instead of
            // being collected here — always empty from this caller. The field itself stays on
            // OrderRegistrationResultInput (reservation-write-off-sync.service.ts) as defensive
            // input shape for any other future caller, unrelated to this plugin's own retry
            // mechanism.
            unresolvedProductIds: [],
            documentNumber,
            status,
            rejectionReasonCode,
            rejectionReasonText,
        });

        if (rejected) {
            // Issue #204: a business rejection is a recorded, reasoned outcome, never silent —
            // visible on the health page's No-op column, reason as its tooltip.
            return inboundNoop(
                `order-registration-result ${entityId}: rejected by the ERP ` +
                    `(code=${rejectionReasonCode ?? ''}, message=${rejectionReasonText ?? ''})`,
            );
        }
        return linesWithoutProductId > 0
            ? inboundNoop(
                  `order-registration-result ${entityId}: applied without ${linesWithoutProductId} line(s) lacking a productId`,
              )
            : inboundApplied();
    }

    // integration_outbox.payload (order-submitted.builder.ts) stores the local Vendure orderId
    // under the eventId this result's requestEntityId echoes back.
    private async findLocalOrderIdByRequestEntityId(
        requestEntityId: string,
    ): Promise<string | null> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select("outbox.payload->>'orderId'", 'orderId')
            .from('integration_outbox', 'outbox')
            .where('outbox.event_id = :requestEntityId', { requestEntityId })
            .getRawOne<{ orderId: string | null }>();
        return row?.orderId ?? null;
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

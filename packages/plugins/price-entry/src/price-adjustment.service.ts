import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    ForbiddenError,
    InternalServerError,
    Logger,
    OrderLine,
    OrderService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import {
    ApprovalRequest,
    ApprovalRequestService,
    ApprovalStepDecision,
} from '@mivend/plugin-approval-workflow';

import { PriceAdjustmentGateService } from './price-adjustment-gate.service';
import { PriceAdjustmentDecision, loggerCtx } from './types';

const PRICE_ADJUSTMENT_REQUEST_TYPE = 'priceAdjustmentApproval';

export interface PriceAdjustmentResult {
    decision: PriceAdjustmentDecision;
    approvalRequestId: ID | null;
}

interface PriceAdjustmentPayload {
    orderId: string;
    orderLineId: string;
    variantId: string;
    requestedPrice: number;
    justification: string | null;
}

// Orchestrates the gate + approval-workflow + real order mutation for a one-off price
// adjustment (docs/ai/manager-portal-concept.md §4.1 "priceAdjustmentApproval"). The generic
// approval-workflow engine stays request-type-agnostic — it doesn't know about pricing;
// this service is what composes the two layers, applying the price only once a request for
// this specific requestType reaches "approved".
@Injectable()
export class PriceAdjustmentService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private gate: PriceAdjustmentGateService,
        private approvalRequestService: ApprovalRequestService,
    ) {}

    async requestAdjustment(
        ctx: RequestContext,
        orderId: ID,
        orderLineId: ID,
        requestedPrice: number,
        justification?: string,
    ): Promise<PriceAdjustmentResult> {
        const orderLine = await this.connection
            .getRepository(ctx, OrderLine)
            .findOneOrFail({ where: { id: orderLineId }, relations: ['productVariant'] });

        const decision = await this.gate.evaluate(
            ctx,
            String(orderLine.productVariant.id),
            requestedPrice,
        );

        if (decision === 'apply-directly') {
            if (!ctx.userHasPermissions([CustomPermission.AdjustPriceWithinLimit.Permission])) {
                throw new ForbiddenError();
            }
            await this.applyPrice(
                ctx,
                orderId,
                orderLineId,
                orderLine.quantity,
                requestedPrice,
                justification,
            );
            return { decision, approvalRequestId: null };
        }

        if (!ctx.userHasPermissions([CustomPermission.RequestPriceAdjustmentApproval.Permission])) {
            throw new ForbiddenError();
        }
        const payload: PriceAdjustmentPayload = {
            orderId: String(orderId),
            orderLineId: String(orderLineId),
            variantId: String(orderLine.productVariant.id),
            requestedPrice,
            justification: justification ?? null,
        };
        const request = await this.approvalRequestService.createRequest(
            ctx,
            PRICE_ADJUSTMENT_REQUEST_TYPE,
            payload as unknown as Record<string, unknown>,
        );
        return { decision, approvalRequestId: request.id };
    }

    // Wraps ApprovalRequestService.decide() — the generic engine only tracks state, it never
    // applies a business effect. Once (and only once) this specific requestType reaches
    // "approved", the price is actually applied to the order line.
    async decideAndApply(
        ctx: RequestContext,
        requestId: ID,
        decision: ApprovalStepDecision,
        comment?: string,
    ): Promise<ApprovalRequest> {
        const request = await this.approvalRequestService.decide(ctx, requestId, decision, comment);
        if (
            request.status === 'approved' &&
            request.requestType === PRICE_ADJUSTMENT_REQUEST_TYPE
        ) {
            const payload = JSON.parse(request.payload) as PriceAdjustmentPayload;
            const orderLine = await this.connection
                .getRepository(ctx, OrderLine)
                .findOneOrFail({ where: { id: payload.orderLineId } });
            await this.applyPrice(
                ctx,
                payload.orderId,
                payload.orderLineId,
                orderLine.quantity,
                payload.requestedPrice,
                payload.justification ?? undefined,
            );
        }
        return request;
    }

    private async applyPrice(
        ctx: RequestContext,
        orderId: ID,
        orderLineId: ID,
        quantity: number,
        price: number,
        justification?: string,
    ): Promise<void> {
        const result = await this.orderService.adjustOrderLine(
            ctx,
            orderId,
            orderLineId,
            quantity,
            {
                manualUnitPrice: price,
                manualPriceReason: justification ?? null,
            },
        );
        if ('errorCode' in result) {
            throw new InternalServerError(result.message);
        }
        Logger.verbose(
            `Applied manual price ${price} to orderLine ${orderLineId} (order ${orderId})`,
            loggerCtx,
        );
    }
}

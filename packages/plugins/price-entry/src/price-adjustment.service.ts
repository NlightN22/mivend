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
import { AccessScopeService, CustomPermission } from '@mivend/plugin-access-control';
import {
    ApprovalRequest,
    ApprovalRequestService,
    ApprovalStepDecision,
} from '@mivend/plugin-approval-workflow';
import { ChecksService, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';
import type { ManagerActionSubject } from '@mivend/plugin-checks';

import type { PriceAdjustmentParams } from './price-adjustment-floor.check';
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

// The generic approval engine is requestType-agnostic; this service adds the pricing effect.
// The order is mutated only after this requestType reaches "approved".
@Injectable()
export class PriceAdjustmentService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private accessScope: AccessScopeService,
        private checks: ChecksService,
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

        const actor = await this.accessScope.getActorIdentity(ctx);
        const subject: ManagerActionSubject<PriceAdjustmentParams> = {
            ...actor,
            params: { variantId: String(orderLine.productVariant.id), requestedPrice },
        };
        const { strongestConsequence } = await this.checks.evaluate(
            ctx,
            MANAGER_SUBJECT_TYPE,
            subject,
            MANAGER_STAGES.adjustPrice,
        );
        if (strongestConsequence === 'block') {
            throw new ForbiddenError();
        }
        const decision: PriceAdjustmentDecision =
            strongestConsequence === 'require-approval' ? 'requires-approval' : 'apply-directly';

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

    // decide() only tracks workflow state and never applies business effects, so this wrapper does.
    // The price must be applied exactly once, and only on the transition to "approved".
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

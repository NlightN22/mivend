import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { RequestContextService } from '@vendure/core';

import { TierRebalanceService } from './tier-rebalance.service';

const WAIT_TIMEOUT_MS = 3000;

@Injectable()
export class ActiveOrderSettleInterceptor implements NestInterceptor {
    constructor(
        private requestContextService: RequestContextService,
        private rebalance: TierRebalanceService,
    ) {}

    async intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Promise<ReturnType<CallHandler['handle']>> {
        if (context.getType<string>() === 'graphql') {
            const gql = GqlExecutionContext.create(context);
            const info = gql.getInfo<GraphQLResolveInfo>();
            if (info.fieldName === 'activeOrder') {
                await this.waitSafely(
                    gql.getContext<{ req: Parameters<RequestContextService['fromRequest']>[0] }>()
                        .req,
                    info,
                );
            }
        }
        return next.handle();
    }

    private async waitSafely(
        req: Parameters<RequestContextService['fromRequest']>[0],
        info: GraphQLResolveInfo,
    ): Promise<void> {
        try {
            const ctx = await this.requestContextService.fromRequest(req, info);
            const orderId = ctx.session?.activeOrderId;
            if (orderId) await this.rebalance.waitForSettled(orderId, WAIT_TIMEOUT_MS);
        } catch {
            // Waiting is best-effort; a failure must never break the read.
        }
    }
}

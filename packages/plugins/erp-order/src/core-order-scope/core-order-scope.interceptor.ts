import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { internal_getRequestContext, Permission, RequestContext } from '@vendure/core';

import { OrderVisibilityService } from '../order-visibility.service';
import { CORE_ORDER_OPERATIONS, OperationArgs, targetIds } from './core-order-operations';
import { OrderTargetService } from './order-target.service';

// The single mivend order-scope gate in front of core Admin API order operations (#248).
@Injectable()
export class CoreOrderScopeInterceptor implements NestInterceptor {
    constructor(
        private visibility: OrderVisibilityService,
        private targets: OrderTargetService,
    ) {}

    async intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Promise<ReturnType<CallHandler['handle']>> {
        if (context.getType<string>() !== 'graphql') return next.handle();
        const gql = GqlExecutionContext.create(context);
        const info = gql.getInfo<GraphQLResolveInfo>();
        const operation = CORE_ORDER_OPERATIONS[info.fieldName];
        if (!operation || !('targets' in operation) || !isRootField(info)) return next.handle();
        const ctx = internal_getRequestContext(gql.getContext<{ req: never }>().req, context);
        if (ctx.apiType !== 'admin' || bypassesScope(ctx)) return next.handle();
        for (const target of operation.targets) {
            const ids = targetIds(target, gql.getArgs<OperationArgs>());
            const orderIds = await this.targets.orderIds(ctx, target.kind, ids);
            const visible = await this.visibility.visibleIds(ctx, orderIds);
            const drafts = await this.targets.customerlessDraftIds(
                ctx,
                orderIds.filter(id => !visible.has(String(id))),
            );
            if (orderIds.some(id => !visible.has(String(id)) && !drafts.has(String(id)))) {
                throw this.targets.notFound(target.kind, ids[0]);
            }
        }
        return next.handle();
    }
}

function isRootField(info: GraphQLResolveInfo): boolean {
    return info.parentType.name === 'Query' || info.parentType.name === 'Mutation';
}

export function bypassesScope(ctx: RequestContext): boolean {
    return ctx.userHasPermissions([Permission.SuperAdmin]);
}

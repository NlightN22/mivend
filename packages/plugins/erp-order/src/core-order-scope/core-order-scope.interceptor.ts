import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { internal_getRequestContext, Permission, RequestContext } from '@vendure/core';

import { CORE_ORDER_OPERATIONS, OperationArgs } from './core-order-operations';
import { CoreOrderScopeService } from './core-order-scope.service';

// The single mivend order-scope gate in front of core Admin API root order operations (#248).
@Injectable()
export class CoreOrderScopeInterceptor implements NestInterceptor {
    constructor(private scope: CoreOrderScopeService) {}

    async intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Promise<ReturnType<CallHandler['handle']>> {
        if (context.getType<string>() !== 'graphql') return next.handle();
        const gql = GqlExecutionContext.create(context);
        const info = gql.getInfo<GraphQLResolveInfo>();
        if (!isRootField(info) || !(info.fieldName in CORE_ORDER_OPERATIONS)) return next.handle();
        const ctx = internal_getRequestContext(gql.getContext<{ req: never }>().req, context);
        if (ctx.apiType !== 'admin' || bypassesScope(ctx)) return next.handle();
        await this.scope.assertInScope(ctx, info.fieldName, gql.getArgs<OperationArgs>());
        return next.handle();
    }
}

function isRootField(info: GraphQLResolveInfo): boolean {
    return info.parentType.name === 'Query' || info.parentType.name === 'Mutation';
}

export function bypassesScope(ctx: RequestContext): boolean {
    return ctx.userHasPermissions([Permission.SuperAdmin]);
}

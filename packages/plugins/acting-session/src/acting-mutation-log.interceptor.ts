import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { internal_getRequestContext, Logger } from '@vendure/core';
import { ActingContextService } from '@mivend/plugin-session-management';

import { loggerCtx } from './acting-session.types';

// Stand-in for the change journal: who acted, what they changed and when, for every acting-session mutation.
@Injectable()
export class ActingMutationLogInterceptor implements NestInterceptor {
    constructor(private acting: ActingContextService) {}

    async intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Promise<ReturnType<CallHandler['handle']>> {
        if (context.getType<string>() !== 'graphql') return next.handle();
        const gql = GqlExecutionContext.create(context);
        const info = gql.getInfo<GraphQLResolveInfo>();
        if (info.parentType.name !== 'Mutation') return next.handle();
        const ctx = internal_getRequestContext(gql.getContext<{ req: never }>().req, context);
        if (ctx.apiType !== 'shop' || !ctx.session) return next.handle();
        const acting = await this.acting.get(ctx);
        if (acting) {
            Logger.info(
                `Acting mutation: administrator=${acting.administratorId} user=${String(ctx.activeUserId)} mutation=${info.fieldName} at=${new Date().toISOString()}`,
                loggerCtx,
            );
        }
        return next.handle();
    }
}

import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { internal_getRequestContext, RequestContext, TransactionalConnection } from '@vendure/core';
import { ActingContextService } from '@mivend/plugin-session-management';
import { ctxQuery } from 'shared';

import type { ChangeActor } from './change-journal.types';
import { resolveRequestActor } from './change-journal-actor';
import { runInChangeScope, SYSTEM_ACTOR } from './change-journal-context';
import type { ChangeJournalScope } from './change-journal-context';

interface HttpRequest {
    method?: string;
    path?: string;
    route?: { path?: string };
}

// Puts the request's actor into async-local scope, where the TypeORM subscriber reads it.
@Injectable()
export class ChangeJournalInterceptor implements NestInterceptor {
    constructor(
        private connection: TransactionalConnection,
        private acting: ActingContextService,
    ) {}

    intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
        const { req, label } = this.describe(context);
        const ctx = req ? this.requestContext(req, context) : undefined;
        const source = ctx ? `${ctx.apiType}-api:${label}` : label;
        return runInChangeScope(this.scope(ctx, source), () => next.handle());
    }

    private describe(context: ExecutionContext): { req: unknown; label: string } {
        if (context.getType<string>() === 'graphql') {
            const gql = GqlExecutionContext.create(context);
            const info = gql.getInfo<GraphQLResolveInfo>();
            return { req: gql.getContext<{ req?: unknown }>().req, label: info.fieldName };
        }
        const req = context.switchToHttp().getRequest<HttpRequest | undefined>();
        return { req, label: `rest:${req?.method ?? ''} ${req?.route?.path ?? req?.path ?? ''}` };
    }

    private requestContext(req: unknown, context: ExecutionContext): RequestContext | undefined {
        try {
            return internal_getRequestContext(req as never, context);
        } catch {
            // best-effort: a route outside Vendure's auth guard has no RequestContext; its writes are system writes
            return undefined;
        }
    }

    private scope(ctx: RequestContext | undefined, source: string): ChangeJournalScope {
        const memo = new Map<string, Promise<ChangeActor>>();
        return {
            source,
            requestId: randomUUID(),
            sessionId: () => (ctx?.session?.id != null ? String(ctx.session.id) : null),
            resolveActor: () => {
                if (!ctx) return Promise.resolve(SYSTEM_ACTOR);
                const key = String(ctx.activeUserId ?? '');
                let pending = memo.get(key);
                if (!pending) {
                    pending = resolveRequestActor(ctx, {
                        actingAdministratorId: async () =>
                            (await this.acting.get(ctx))?.administratorId ?? null,
                        administratorIdForUser: userId => this.administratorId(ctx, userId),
                    });
                    memo.set(key, pending);
                }
                return pending;
            },
        };
    }

    private async administratorId(ctx: RequestContext, userId: string): Promise<string | null> {
        const rows = await ctxQuery<Array<{ id: number }>>(
            this.connection,
            ctx,
            'SELECT id FROM administrator WHERE "userId" = $1 AND "deletedAt" IS NULL',
            [userId],
        );
        return rows[0] ? String(rows[0].id) : null;
    }
}

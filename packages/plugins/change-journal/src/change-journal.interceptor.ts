import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { internal_getRequestContext, RequestContext } from '@vendure/core';

import type { ChangeActor } from './change-journal.types';
import { resolveRequestActor, sqlActorLookups } from './change-journal-actor';
import { runInChangeScope, SYSTEM_ACTOR } from './change-journal-context';
import type { ChangeJournalScope } from './change-journal-context';

interface HttpRequest {
    method?: string;
    path?: string;
    route?: { path?: string };
}

interface RequestState {
    requestId: string;
    actors: Map<string, Promise<ChangeActor>>;
}

// One id and one actor memo per HTTP request, shared by every resolver call of a batched request.
const requests = new WeakMap<object, RequestState>();

function stateOf(req: unknown): RequestState {
    if (!req || typeof req !== 'object') return { requestId: randomUUID(), actors: new Map() };
    let state = requests.get(req);
    if (!state) {
        state = { requestId: randomUUID(), actors: new Map() };
        requests.set(req, state);
    }
    return state;
}

// Puts the request's actor into async-local scope, where the TypeORM subscriber reads it.
@Injectable()
export class ChangeJournalInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
        const { req, label } = this.describe(context);
        const ctx = req ? this.requestContext(req, context) : undefined;
        const source = ctx ? `${ctx.apiType}-api:${label}` : label;
        return runInChangeScope(scopeFor(ctx, source, stateOf(req)), () => next.handle());
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
}

export function scopeFor(
    ctx: RequestContext | undefined,
    source: string,
    state: RequestState,
): ChangeJournalScope {
    return {
        source,
        requestId: state.requestId,
        sessionId: () => (ctx?.session?.id != null ? String(ctx.session.id) : null),
        resolveActor: runner => {
            if (!ctx) return Promise.resolve(SYSTEM_ACTOR);
            const key = `${String(ctx.activeUserId ?? '')}:${ctx.session?.token ?? ''}`;
            let pending = state.actors.get(key);
            if (!pending) {
                pending = resolveRequestActor(ctx, sqlActorLookups(runner, ctx.session?.token));
                state.actors.set(key, pending);
            }
            return pending;
        },
    };
}

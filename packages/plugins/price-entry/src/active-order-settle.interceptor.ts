import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { ConfigService, SessionService } from '@vendure/core';

import { TierRebalanceService } from './tier-rebalance.service';

const WAIT_TIMEOUT_MS = 8000;

interface SessionRequest {
    session?: { token?: string };
    headers?: Record<string, string | string[] | undefined>;
}

@Injectable()
export class ActiveOrderSettleInterceptor implements NestInterceptor {
    constructor(
        private sessionService: SessionService,
        private configService: ConfigService,
        private rebalance: TierRebalanceService,
    ) {}

    async intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Promise<ReturnType<CallHandler['handle']>> {
        if (context.getType<string>() === 'graphql') {
            const gql = GqlExecutionContext.create(context);
            if (gql.getInfo<GraphQLResolveInfo>().fieldName === 'activeOrder') {
                await this.waitSafely(gql.getContext<{ req: SessionRequest }>().req);
            }
        }
        return next.handle();
    }

    // The Vendure guard keeps the session in its own request context, so resolve it from the token.
    private async waitSafely(req: SessionRequest): Promise<void> {
        try {
            const token = this.extractToken(req);
            const session = token
                ? await this.sessionService.getSessionFromToken(token)
                : undefined;
            if (session?.activeOrderId) {
                await this.rebalance.waitForSettled(session.activeOrderId, WAIT_TIMEOUT_MS);
            }
        } catch {
            // best-effort: a failed wait must never break the read.
        }
    }

    private extractToken(req: SessionRequest): string | undefined {
        if (req.session?.token) return req.session.token;
        const header =
            req.headers?.[
                this.configService.authOptions.authTokenHeaderKey ?? 'vendure-auth-token'
            ];
        const value = Array.isArray(header) ? header[0] : header;
        if (value) return value;
        const bearer = req.headers?.authorization;
        return typeof bearer === 'string' && bearer.startsWith('Bearer ')
            ? bearer.slice(7)
            : undefined;
    }
}

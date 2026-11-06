import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { RequestContextService } from '@vendure/core';
import type { NextFunction, Request, Response } from 'express';

import { ActingSessionLivenessService } from './acting-session-liveness.service';
import {
    ACTING_HEADER,
    ACTING_SESSION_PLUGIN_OPTIONS,
    SESSION_TTL_DEFAULT_MS,
} from './acting-session.types';
import type { ActingSessionPluginOptions } from './acting-session.types';

export function bearerToken(header: string | undefined): string | undefined {
    const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
    return match?.[1];
}

// Vendure reads the cookie before the bearer token, so the header is dropped. A dead bearer token still makes core
// AuthGuard write a session token to req.session; a detached object keeps cookie-session from emitting Set-Cookie.
export function detachCookieSession(req: Request): void {
    let detached: unknown = {};
    Object.defineProperty(req, 'session', {
        configurable: true,
        enumerable: true,
        get: () => detached,
        set: (value: unknown) => {
            detached = value;
        },
    });
}

@Injectable()
export class ActingSessionMiddleware implements NestMiddleware {
    constructor(
        private liveness: ActingSessionLivenessService,
        private requestContextService: RequestContextService,
        @Inject(ACTING_SESSION_PLUGIN_OPTIONS) private options: ActingSessionPluginOptions,
    ) {}

    use(req: Request, _res: Response, next: NextFunction): void {
        if (req.headers[ACTING_HEADER] !== undefined) {
            delete req.headers.cookie;
            detachCookieSession(req);
        }
        const token = bearerToken(req.headers.authorization);
        if (!token) return next();
        this.requestContextService
            .create({ apiType: 'shop' })
            .then(ctx =>
                this.liveness.endDeadSession(
                    ctx,
                    token,
                    this.options.sessionTtlMs ?? SESSION_TTL_DEFAULT_MS,
                ),
            )
            .then(() => next(), next);
    }
}

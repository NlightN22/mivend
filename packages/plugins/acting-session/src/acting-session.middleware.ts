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

// Vendure reads the cookie before the bearer token. cookie-session parses lazily, so dropping the header here
// keeps a real customer's cookie out of an acting tab and leaves nothing to write back.
@Injectable()
export class ActingSessionMiddleware implements NestMiddleware {
    constructor(
        private liveness: ActingSessionLivenessService,
        private requestContextService: RequestContextService,
        @Inject(ACTING_SESSION_PLUGIN_OPTIONS) private options: ActingSessionPluginOptions,
    ) {}

    use(req: Request, _res: Response, next: NextFunction): void {
        if (req.headers[ACTING_HEADER] !== undefined) delete req.headers.cookie;
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

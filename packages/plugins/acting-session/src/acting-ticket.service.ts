import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ctxQuery } from 'shared';

import { ActingTicket } from './entities/acting-ticket.entity';
import { ACTING_SESSION_PLUGIN_OPTIONS, TICKET_TTL_DEFAULT_MS } from './acting-session.types';
import type { ActingSessionPluginOptions } from './acting-session.types';

export interface TicketBinding {
    administratorId: string;
    parentSessionId: string;
    counterpartyId: string;
    customerId: string;
    tradingPointId: string | null;
}

export function hashTicket(ticket: string): string {
    return createHash('sha256').update(ticket).digest('hex');
}

@Injectable()
export class ActingTicketService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(ACTING_SESSION_PLUGIN_OPTIONS) private options: ActingSessionPluginOptions,
    ) {}

    async issue(
        ctx: RequestContext,
        binding: TicketBinding,
    ): Promise<{ ticket: string; expiresAt: Date }> {
        const ticket = randomBytes(32).toString('base64url');
        const expiresAt = new Date(
            Date.now() + (this.options.ticketTtlMs ?? TICKET_TTL_DEFAULT_MS),
        );
        await this.connection
            .getRepository(ctx, ActingTicket)
            .save(new ActingTicket({ ...binding, tokenHash: hashTicket(ticket), expiresAt }));
        return { ticket, expiresAt };
    }

    // One atomic UPDATE is the single-use gate: a concurrent second exchange waits on the row lock, then matches nothing.
    async claim(ctx: RequestContext, ticket: string): Promise<TicketBinding> {
        const rows = await ctxQuery<TicketBinding[]>(
            this.connection,
            ctx,
            `WITH claimed AS (
                UPDATE acting_ticket SET "usedAt" = $2
                WHERE "tokenHash" = $1 AND "usedAt" IS NULL AND "expiresAt" > $2
                RETURNING "administratorId", "parentSessionId", "counterpartyId", "customerId", "tradingPointId"
            ) SELECT * FROM claimed`,
            [hashTicket(ticket), new Date()],
        );
        const binding = rows[0];
        if (!binding) throw new UserInputError('The acting ticket is invalid, used or expired');
        return binding;
    }

    async deleteExpired(ctx: RequestContext): Promise<number> {
        const rows = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `WITH d AS (DELETE FROM acting_ticket WHERE "expiresAt" < $1 RETURNING 1)
             SELECT count(*)::int AS n FROM d`,
            [new Date(Date.now() - 60 * 60_000)],
        );
        return rows[0]?.n ?? 0;
    }
}

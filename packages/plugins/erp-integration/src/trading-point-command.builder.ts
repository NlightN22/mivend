import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Counterparty, TradingPoint } from '@mivend/plugin-counterparty';

import { outboundNoop, outboundSend, outboundSkip, OutboundGateway } from './outbound-gateway';
import type { OutboundBuildResult } from './outbound-gateway';
import { toTradingPointCommandPayload } from './trading-point-command.payload';

// Builds the whole current record of one trading point (never a delta), so quick edits collapse into the
// latest state. Runs under the point's lock, which is what makes the version guards below race-free.
@Injectable()
export class TradingPointCommandBuilder {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly gateway: OutboundGateway,
    ) {}

    async build(ctx: RequestContext, uuid: string): Promise<OutboundBuildResult> {
        const point = await this.connection
            .getRepository(ctx, TradingPoint)
            .findOne({ where: { uuid }, relations: ['contacts'] });
        if (!point) return outboundSkip(`trading point ${uuid} not found`);
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: point.counterpartyId } });
        if (!counterparty) return outboundSkip(`trading point ${uuid} has no counterparty`);

        if (
            await this.gateway.hasEntryAtOrAbove(ctx, 'trading-point.changed', uuid, point.version)
        ) {
            return outboundNoop(`trading point ${uuid} version ${point.version} already queued`);
        }
        await this.gateway.skipOlderWaiting(ctx, 'trading-point.changed', uuid, point.version);

        const eventId = randomUUID();
        return outboundSend([
            {
                eventId,
                payload: toTradingPointCommandPayload(
                    point,
                    counterparty.erpId,
                    eventId,
                    new Date(),
                ),
            },
        ]);
    }
}

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContext } from '@vendure/core';
import { CounterpartySnapshotService } from '@mivend/plugin-counterparty';

import { toCounterpartyCommandPayload } from './counterparty-command.payload';
import { outboundNoop, outboundSend, outboundSkip, OutboundGateway } from './outbound-gateway';
import type { OutboundBuildResult } from './outbound-gateway';

// Builds the whole current portal-owned record of one counterparty (never a delta), so quick edits
// collapse into the latest state. Runs under the counterparty's outbound lock, which makes the version guards race-free.
@Injectable()
export class CounterpartyCommandBuilder {
    constructor(
        private readonly snapshots: CounterpartySnapshotService,
        private readonly gateway: OutboundGateway,
    ) {}

    async build(ctx: RequestContext, erpId: string): Promise<OutboundBuildResult> {
        const snapshot = await this.snapshots.load(ctx, erpId);
        if (!snapshot) return outboundSkip(`counterparty ${erpId} not found`);
        const { version } = snapshot.counterparty;
        if (await this.gateway.hasEntryAtOrAbove(ctx, 'counterparty.changed', erpId, version)) {
            return outboundNoop(`counterparty ${erpId} version ${version} already queued`);
        }
        await this.gateway.skipOlderWaiting(ctx, 'counterparty.changed', erpId, version);

        const eventId = randomUUID();
        return outboundSend([
            { eventId, payload: toCounterpartyCommandPayload(snapshot, eventId, new Date()) },
        ]);
    }
}

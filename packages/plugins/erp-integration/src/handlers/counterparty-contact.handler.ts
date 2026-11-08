import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyContactErp } from '@mivend/plugin-counterparty';

import { inboundApplied } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { activityFlags, listJson, optionalText, upsertErpMirror } from './erp-mirror-upsert';

// `counterparty-contact` stream, stored as sent; links stay soft ids and a tombstone only sets the flags.
@Injectable()
export class CounterpartyContactStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        await upsertErpMirror(
            this.connection.getRepository(ctx, CounterpartyContactErp),
            entityId,
            {
                counterpartyId: String(payload.counterpartyId ?? ''),
                name: optionalText(payload.name),
                position: optionalText(payload.position),
                phone: optionalText(payload.phone),
                email: optionalText(payload.email),
                contactInfos: listJson(payload.contactInfos),
            },
            activityFlags(payload),
        );
        return inboundApplied();
    }
}

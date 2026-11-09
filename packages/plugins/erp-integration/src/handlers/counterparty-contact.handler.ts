import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    ContactPointService,
    CounterpartyContactErp,
    ErpContactPersonService,
} from '@mivend/plugin-counterparty';

import { inboundApplied } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { applyErpPerson } from './erp-person';
import { activityFlags, listJson, optionalText, upsertErpMirror } from './erp-mirror-upsert';

// `counterparty-contact` stream: stored as sent in the mirror, and applied to the ERP-backed contact person
// with its channels. An unknown counterparty retries the event until it arrives.
@Injectable()
export class CounterpartyContactStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly persons: ErpContactPersonService,
        private readonly contactPoints: ContactPointService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const flags = activityFlags(payload);
        const name = optionalText(payload.name);
        await upsertErpMirror(
            this.connection.getRepository(ctx, CounterpartyContactErp),
            entityId,
            {
                counterpartyId: String(payload.counterpartyId ?? ''),
                name,
                position: optionalText(payload.position),
                phone: optionalText(payload.phone),
                email: optionalText(payload.email),
                contactInfos: listJson(payload.contactInfos),
            },
            flags,
        );
        const person = await applyErpPerson(
            ctx,
            {
                connection: this.connection,
                persons: this.persons,
                contactPoints: this.contactPoints,
            },
            entityId,
            {
                name,
                position: optionalText(payload.position),
                counterpartyErpId: optionalText(payload.counterpartyId),
                linkLater: true,
                contactInfos: payload.contactInfos,
                ...flags,
            },
        );
        return inboundApplied(undefined, person.failure);
    }
}

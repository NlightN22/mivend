import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ContactPointService, ErpContactPersonService } from '@mivend/plugin-counterparty';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { activityFlags, optionalText } from './erp-mirror-upsert';
import { applyErpPerson, personName } from './erp-person';

// `contact-person` stream: contact person (common catalog, no owner), stored as an ERP-backed contact person with its channels.
@Injectable()
export class ContactPersonStreamHandler implements InboundStreamHandler {
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
        const applied = await applyErpPerson(
            ctx,
            {
                connection: this.connection,
                persons: this.persons,
                contactPoints: this.contactPoints,
            },
            entityId,
            {
                name: personName(payload),
                position: optionalText(payload.description),
                counterpartyErpId: null,
                linkLater: false,
                contactInfos: payload.contactInfos,
                ...activityFlags(payload),
            },
        );
        return applied
            ? inboundApplied()
            : inboundNoop(`contact-person ${entityId}: tombstone for an unknown person`);
    }
}

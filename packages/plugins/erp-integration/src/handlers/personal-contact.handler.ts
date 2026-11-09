import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ContactPointService, ErpContactPersonService } from '@mivend/plugin-counterparty';

import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { activityFlags, optionalText } from './erp-mirror-upsert';
import { applyErpPerson, personName, personOutcome } from './erp-person';

// `personal-contact` stream: personal contact (no owner; see docs/ai/erp-streams-map.md), stored as an ERP-backed contact person with its channels.
@Injectable()
export class PersonalContactStreamHandler implements InboundStreamHandler {
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
        const result = await applyErpPerson(
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
        return personOutcome(result, 'personal-contact', entityId);
    }
}

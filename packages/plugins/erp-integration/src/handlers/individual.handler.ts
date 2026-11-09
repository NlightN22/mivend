import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ContactPointService, ErpContactPersonService } from '@mivend/plugin-counterparty';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { activityFlags, optionalText } from './erp-mirror-upsert';
import { applyErpPerson, personName } from './erp-person';

// `individual` stream: a non-group individual becomes an ERP-backed contact person (linked to its counterparty
// when one is set) with its channels. Personal fields never reach this handler (personal-data-allowlist.ts).
@Injectable()
export class IndividualStreamHandler implements InboundStreamHandler {
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
        if (payload.isGroup === true) {
            return inboundNoop(`individual ${entityId}: a group, only hierarchy`);
        }
        const flags = activityFlags(payload);
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
                position: null,
                counterpartyErpId: optionalText(payload.counterpartyId),
                linkLater: false,
                contactInfos: payload.contactInfos,
                ...flags,
            },
        );
        return applied
            ? inboundApplied()
            : inboundNoop(`individual ${entityId}: tombstone for an unknown person`);
    }
}

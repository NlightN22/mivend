import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    ContactPointService,
    Counterparty,
    CounterpartyContactErp,
    ErpContactPersonService,
} from '@mivend/plugin-counterparty';

import { inboundApplied } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { parseContactInfos } from './contact-infos';
import { activityFlags, listJson, optionalText, upsertErpMirror } from './erp-mirror-upsert';

// `counterparty-contact` stream: stored as sent in the mirror, and applied to the ERP-backed contact person
// with its channels. The counterparty link is added only when that counterparty is already known; no retry.
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
        if (flags.isDeleted || !name) {
            await this.persons.deactivate(ctx, entityId);
            return inboundApplied();
        }
        const counterparty = await this.connection.getRepository(ctx, Counterparty).findOne({
            where: { erpId: String(payload.counterpartyId ?? '') },
            select: { id: true },
        });
        const personId = await this.persons.upsert(ctx, entityId, {
            name,
            position: optionalText(payload.position),
            isActive: flags.isActive,
            counterpartyId: counterparty ? (counterparty.id as number) : null,
        });
        const contactInfos = parseContactInfos(payload.contactInfos);
        if (contactInfos) {
            await this.contactPoints.replaceErpPoints(ctx, 'contactPerson', personId, contactInfos);
        }
        return inboundApplied();
    }
}

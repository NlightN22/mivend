import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { ErpUserService, UserEnrichmentService } from '@mivend/plugin-access-control';
import {
    ContactPointService,
    CounterpartyErpMirrorService,
    ErpContactPersonService,
    TradingPointContactFactsService,
} from '@mivend/plugin-counterparty';
import { OrganizationEventService } from '@mivend/plugin-documents';

import { MissingReferenceError } from '../types';
import { contactFacts, contactRowsToInputs } from './contact-infos';
import type { ContactFacts } from './contact-infos';
import { inboundApplied } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import type { ContactPointInput } from '@mivend/plugin-counterparty';

const loggerCtx = 'IntegrationContactInfoHandler';

// Applies `contact-info` (key = the owner's uuid): the whole contact set replaces the owner's ERP channels and feeds the
// fields the owner's own event no longer carries. The owner is found by ERP id among the kinds mivend stores.
@Injectable()
export class ContactInfoStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly contactPoints: ContactPointService,
        private readonly mirror: CounterpartyErpMirrorService,
        private readonly tradingPointFacts: TradingPointContactFactsService,
        private readonly organizations: OrganizationEventService,
        private readonly erpUsers: ErpUserService,
        private readonly userEnrichment: UserEnrichmentService,
        private readonly persons: ErpContactPersonService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const inputs = payload.isDeleted === true ? [] : contactRowsToInputs(payload.rows);
        const facts = contactFacts(inputs);
        const failure = await this.contactPoints.guarded(
            ctx,
            `contact-info ${entityId}`,
            async () => {
                if (!(await this.applyToOwner(ctx, entityId, inputs, facts))) {
                    throw new MissingReferenceError(
                        `contact-info ${entityId}: owner is not stored here yet`,
                    );
                }
            },
        );
        if (failure) Logger.warn(`contact-info ${entityId}: ${failure}`, loggerCtx);
        return inboundApplied(undefined, failure);
    }

    private async applyToOwner(
        ctx: RequestContext,
        entityId: string,
        inputs: ContactPointInput[],
        facts: ContactFacts,
    ): Promise<boolean> {
        const points = this.contactPoints;
        if (await points.replaceErpPointsByErpId(ctx, 'counterparty', entityId, inputs)) {
            await this.mirror.write(ctx, entityId, {
                phone: facts.phone,
                officialEmail: facts.email,
                contactInfos: JSON.stringify(inputs),
            });
            await this.mirror.seedContactFromMirror(ctx, entityId);
            return true;
        }
        if (await points.replaceErpPointsByErpId(ctx, 'tradingPoint', entityId, inputs)) {
            await this.tradingPointFacts.apply(ctx, entityId, {
                address: facts.soleAddress,
                contactPhone: facts.phone,
                contactInfos: JSON.stringify(inputs),
            });
            return true;
        }
        if (await points.replaceErpPointsByErpId(ctx, 'organization', entityId, inputs)) {
            await this.organizations.applyDerived(ctx, entityId, {
                legalAddress: facts.soleAddress,
                phone: facts.phone,
            });
            return true;
        }
        if (await this.erpUsers.findByErpId(ctx, entityId)) {
            await this.applyToUser(ctx, entityId, inputs, facts);
            return true;
        }
        const personId = await this.persons.findIdByErpId(ctx, entityId);
        if (personId === null) return false;
        await points.replaceErpPoints(ctx, 'contactPerson', personId, inputs);
        return true;
    }

    // The e-mail links a not yet linked Administrator; the channels are kept for one that links later.
    private async applyToUser(
        ctx: RequestContext,
        erpId: string,
        inputs: ContactPointInput[],
        facts: ContactFacts,
    ): Promise<void> {
        await this.erpUsers.setContactInfos(ctx, erpId, JSON.stringify(inputs));
        if (facts.email)
            await this.userEnrichment.linkAndEnrich(ctx, { erpId, email: facts.email });
        await this.contactPoints.replaceErpPointsByErpId(ctx, 'administrator', erpId, inputs);
    }
}

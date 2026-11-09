import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome } from './inbound-stream-handler';
import {
    ContactPointService,
    Counterparty,
    ErpContactPersonService,
} from '@mivend/plugin-counterparty';

import { MissingReferenceError } from '../types';
import { parseContactInfos } from './contact-infos';

export interface ErpPersonInput {
    name: string | null;
    position: string | null;
    isActive: boolean;
    isDeleted: boolean;
    counterpartyErpId: string | null;
    // true: an unknown counterparty leaves the person unlinked (linked later on its arrival); false: retry.
    linkLater: boolean;
    contactInfos: unknown;
}

export type ErpPersonResult = 'applied' | 'unknown' | 'nameless';

export interface ErpPersonDeps {
    connection: TransactionalConnection;
    persons: ErpContactPersonService;
    contactPoints: ContactPointService;
}

export function personName(payload: Record<string, unknown>): string | null {
    const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const full = text(payload.name);
    if (full) return full;
    return (
        [payload.lastName, payload.firstName, payload.middleName]
            .map(text)
            .filter(Boolean)
            .join(' ') || null
    );
}

// 'unknown': a tombstone of a person mivend never stored. 'nameless': a live event without any name, not a tombstone. A person whose counterparty is not
// synced yet is retried (MissingReferenceError) unless linkLater: then the link is added when it arrives.
export async function applyErpPerson(
    ctx: RequestContext,
    deps: ErpPersonDeps,
    erpId: string,
    input: ErpPersonInput,
): Promise<ErpPersonResult> {
    if (input.isDeleted) {
        return (await deps.persons.deactivate(ctx, erpId)) !== null ? 'applied' : 'unknown';
    }
    if (!input.name) return 'nameless';
    let counterpartyId: number | null = null;
    if (input.counterpartyErpId) {
        const counterparty = await deps.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { erpId: input.counterpartyErpId }, select: { id: true } });
        if (!counterparty && !input.linkLater) {
            throw new MissingReferenceError(
                `person ${erpId}: counterparty erpId=${input.counterpartyErpId} not synced yet`,
            );
        }
        counterpartyId = (counterparty?.id as number | undefined) ?? null;
    }
    const personId = await deps.persons.upsert(ctx, erpId, {
        name: input.name,
        position: input.position,
        isActive: input.isActive,
        counterpartyId,
    });
    const contactInfos = parseContactInfos(input.contactInfos);
    if (contactInfos) {
        await deps.contactPoints.replaceErpPoints(ctx, 'contactPerson', personId, contactInfos);
    }
    return 'applied';
}

export function personOutcome(
    result: ErpPersonResult,
    stream: string,
    entityId: string,
): InboundOutcome {
    if (result === 'applied') return inboundApplied();
    const reason =
        result === 'unknown' ? 'tombstone for an unknown person' : 'live event without a name';
    Logger.warn(`${stream} ${entityId}: ${reason}`, 'ErpPerson');
    return inboundNoop(`${stream} ${entityId}: ${reason}`);
}

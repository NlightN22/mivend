import type { InboundStream } from './types';

const COMMON = [
    'eventId',
    'occurredAt',
    'entityId',
    'version',
    'updatedAt',
    'code',
    'name',
    'contactInfos',
    'isActive',
    'isDeleted',
] as const;

// Streams that carry personal fields mivend must never store; only the listed fields reach the inbox.
const ALLOWED_FIELDS: Partial<Record<InboundStream, ReadonlySet<string>>> = {
    individual: new Set([...COMMON, 'isGroup', 'parentId', 'counterpartyId']),
    'contact-person': new Set([...COMMON, 'lastName', 'firstName', 'middleName', 'description']),
    'personal-contact': new Set([
        ...COMMON,
        'lastName',
        'firstName',
        'middleName',
        'description',
        'accessUserId',
    ]),
};

export function hasPersonalFields(stream: InboundStream): boolean {
    return ALLOWED_FIELDS[stream] !== undefined;
}

export function stripPersonalFields(
    stream: InboundStream,
    record: Record<string, unknown>,
): Record<string, unknown> {
    const allowed = ALLOWED_FIELDS[stream];
    if (!allowed) return record;
    return Object.fromEntries(Object.entries(record).filter(([key]) => allowed.has(key)));
}

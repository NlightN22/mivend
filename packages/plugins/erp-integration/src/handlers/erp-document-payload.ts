import { toMinorUnits } from 'shared';
import type { ErpDocumentResult, ErpRef } from '@mivend/plugin-erp-order';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome } from './inbound-stream-handler';
import { parseTimestamp } from './settlement-payload';

export type Payload = Record<string, unknown>;

// Decoded JSON has no null: an unset optional is an absent key, so absent reads as null for optionals
// and as zero for the plain proto3 numbers.
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const flt = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
export const fltZero = (v: unknown): number => flt(v) ?? 0;
export const money = (v: unknown): number | null => {
    const n = flt(v);
    return n === null ? null : toMinorUnits(n);
};
export const moneyZero = (v: unknown): number => money(v) ?? 0;
export const int = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);
export const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
export const time = parseTimestamp;
export const ref = (v: unknown): ErpRef | null =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as ErpRef) : null;

export function records(v: unknown): Payload[] {
    return Array.isArray(v) ? v.filter((item): item is Payload => ref(item) !== null) : [];
}

export const lineNumber = (item: Payload): number => int(item.lineNumber) ?? 0;

export const discounts = (item: Payload) => ({
    automaticDiscountPercent: flt(item.automaticDiscountPercent),
    manualDiscountPercent: flt(item.manualDiscountPercent),
});

export const vat = (item: Payload) => ({
    vatCode: str(item.vatCode),
    vatAmountMinor: money(item.vatAmount),
});

export const discountCondition = (item: Payload) => ({
    automaticDiscountCondition: ref(item.automaticDiscountCondition),
    automaticDiscountConditionValue: str(item.automaticDiscountConditionValue),
});

export interface DocumentEnvelope {
    version: string;
    isDeleted: boolean;
    hasBody: boolean;
    sourceUpdatedAt: Date | null;
}

// bodyKey names a required header field; a tombstone is is_deleted without it.
export function documentEnvelope(payload: Payload, bodyKey: string): DocumentEnvelope | null {
    const version = str(payload.version);
    if (!version) return null;
    return {
        version,
        isDeleted: payload.isDeleted === true,
        hasBody: str(payload[bodyKey]) !== null,
        sourceUpdatedAt: time(payload.updatedAt),
    };
}

export function documentOutcome(
    stream: string,
    entityId: string,
    result: ErpDocumentResult,
): InboundOutcome {
    if (result === 'stale')
        return inboundNoop(`${stream} ${entityId}: version not newer than stored`);
    if (result === 'unknown-deleted') {
        return inboundNoop(`${stream} ${entityId}: deletion of an unknown document`);
    }
    return inboundApplied();
}

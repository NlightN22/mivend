import { SelectQueryBuilder } from 'typeorm';

import { ApprovalRequest } from './entities/approval-request.entity';

// Request types whose payload carries a priceTypeCode that gates who may read the request.
const PRICE_TYPE_GATED_REQUEST_TYPES = ['discountGrantApproval'];

export function isPriceTypeGated(requestType: string): boolean {
    return PRICE_TYPE_GATED_REQUEST_TYPES.includes(requestType);
}

export function payloadPriceTypeCode(payload: string): string | null {
    try {
        const code = (JSON.parse(payload) as { priceTypeCode?: unknown }).priceTypeCode;
        return typeof code === 'string' ? code : null;
    } catch {
        return null;
    }
}

// Deny by default: an unparsable payload or a missing code is hidden from everyone.
export function isRequestVisible(
    request: Pick<ApprovalRequest, 'requestType' | 'payload'>,
    allowedCodes: string[],
): boolean {
    if (!isPriceTypeGated(request.requestType)) return true;
    const code = payloadPriceTypeCode(request.payload);
    return code !== null && allowedCodes.includes(code);
}

export function applyPriceTypeGate(
    qb: SelectQueryBuilder<ApprovalRequest>,
    allowedCodes: string[],
): void {
    // CASE guards the cast (OR does not short-circuit); pg_input_is_valid hides garbage payloads (Postgres 16+).
    qb.andWhere(
        `(request.requestType NOT IN (:...gatedTypes) OR CASE WHEN request.requestType IN (:...gatedTypes) THEN CASE WHEN pg_input_is_valid(request.payload, 'jsonb') THEN request.payload::jsonb ->> 'priceTypeCode' END END IN (:...gateAllowedCodes))`,
        {
            gatedTypes: PRICE_TYPE_GATED_REQUEST_TYPES,
            gateAllowedCodes: allowedCodes.length ? allowedCodes : [''],
        },
    );
}

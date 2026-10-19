import { describe, it, expect, vi } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import type { PriceTypeAccessService } from '@mivend/plugin-access-control';

import { ApprovalReadAccessService } from '../../approval-read-access.service';
import type { ApprovalStepService } from '../../approval-step.service';
import type { ApprovalRequest } from '../../entities/approval-request.entity';

const ctx = {} as RequestContext;
const grant = {
    id: 'r1',
    requestType: 'discountGrantApproval',
    payload: JSON.stringify({ priceTypeCode: 'type-a' }),
} as ApprovalRequest;

function build(
    allowed: string[],
    found: ApprovalRequest | null = grant,
): ApprovalReadAccessService {
    return new ApprovalReadAccessService(
        { allowedCodes: vi.fn(async () => allowed) } as unknown as PriceTypeAccessService,
        { findRequest: vi.fn(async () => found) } as unknown as ApprovalStepService,
    );
}

describe('ApprovalReadAccessService', () => {
    it('hides a discount grant request from a role without access to its price type', async () => {
        expect(await build([]).visibleOrNull(ctx, grant)).toBeNull();
        expect(await build(['type-b']).visibleOrNull(ctx, grant)).toBeNull();
    });

    it('shows it to a role with access', async () => {
        expect(await build(['type-a']).visibleOrNull(ctx, grant)).toBe(grant);
    });

    it('does not gate other request types', async () => {
        const other = {
            id: 'r2',
            requestType: 'creditTermApproval',
            payload: '{}',
        } as ApprovalRequest;
        expect(await build([]).visibleOrNull(ctx, other)).toBe(other);
    });

    it('denies an unparsable gated payload', async () => {
        const broken = { ...grant, payload: 'not json' } as ApprovalRequest;
        expect(await build(['type-a']).visibleOrNull(ctx, broken)).toBeNull();
    });

    it('assertVisible throws Forbidden for a hidden request and passes for a visible one', async () => {
        await expect(build([]).assertVisible(ctx, 'r1')).rejects.toThrow(ForbiddenError);
        await expect(build(['type-a']).assertVisible(ctx, 'r1')).resolves.toBeUndefined();
    });

    it('withGate adds the allowed codes without losing client options', async () => {
        expect(await build(['type-a']).withGate(ctx, { take: 3 })).toEqual({
            take: 3,
            allowedPriceTypeCodes: ['type-a'],
        });
    });
});

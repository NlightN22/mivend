import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ApprovalEligibilityRegistry } from '../../approval-eligibility.registry';
import type { ApprovalRequest } from '../../entities/approval-request.entity';

const ctx = {} as RequestContext;
const request = (requestType: string) => ({ id: 1, requestType, payload: '{}' }) as ApprovalRequest;

describe('ApprovalEligibilityRegistry', () => {
    it('lets a request type without a rule through', async () => {
        expect(await new ApprovalEligibilityRegistry().mayApprove(ctx, request('x'))).toBe(true);
    });

    it('asks only the rule of the request type', async () => {
        const registry = new ApprovalEligibilityRegistry();
        const rule = vi.fn(async () => false);
        registry.register('a', rule);
        expect(await registry.mayApprove(ctx, request('a'))).toBe(false);
        expect(await registry.mayApprove(ctx, request('b'))).toBe(true);
        expect(rule).toHaveBeenCalledTimes(1);
    });
});

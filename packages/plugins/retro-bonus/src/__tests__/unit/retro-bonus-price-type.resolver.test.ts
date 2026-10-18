import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { RetroBonusRulePriceTypeResolver } from '../../retro-bonus-rule.resolver';
import type { RetroBonusRule } from '../../retro-bonus-rule.entity';

describe('RetroBonusRulePriceTypeResolver', () => {
    const rule = { priceTypeErpId: 'e1' } as RetroBonusRule;
    const ctx = {} as RequestContext;

    it('hides the price type erp id from a viewer without access', async () => {
        const resolver = new RetroBonusRulePriceTypeResolver({
            isExternalIdAllowed: vi.fn(async () => false),
        } as never);
        expect(await resolver.priceTypeErpId(ctx, rule)).toBeNull();
    });

    it('returns it when access allows', async () => {
        const resolver = new RetroBonusRulePriceTypeResolver({
            isExternalIdAllowed: vi.fn(async () => true),
        } as never);
        expect(await resolver.priceTypeErpId(ctx, rule)).toBe('e1');
    });
});

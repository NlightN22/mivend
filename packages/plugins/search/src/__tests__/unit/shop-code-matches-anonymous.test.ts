import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import { ShopCodeMatchesResolver } from '../../internal-code-matches.resolver';
import type { InternalCodeMatchesService } from '../../internal-code-matches.service';

const parent = { input: { term: '48.3855' } as SearchInput };

function resolverWith(find: ReturnType<typeof vi.fn>): ShopCodeMatchesResolver {
    return new ShopCodeMatchesResolver({ find } as unknown as InternalCodeMatchesService);
}

// Parity with the external public endpoint: anonymous shoppers get exact article and part number only.
describe('ShopCodeMatchesResolver for anonymous shoppers', () => {
    it('returns no manufacturer code group without a signed-in user', async () => {
        const find = vi.fn();
        const result = await resolverWith(find).manufacturerCodeMatches(
            { activeUserId: undefined } as unknown as RequestContext,
            parent,
        );
        expect(result).toBeNull();
        expect(find).not.toHaveBeenCalled();
    });

    it('still serves article and part number groups', async () => {
        const find = vi.fn().mockResolvedValue({ items: [], total: 0 });
        const anon = { activeUserId: undefined } as unknown as RequestContext;
        await resolverWith(find).skuMatches(anon, parent);
        await resolverWith(find).partNumberMatches(anon, parent);
        expect(find).toHaveBeenCalledTimes(2);
    });

    it('serves the manufacturer code group to a signed-in shopper', async () => {
        const find = vi.fn().mockResolvedValue({ items: [], total: 0 });
        await resolverWith(find).manufacturerCodeMatches(
            { activeUserId: 5 } as unknown as RequestContext,
            parent,
        );
        expect(find).toHaveBeenCalledWith(
            expect.anything(),
            parent.input,
            'manufacturerCode',
            true,
        );
    });
});

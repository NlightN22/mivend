import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { LegalNameAbbreviationService } from '../../legal-name-abbreviation.service';

describe('LegalNameAbbreviationService.findAll', () => {
    it('lists with GraphQL null options (the query has no options argument)', async () => {
        const qb = { getManyAndCount: vi.fn().mockResolvedValue([[], 0]) };
        const build = vi.fn().mockReturnValue(qb);
        const service = new LegalNameAbbreviationService(
            {} as never,
            { build } as never,
            {} as never,
        );

        const page = await service.findAll({} as RequestContext, null as never);

        expect(page).toEqual({ items: [], totalItems: 0 });
        expect(build.mock.calls[0][1]).toEqual({});
    });
});

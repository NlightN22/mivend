import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { NotificationRetentionRuleService } from '../../notification-retention-rule.service';

describe('NotificationRetentionRuleService.findAll', () => {
    it('lists with GraphQL null options (the query has no options argument)', async () => {
        const qb = { getManyAndCount: vi.fn().mockResolvedValue([[], 0]) };
        const build = vi.fn().mockReturnValue(qb);
        const service = new NotificationRetentionRuleService(
            {} as never,
            { build } as never,
            {} as never,
        );

        const page = await service.findAll({} as RequestContext, null as never);

        expect(page).toEqual({ items: [], totalItems: 0 });
        expect(build.mock.calls[0][1]).toEqual({});
    });
});

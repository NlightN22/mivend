import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { QueryTooLargeError } from 'shared';

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

describe('NotificationRetentionRuleService.loadRows', () => {
    const serviceWith = (
        count: number,
    ): { service: NotificationRetentionRuleService; query: ReturnType<typeof vi.fn> } => {
        const query = vi.fn().mockResolvedValue(new Array(count).fill({ sourceType: 'a' }));
        const connection = { getRepository: () => ({ query }) };
        const service = new NotificationRetentionRuleService(
            connection as never,
            {} as never,
            {} as never,
        );
        return { service, query };
    };

    it('reads a set at the ceiling and fails one row over', async () => {
        const at = serviceWith(1000);
        await expect(at.service.loadRows({} as RequestContext)).resolves.toHaveLength(1000);
        expect(at.query.mock.calls[0][0]).toMatch(/LIMIT 1001$/);
        await expect(serviceWith(1001).service.loadRows({} as RequestContext)).rejects.toThrow(
            QueryTooLargeError,
        );
    });
});

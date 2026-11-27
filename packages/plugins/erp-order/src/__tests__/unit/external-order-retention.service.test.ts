import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ExternalOrderRetentionService } from '../../external-order-retention.service';

const monthsFor = (value: unknown): Promise<number> =>
    new ExternalOrderRetentionService(
        {} as never,
        {
            getSettings: async () => ({ customFields: { externalOrderRetentionMonths: value } }),
        } as never,
    ).retentionMonths({} as RequestContext);

describe('ExternalOrderRetentionService.retentionMonths', () => {
    it.each([
        [24, 24],
        [600, 600],
        [null, 12],
        [0, 12],
        [-3, 12],
        [601, 12],
        [2_000_000_000, 12],
    ])('%s months -> %s', async (value, expected) => {
        expect(await monthsFor(value)).toBe(expected);
    });
});

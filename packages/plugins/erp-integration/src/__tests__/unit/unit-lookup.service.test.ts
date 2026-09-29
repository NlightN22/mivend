import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { UnitLookupService } from '../../unit-lookup.service';

describe('UnitLookupService', () => {
    const ctx = {} as RequestContext;

    it('finds a UnitRecord by its entityId', async () => {
        const findOne = vi.fn().mockResolvedValue({ entityId: 'unit-1', ratioToBase: 6 });
        const connection = { getRepository: vi.fn().mockReturnValue({ findOne }) };
        const service = new UnitLookupService(connection as never);

        const result = await service.findByEntityId(ctx, 'unit-1');

        expect(findOne).toHaveBeenCalledWith({ where: { entityId: 'unit-1' } });
        expect(result).toEqual({ entityId: 'unit-1', ratioToBase: 6 });
    });

    it('returns null when no matching UnitRecord exists', async () => {
        const findOne = vi.fn().mockResolvedValue(null);
        const connection = { getRepository: vi.fn().mockReturnValue({ findOne }) };
        const service = new UnitLookupService(connection as never);

        const result = await service.findByEntityId(ctx, 'unit-missing');

        expect(result).toBeNull();
    });
});

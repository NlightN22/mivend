import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CounterpartyVersionedEvent } from '../../counterparty-versioned.event';
import { CounterpartyVersionService } from '../../counterparty-version.service';

const ctx = {} as RequestContext;

function setup(rows: Array<{ erpId: string; version: number }>): {
    service: CounterpartyVersionService;
    query: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
} {
    const query = vi.fn(async () => rows);
    const publish = vi.fn();
    const connection = {
        getRepository: () => ({ query }),
        rawConnection: { query },
    };
    return {
        service: new CounterpartyVersionService(connection as never, { publish } as never),
        query,
        publish,
    };
}

describe('CounterpartyVersionService', () => {
    it('publishes one versioned event per bumped record, with the erp id and the new version', async () => {
        const { service, publish } = setup([{ erpId: 'cp-1', version: 4 }]);
        expect(await service.bump(ctx, 7)).toBe(4);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish.mock.calls[0][0]).toBeInstanceOf(CounterpartyVersionedEvent);
        expect(publish.mock.calls[0][0]).toMatchObject({ erpId: 'cp-1', version: 4 });
    });

    it('fails loudly when the record is gone instead of dropping the bump', async () => {
        const { service, publish } = setup([]);
        await expect(service.bump(ctx, 7)).rejects.toThrow(/not found for version bump/);
        expect(publish).not.toHaveBeenCalled();
    });

    it('bumpMany of nothing touches nothing', async () => {
        const { service, query, publish } = setup([]);
        expect(await service.bumpMany(ctx, [])).toEqual([]);
        expect(query).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });
});

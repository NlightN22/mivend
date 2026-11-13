import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { QueryTooLargeError } from 'shared';

import { OrderLineIdentityService } from '../../order-line-identity.service';

const ctx = {} as RequestContext;

describe('OrderLineIdentityService.uuidsByLineId', () => {
    it('reads all requested lines in one query, keyed by line id', async () => {
        const find = vi.fn().mockResolvedValue([
            { orderLineId: 1, uuid: 'uuid-1' },
            { orderLineId: 2, uuid: 'uuid-2' },
        ]);
        const connection = { getRepository: vi.fn(() => ({ find })) };
        const service = new OrderLineIdentityService(
            connection as unknown as TransactionalConnection,
        );

        const result = await service.uuidsByLineId(ctx, ['1', 2]);

        expect(find).toHaveBeenCalledTimes(1);
        expect(result).toEqual(
            new Map([
                ['1', 'uuid-1'],
                ['2', 'uuid-2'],
            ]),
        );
    });

    it('bounds the read by the number of ids and fails past it', async () => {
        const find = vi.fn().mockResolvedValue([
            { orderLineId: 1, uuid: 'uuid-1' },
            { orderLineId: 2, uuid: 'uuid-2' },
        ]);
        const connection = { getRepository: vi.fn(() => ({ find })) };
        const service = new OrderLineIdentityService(
            connection as unknown as TransactionalConnection,
        );

        await expect(service.uuidsByLineId(ctx, [1, 2])).resolves.toHaveProperty('size', 2);
        expect(find).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
        await expect(service.uuidsByLineId(ctx, [1])).rejects.toThrow(QueryTooLargeError);
    });

    it('skips the query for an empty line list', async () => {
        const connection = { getRepository: vi.fn() };
        const service = new OrderLineIdentityService(
            connection as unknown as TransactionalConnection,
        );

        expect(await service.uuidsByLineId(ctx, [])).toEqual(new Map());
        expect(connection.getRepository).not.toHaveBeenCalled();
    });
});

import { RequestContext, TransactionalConnection } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { NumberingService } from '../../numbering.service';

const mockCtx = {} as unknown as RequestContext;

function makeService(nextvalQueue: string[]): NumberingService {
    const query = vi.fn(async () => [{ nextval: nextvalQueue.shift() }]);
    const connection = { rawConnection: { query } } as unknown as TransactionalConnection;
    return new NumberingService(connection, { instanceNumberCode: '100' });
}

describe('NumberingService', () => {
    it('increases sequentially for the same documentType', async () => {
        const service = makeService(['1', '2', '3']);
        expect(await service.next(mockCtx, 'order')).toBe('1000000001');
        expect(await service.next(mockCtx, 'order')).toBe('1000000002');
        expect(await service.next(mockCtx, 'order')).toBe('1000000003');
    });

    it('prefixes with the exact 3-digit instance code', async () => {
        const service = makeService(['42']);
        const number = await service.next(mockCtx, 'invoice');
        expect(number.slice(0, 3)).toBe('100');
    });

    it('does not truncate a sequence value needing an 8th digit', async () => {
        const service = makeService(['12345678']);
        const number = await service.next(mockCtx, 'payment');
        expect(number).toBe('10012345678');
    });

    it('formats order document numbers with zero-padded ordinal', () => {
        const service = makeService([]);
        expect(service.formatOrderDocumentNumber('1000000012', 1)).toBe('1000000012-01');
        expect(service.formatOrderDocumentNumber('1000000012', 15)).toBe('1000000012-15');
    });
});

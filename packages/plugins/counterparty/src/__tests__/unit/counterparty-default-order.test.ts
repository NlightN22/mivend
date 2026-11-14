import { describe, expect, it, vi } from 'vitest';

import { CounterpartyService } from '../../counterparty.service';

describe('counterparty default order', () => {
    it('sorts by short name and ends with the id so equal names page stably', () => {
        const orderBy = vi.fn();
        const addOrderBy = vi.fn();
        const qb = { orderBy, addOrderBy };
        orderBy.mockReturnValue(qb);
        addOrderBy.mockReturnValue(qb);
        const service = Object.create(CounterpartyService.prototype) as {
            connection: unknown;
            baseVisibleQb(ctx: unknown): unknown;
        };
        service.connection = { getRepository: () => ({ createQueryBuilder: () => qb }) };

        service.baseVisibleQb({});

        expect(orderBy).toHaveBeenCalledWith('c.shortName', 'ASC');
        expect(addOrderBy).toHaveBeenCalledWith('c.id', 'ASC');
    });
});

import { describe, it, expect, vi } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';
import { getPageAndCount } from '../../paginate-query';

function fakeQb() {
    const qb = {
        getCount: vi.fn().mockResolvedValue(7),
        getManyAndCount: vi.fn().mockResolvedValue([[{ id: 1 }], 7]),
        take: vi.fn(),
        skip: vi.fn(),
    };
    qb.take.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    return qb;
}
const asQb = (qb: ReturnType<typeof fakeQb>): SelectQueryBuilder<{ id: number }> =>
    qb as unknown as SelectQueryBuilder<{ id: number }>;

describe('getPageAndCount', () => {
    it.each([0, -1])('take %i counts only and never hydrates rows', async take => {
        const qb = fakeQb();
        const hydrate = vi.fn();
        const page = await getPageAndCount(asQb(qb), take, 5, hydrate);
        expect(page).toEqual({ items: [], totalItems: 7 });
        expect(qb.getManyAndCount).not.toHaveBeenCalled();
        expect(qb.take).not.toHaveBeenCalled();
        expect(hydrate).not.toHaveBeenCalled();
    });

    it('take > 0 hydrates the page with take/skip applied', async () => {
        const qb = fakeQb();
        const hydrate = vi.fn();
        const page = await getPageAndCount(asQb(qb), 10, 20, hydrate);
        expect(page).toEqual({ items: [{ id: 1 }], totalItems: 7 });
        expect(hydrate).toHaveBeenCalledWith(qb);
        expect(qb.take).toHaveBeenCalledWith(10);
        expect(qb.skip).toHaveBeenCalledWith(20);
        expect(qb.getCount).not.toHaveBeenCalled();
    });

    it('undefined take keeps the builder limits untouched', async () => {
        const qb = fakeQb();
        const page = await getPageAndCount(asQb(qb), undefined);
        expect(page.totalItems).toBe(7);
        expect(qb.take).not.toHaveBeenCalled();
        expect(qb.skip).not.toHaveBeenCalled();
    });
});

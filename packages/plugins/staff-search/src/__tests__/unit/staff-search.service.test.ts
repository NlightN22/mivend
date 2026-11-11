import { Logger, type RequestContext } from '@vendure/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StaffSearchRegistry } from '../../staff-search.registry';
import { StaffSearchService } from '../../staff-search.service';
import type { GlobalSearchHit, GlobalSearchProvider } from '../../types';

const hit = (id: string): GlobalSearchHit => ({
    id,
    number: id,
    title: id,
    subtitle: null,
    status: null,
    counterpartyId: null,
});

const ctxWith = (granted: string[]): RequestContext =>
    ({ userHasPermissions: (p: string[]) => p.some(x => granted.includes(x)) }) as never;

function provider(
    kind: string,
    position: number,
    permissions: string[],
    search: GlobalSearchProvider['search'],
): GlobalSearchProvider {
    return { kind, position, permissions: permissions as never, search };
}

function serviceWith(...providers: GlobalSearchProvider[]): StaffSearchService {
    const registry = new StaffSearchRegistry();
    providers.forEach(p => registry.register(p));
    return new StaffSearchService(registry);
}

afterEach(() => vi.restoreAllMocks());

describe('StaffSearchService', () => {
    it('answers empty for a short term without asking any provider', async () => {
        const search = vi.fn().mockResolvedValue([hit('1')]);
        const service = serviceWith(provider('a', 1, ['P'], search));
        expect(await service.search(ctxWith(['P']), ' a ')).toEqual([]);
        expect(search).not.toHaveBeenCalled();
    });

    it('omits a kind the caller has no permission for and never calls it', async () => {
        const hidden = vi.fn().mockResolvedValue([hit('9')]);
        const service = serviceWith(
            provider('open', 1, ['P'], async () => [hit('1')]),
            provider('closed', 2, ['Q'], hidden),
        );
        const groups = await service.search(ctxWith(['P']), 'term');
        expect(groups.map(g => g.kind)).toEqual(['open']);
        expect(hidden).not.toHaveBeenCalled();
    });

    it('passes the trimmed term and the clamped limit; orders groups by position', async () => {
        const search = vi.fn().mockResolvedValue([hit('1')]);
        const service = serviceWith(
            provider('late', 20, ['P'], search),
            provider('early', 10, ['P'], search),
        );
        const groups = await service.search(ctxWith(['P']), '  term ', 500);
        expect(groups.map(g => g.kind)).toEqual(['early', 'late']);
        expect(search).toHaveBeenCalledWith(expect.anything(), 'term', 10);
    });

    it('defaults the limit to 5 and trims an over-long provider answer', async () => {
        const many = Array.from({ length: 8 }, (_, i) => hit(String(i)));
        const search = vi.fn().mockResolvedValue(many);
        const service = serviceWith(provider('a', 1, ['P'], search));
        const [group] = await service.search(ctxWith(['P']), 'term');
        expect(search).toHaveBeenCalledWith(expect.anything(), 'term', 5);
        expect(group.items).toHaveLength(5);
    });

    it('drops empty groups', async () => {
        const service = serviceWith(provider('a', 1, ['P'], async () => []));
        expect(await service.search(ctxWith(['P']), 'term')).toEqual([]);
    });

    it('logs a failing kind with its name and still returns the others', async () => {
        const error = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
        const service = serviceWith(
            provider('broken', 1, ['P'], async () => {
                throw new Error('boom');
            }),
            provider('fine', 2, ['P'], async () => [hit('1')]),
        );
        const groups = await service.search(ctxWith(['P']), 'term');
        expect(groups.map(g => g.kind)).toEqual(['fine']);
        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toContain('broken');
    });
});

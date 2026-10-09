import { describe, expect, it, vi } from 'vitest';

vi.mock('@vendure/core', () => ({
    FacetService: class {},
    FacetValueService: class {},
    Logger: { error: vi.fn() },
    ProcessContext: class {},
    RequestContextService: class {},
    TransactionalConnection: class {},
    VendureEntity: class {},
}));
vi.mock('../../entities/product-characteristic.entity', () => ({
    ProductCharacteristic: class {},
}));

import { CharacteristicFacetService } from '../../characteristic-facet.service';

const row = (key: string, normalized: string[] | null) => ({
    group: 'attribute' as const,
    key,
    rawValue: null,
    normalizedValue: normalized ? JSON.stringify(normalized) : null,
    structuredJson: null,
});

function makeService(existingFacetValues: string[] = [], isServer = true, stored: unknown[] = []) {
    const facetService = {
        findByCode: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue({ id: 'f1' }),
    };
    const facetValueService = {
        findByFacetId: vi.fn().mockResolvedValue(existingFacetValues.map(code => ({ code }))),
        create: vi.fn().mockResolvedValue({}),
    };
    const qb: Record<string, unknown> = {};
    for (const m of ['select', 'distinct']) qb[m] = () => qb;
    qb.getRawMany = async () => stored;
    const connection = {
        getRepository: () => ({ createQueryBuilder: () => qb, query: vi.fn() }),
        withTransaction: (c: unknown, work: (tx: unknown) => Promise<void>) => work(c),
    };
    const service = new CharacteristicFacetService(
        facetService as never,
        facetValueService as never,
        connection as never,
        { create: vi.fn().mockResolvedValue({}) } as never,
        { isServer } as never,
    );
    return { service, facetService, facetValueService };
}

const ctx = {} as never;

describe('CharacteristicFacetService', () => {
    it('creates a facet per key and a value per normalized entry', async () => {
        const { service, facetService, facetValueService } = makeService();
        await service.ensureValues(ctx, [
            row('Тип', ['синтетическое']),
            row('Сезонность', ['летние', 'зимние']),
        ]);
        expect(facetService.create.mock.calls.map(c => c[1].code)).toEqual([
            'characteristic:Тип',
            'characteristic:Сезонность',
        ]);
        expect(facetValueService.create.mock.calls.map(c => c[2].code)).toEqual([
            'синтетическое',
            'летние',
            'зимние',
        ]);
    });

    it('is idempotent across repeated and overlapping events', async () => {
        const { service, facetValueService } = makeService(['летние']);
        await service.ensureValues(ctx, [row('Сезонность', ['летние', 'зимние'])]);
        await service.ensureValues(ctx, [row('Сезонность', ['зимние'])]);
        expect(facetValueService.create).toHaveBeenCalledTimes(1);
        expect(facetValueService.findByFacetId).toHaveBeenCalledTimes(1);
    });

    it('skips the manufacturer key and rows without normalized values', async () => {
        const { service, facetService } = makeService();
        await service.ensureValues(ctx, [row('Производитель', ['acme']), row('Тип', null)]);
        expect(facetService.create).not.toHaveBeenCalled();
    });

    it('backfills facet values from stored characteristics on the server process only', async () => {
        const stored = [{ key: 'Тип', normalizedValue: '["синтетическое"]' }];
        const server = makeService([], true, stored);
        await server.service.onApplicationBootstrap();
        expect(server.facetValueService.create).toHaveBeenCalledTimes(1);
        const worker = makeService([], false, stored);
        await worker.service.onApplicationBootstrap();
        expect(worker.facetValueService.create).not.toHaveBeenCalled();
    });
});

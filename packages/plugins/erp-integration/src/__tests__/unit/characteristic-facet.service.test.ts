import { describe, expect, it, vi } from 'vitest';

vi.mock('@vendure/core', () => ({ FacetService: class {}, FacetValueService: class {} }));

import { CharacteristicFacetService } from '../../characteristic-facet.service';

const row = (key: string, normalized: string[] | null) => ({
    group: 'attribute' as const,
    key,
    rawValue: null,
    normalizedValue: normalized ? JSON.stringify(normalized) : null,
    structuredJson: null,
});

function makeService(existingFacetValues: string[] = []) {
    const facetService = {
        findByCode: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue({ id: 'f1' }),
    };
    const facetValueService = {
        findByFacetId: vi.fn().mockResolvedValue(existingFacetValues.map(code => ({ code }))),
        create: vi.fn().mockResolvedValue({}),
    };
    const service = new CharacteristicFacetService(
        facetService as never,
        facetValueService as never,
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
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (file: string): string => readFileSync(join(__dirname, '../..', file), 'utf8');

describe('internal Elasticsearch backend availability mode (pinned no-op, #177)', () => {
    it.each(['search.service.ts', 'product-lookup.service.ts', 'search.resolver.ts'])(
        '%s neither reads nor sends availabilityMode',
        file => {
            expect(src(file)).not.toMatch(/availabilityMode|AVAILABILITY_MODE/);
        },
    );

    it('inStock stays on-hand only at the viewer branch warehouses', () => {
        expect(src('product-lookup.service.ts')).toContain('andProductInStock');
        expect(src('search-filter-resolver.service.ts')).toContain('getViewerWarehouseErpIds');
    });
});

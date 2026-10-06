import { describe, expect, it } from 'vitest';

import { assetUrl } from '../composables/assetUrl';

describe('assetUrl', () => {
    it('appends the preset as the first query parameter', () => {
        expect(assetUrl('/assets/preview/a__preview.jpg', 'small')).toBe(
            '/assets/preview/a__preview.jpg?preset=small',
        );
    });

    it('appends to an existing query string', () => {
        expect(assetUrl('/assets/a.jpg?x=1', 'large')).toBe('/assets/a.jpg?x=1&preset=large');
    });
});

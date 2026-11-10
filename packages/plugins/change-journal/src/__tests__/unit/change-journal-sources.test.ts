import { describe, expect, it } from 'vitest';

import { isIntegrationRoute } from '../../change-journal-sources';

describe('isIntegrationRoute', () => {
    it.each([
        ['/erp/import/batch', true],
        ['/erp/callback/order-status', true],
        ['/erp/orders/:orderCode/status', true],
        ['/erp', true],
        ['/erpx/thing', false],
        ['/document-pdf/:uuid', false],
        [undefined, false],
    ])('%s -> %s', (path, expected) => expect(isIntegrationRoute(path)).toBe(expected));
});

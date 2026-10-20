import { describe, expect, it } from 'vitest';
import { withoutDemoOnly } from '../../pages/account/demoOnlyLinks';

const links = [
    { to: '/proforma-invoices' },
    { to: '/reconciliation-acts' },
    { to: '/requests' },
    { to: '/account/balance' },
    { to: '/account/employees' },
    { to: '/account/settings' },
];

describe('withoutDemoOnly', () => {
    it('keeps every entry when demo data is allowed', () => {
        expect(withoutDemoOnly(links, true)).toEqual(links);
    });

    it('drops acts, requests and employees in production', () => {
        expect(withoutDemoOnly(links, false).map(l => l.to)).toEqual([
            '/proforma-invoices',
            '/account/balance',
            '/account/settings',
        ]);
    });
});

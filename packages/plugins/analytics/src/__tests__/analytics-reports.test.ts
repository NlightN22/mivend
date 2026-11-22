import { describe, expect, it } from 'vitest';

import { reportsFor } from '../analytics-reports';
import { ANALYTICS_REPORTS } from '../definitions';

describe('analytics report registry', () => {
    it('has unique keys', () => {
        const keys = ANALYTICS_REPORTS.map(r => r.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('describes every report completely and keeps only the orders report available', () => {
        for (const r of ANALYTICS_REPORTS) {
            for (const field of [r.key, r.title, r.description, r.area, r.permission, r.note]) {
                expect(field.trim(), r.key).not.toBe('');
            }
            expect(r.status, r.key).toBe(r.key === 'orders' ? 'available' : 'planned');
        }
    });

    it('registers the owner-requested reports', () => {
        const keys = ANALYTICS_REPORTS.map(r => r.key);
        expect(keys).toEqual(
            expect.arrayContaining([
                'sales-dynamics',
                'sales-dynamics-by-brand',
                'churned-customers',
                'churned-customers-by-brand',
                'assortment-churn',
                'sales-by-manager-at-sale',
                'sales-by-manager-current',
            ]),
        );
    });

    it('lists only the reports the caller holds the permission for', () => {
        expect(reportsFor(ANALYTICS_REPORTS, () => false)).toEqual([]);
        expect(reportsFor(ANALYTICS_REPORTS, () => true)).toEqual(ANALYTICS_REPORTS);
        const only = ANALYTICS_REPORTS[0].permission;
        expect(reportsFor(ANALYTICS_REPORTS, p => p === only).length).toBe(
            ANALYTICS_REPORTS.length,
        );
        const mixed = [
            ...ANALYTICS_REPORTS,
            { ...ANALYTICS_REPORTS[0], key: 'x', permission: 'Other' },
        ];
        expect(reportsFor(mixed, p => p === 'Other').map(r => r.key)).toEqual(['x']);
    });
});

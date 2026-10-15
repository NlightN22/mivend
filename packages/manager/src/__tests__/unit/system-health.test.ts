import { describe, it, expect } from 'vitest';
import { buildSystemHealthChecklist, type SystemHealthQueryResult } from '../../api/system-health';

// Each of the 6 checks must be independent: one entity type's presence never flips another item.
// Channel.defaultTaxZone may be null while Zone/TaxCategory/TaxRate exist; only it is missing.

function fullyHealthyResult(): SystemHealthQueryResult {
    return {
        zones: { totalItems: 1 },
        taxCategories: { totalItems: 1 },
        taxRates: { items: [{ enabled: true }] },
        activeChannel: { defaultTaxZone: { id: 'zone-1' } },
        shippingMethods: { totalItems: 1 },
        paymentMethods: { items: [{ enabled: true }] },
    };
}

describe('buildSystemHealthChecklist', () => {
    it('reports every item ok when all 6 conditions are satisfied', () => {
        const checklist = buildSystemHealthChecklist(fullyHealthyResult());
        expect(checklist).toHaveLength(6);
        expect(checklist.every(item => item.status === 'ok')).toBe(true);
    });

    it('reports every item missing when nothing exists', () => {
        const checklist = buildSystemHealthChecklist({
            zones: { totalItems: 0 },
            taxCategories: { totalItems: 0 },
            taxRates: { items: [] },
            activeChannel: { defaultTaxZone: null },
            shippingMethods: { totalItems: 0 },
            paymentMethods: { items: [] },
        });
        expect(checklist.every(item => item.status === 'missing')).toBe(true);
    });

    // The specific incident this issue was filed about.
    it('reports only the default-tax-zone item missing when Zone/TaxCategory/TaxRate all exist but defaultTaxZone is null', () => {
        const result = fullyHealthyResult();
        result.activeChannel = { defaultTaxZone: null };

        const checklist = buildSystemHealthChecklist(result);
        const byId = new Map(checklist.map(item => [item.id, item]));

        expect(byId.get('zone')?.status).toBe('ok');
        expect(byId.get('tax-category')?.status).toBe('ok');
        expect(byId.get('tax-rate')?.status).toBe('ok');
        expect(byId.get('default-tax-zone')?.status).toBe('missing');
        expect(byId.get('default-tax-zone')?.detail).toBeTruthy();
        expect(byId.get('shipping-method')?.status).toBe('ok');
        expect(byId.get('payment-method')?.status).toBe('ok');
    });

    it('reports the payment-method item missing when payment methods exist but none are enabled', () => {
        const result = fullyHealthyResult();
        result.paymentMethods = { items: [{ enabled: false }, { enabled: false }] };

        const checklist = buildSystemHealthChecklist(result);
        expect(checklist.find(item => item.id === 'payment-method')?.status).toBe('missing');
    });

    it('reports the tax-rate item missing when the tax rate list is empty', () => {
        const result = fullyHealthyResult();
        result.taxRates = { items: [] };

        const checklist = buildSystemHealthChecklist(result);
        expect(checklist.find(item => item.id === 'tax-rate')?.status).toBe('missing');
    });
});

import { describe, expect, it } from 'vitest';
import { toListOptions } from '../../api/counterpartyPortalAccess';
import {
    buildActivationColumns,
    UNASSIGNED_BRANCH,
} from '../../components/bulk-operations/activationColumns';
import {
    READINESS_BADGE_VARIANT,
    readinessText,
} from '../../components/bulk-operations/activationReadiness';

describe('activation table columns', () => {
    it('branch filter lists Unassigned first, then every loaded branch', () => {
        const columns = buildActivationColumns([
            { id: 'b1', erpId: 'e1', name: 'Branch A' },
            { id: 'b2', erpId: 'e2', name: 'Branch B' },
        ]);
        const filter = columns.find(c => c.field === 'branch')?.filterConfig;
        expect(filter).toMatchObject({ type: 'select' });
        expect(filter && 'options' in filter ? filter.options : []).toEqual([
            { value: UNASSIGNED_BRANCH, label: 'Unassigned' },
            { value: 'b1', label: 'Branch A' },
            { value: 'b2', label: 'Branch B' },
        ]);
    });

    it('branch options follow the branches passed in, so a late load reaches the filter', () => {
        const before = buildActivationColumns([]).find(c => c.field === 'branch')?.filterConfig;
        const after = buildActivationColumns([{ id: 'b1', erpId: 'e1', name: 'Branch A' }]).find(
            c => c.field === 'branch',
        )?.filterConfig;
        expect(before && 'options' in before ? before.options : []).toHaveLength(1);
        expect(after && 'options' in after ? after.options : []).toHaveLength(2);
    });

    it('readiness column filters by status with the same variants as the row badge', () => {
        const filter = buildActivationColumns([]).find(c => c.field === 'readiness')?.filterConfig;
        expect(filter).toMatchObject({ type: 'status' });
        const options = filter && 'options' in filter ? filter.options : [];
        for (const o of options) {
            expect(o).toHaveProperty(
                'variant',
                READINESS_BADGE_VARIANT[o.value as keyof typeof READINESS_BADGE_VARIANT],
            );
        }
        expect(options.map(o => o.value)).toEqual([
            'ready',
            'missing-data',
            'erp-inactive',
            'activated',
        ]);
    });
});

describe('readinessText', () => {
    it('names exactly what is missing', () => {
        expect(
            readinessText('missing-data', { phone: null, officialEmail: 'a@example.test' }),
        ).toBe('Missing phone (ERP)');
        expect(readinessText('missing-data', { phone: '1', officialEmail: '' })).toBe(
            'Missing email (ERP)',
        );
        expect(readinessText('missing-data', { phone: '', officialEmail: null })).toBe(
            'Missing phone and email (ERP)',
        );
    });

    it('uses the plain label for the other states', () => {
        expect(readinessText('ready', { phone: '1', officialEmail: 'a' })).toBe(
            'Ready to activate',
        );
        expect(readinessText('erp-inactive', { phone: null, officialEmail: null })).toBe(
            'ERP inactive',
        );
    });
});

describe('toListOptions', () => {
    it('maps the Unassigned flag to branchUnassigned and drops branchId', () => {
        expect(
            toListOptions({ branchId: UNASSIGNED_BRANCH, branchUnassigned: true }),
        ).toMatchObject({
            branchId: undefined,
            branchUnassigned: true,
        });
    });

    it('passes a real branch and readiness through and drops empty values', () => {
        expect(
            toListOptions({ branchId: 'b1', readiness: 'ready', search: '', managerErpId: '' }),
        ).toEqual({
            search: undefined,
            status: undefined,
            managerErpId: undefined,
            branchId: 'b1',
            branchUnassigned: undefined,
            readiness: 'ready',
        });
    });
});

import { describe, expect, it } from 'vitest';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { operatorsFor } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterOperators';
import {
    ACTIVATION_VIEWS,
    activationConditionsFromUrl,
    activationConditionsToUrl,
    conditionsToCounterpartyFilter,
    readinessOfView,
} from '../../api/activationFilter';
import {
    buildActivationColumns,
    DEFAULT_HIDDEN_COLUMNS,
    UNASSIGNED_BRANCH,
} from '../../components/bulk-operations/activationColumns';
import { readinessOf, readinessText } from '../../components/bulk-operations/activationReadiness';

describe('activation table columns', () => {
    const columns = buildActivationColumns([
        { id: 'b1', erpId: 'e1', name: 'Branch A' },
        { id: 'b2', erpId: 'e2', name: 'Branch B' },
    ]);

    it('uses the filter builder only: no header funnels', () => {
        expect(columns.every(c => c.filterConfig.type === 'none')).toBe(true);
    });

    it('has one required identifying column with the mobile title, and one mobile badge', () => {
        expect(columns.filter(c => c.required).map(c => c.field)).toEqual(['shortName']);
        expect(columns.filter(c => c.mobile?.primary).map(c => c.field)).toEqual(['shortName']);
        expect(columns.filter(c => c.mobile?.badge).map(c => c.field)).toEqual(['readiness']);
    });

    it('branch filter lists Unassigned first, then every loaded branch', () => {
        expect(columns.find(c => c.field === 'branch')?.filterOptions).toEqual([
            { value: UNASSIGNED_BRANCH, label: 'Unassigned' },
            { value: 'b1', label: 'Branch A' },
            { value: 'b2', label: 'Branch B' },
        ]);
    });

    it('offers no operator the server rejects (regex-based starts/ends with)', () => {
        for (const column of toFilterColumns(columns)) {
            const operators = operatorsFor(column);
            expect(operators).not.toContain('startsWith');
            expect(operators).not.toContain('endsWith');
        }
    });

    it('hides the secondary columns by default', () => {
        expect(DEFAULT_HIDDEN_COLUMNS).toEqual(['phone', 'isActive']);
    });
});

describe('activation views', () => {
    it('are All plus the five readiness states, and only the states reach the server', () => {
        expect(ACTIVATION_VIEWS.map(v => v.key)).toEqual([
            'all',
            'ready',
            'missing-data',
            'inn-duplicate',
            'erp-inactive',
            'activated',
        ]);
        expect(readinessOfView('all')).toBeUndefined();
        expect(readinessOfView('missing-data')).toBe('missing-data');
        expect(readinessOfView('bogus')).toBeUndefined();
    });
});

describe('conditionsToCounterpartyFilter', () => {
    it('maps builder conditions to the server field names', () => {
        expect(
            conditionsToCounterpartyFilter([
                { columnKey: 'manager', operator: 'eq', value: 'pat' },
                { columnKey: 'branch', operator: 'eq', value: 'b1' },
                { columnKey: 'isActive', operator: 'isFalse', value: '' },
                { columnKey: 'officialEmail', operator: 'isNull', value: '' },
            ]),
        ).toEqual({
            managerErpId: { eq: 'pat' },
            branchId: { eq: 'b1' },
            isActive: { eq: false },
            officialEmail: { isNull: true },
        });
    });

    it('turns Unassigned into an emptiness test on the branch id', () => {
        expect(
            conditionsToCounterpartyFilter([
                { columnKey: 'branch', operator: 'eq', value: UNASSIGNED_BRANCH },
            ]),
        ).toEqual({ branchId: { isNull: true } });
        expect(
            conditionsToCounterpartyFilter([
                { columnKey: 'branch', operator: 'notEq', value: UNASSIGNED_BRANCH },
            ]),
        ).toEqual({ branchId: { isNull: false } });
    });

    it('puts a second condition on the same field into _and and ignores unknown columns', () => {
        const filter = conditionsToCounterpartyFilter([
            { columnKey: 'inn', operator: 'contains', value: '77' },
            { columnKey: 'inn', operator: 'notContains', value: '88' },
            { columnKey: 'nope', operator: 'eq', value: 'x' },
        ]);
        expect(filter).toEqual({
            inn: { contains: '77' },
            _and: [{ inn: { notContains: '88' } }],
        });
    });

    it('round-trips through the URL', () => {
        const conditions = [{ columnKey: 'branch', operator: 'eq' as const, value: 'b1' }];
        expect(activationConditionsFromUrl(activationConditionsToUrl(conditions))).toEqual(
            conditions,
        );
    });
});

describe('readinessOf', () => {
    it('reads the server value and falls back to missing data for an unknown one', () => {
        expect(readinessOf({ portalReadiness: 'inn-duplicate' })).toBe('inn-duplicate');
        expect(readinessOf({ portalReadiness: 'ready' })).toBe('ready');
        expect(readinessOf({ portalReadiness: 'future-state' })).toBe('missing-data');
    });
});

describe('readinessText', () => {
    const full = { phone: '1', officialEmail: 'a@example.test', inn: '7700000001' };

    it('names exactly what is missing', () => {
        expect(readinessText('missing-data', { ...full, phone: null })).toBe('Missing phone (ERP)');
        expect(readinessText('missing-data', { ...full, officialEmail: '' })).toBe(
            'Missing email (ERP)',
        );
        expect(readinessText('missing-data', { ...full, inn: null })).toBe('Missing INN (ERP)');
        expect(readinessText('missing-data', { ...full, inn: ' - ' })).toBe('Missing INN (ERP)');
        expect(readinessText('missing-data', { phone: '', officialEmail: null, inn: '' })).toBe(
            'Missing phone, email and INN (ERP)',
        );
        expect(readinessText('missing-data', { ...full, phone: null, inn: null })).toBe(
            'Missing phone and INN (ERP)',
        );
    });

    it('uses the plain label for the other states', () => {
        expect(readinessText('ready', full)).toBe('Ready to activate');
        expect(readinessText('inn-duplicate', full)).toBe('Duplicate INN');
        expect(readinessText('erp-inactive', { phone: null, officialEmail: null, inn: null })).toBe(
            'ERP inactive',
        );
    });
});

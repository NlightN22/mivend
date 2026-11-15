import { describe, it, expect } from 'vitest';
import {
    POWER_OF_ATTORNEY_FILTER_COLUMNS,
    restorePowersOfAttorneyFilters,
} from '../../api/powersOfAttorneyList';
import {
    POWERS_OF_ATTORNEY_URL_DEFAULTS,
    fromPowersOfAttorneyUrlState,
    toPowersOfAttorneyUrlState,
} from '../../composables/powersOfAttorneyListUrl';
import { toPowerOfAttorneyRows } from '../../components/erp-documents/powersOfAttorneyRows';
import enErp from '../../i18n/en/erpDocuments';
import ruErp from '../../i18n/ru/erpDocuments';

describe('powers of attorney list', () => {
    it('round-trips filters, sort, customer preset and page size through the URL', () => {
        const conditions = [{ columnKey: 'status', operator: 'eq' as const, value: 'expired' }];
        const sort = { field: 'number' as const, dir: 'ASC' as const };
        const url = toPowersOfAttorneyUrlState(
            { search: '7', view: 'all', conditions },
            '12',
            sort,
            20,
        );
        expect(fromPowersOfAttorneyUrlState(url)).toEqual({
            filters: { search: '7', view: 'all', conditions },
            sort,
            counterpartyId: '12',
            pageSize: 20,
        });
    });

    it('falls back to the defaults on a hostile URL', () => {
        const parsed = fromPowersOfAttorneyUrlState({
            ...POWERS_OF_ATTORNEY_URL_DEFAULTS,
            sortField: 'isDeleted',
            counterpartyId: '1 OR 1=1',
            pageSize: '-3',
        });
        expect(parsed.sort.field).toBe('validUntil');
        expect(parsed.counterpartyId).toBe('');
        expect(parsed.pageSize).toBe(10);
    });

    it('drops saved conditions on columns the table does not filter', () => {
        const restored = restorePowersOfAttorneyFilters({
            search: 'x',
            conditions: [{ columnKey: 'bogus', operator: 'eq', value: '1' }],
        });
        expect(restored.conditions).toEqual([]);
        expect(POWER_OF_ATTORNEY_FILTER_COLUMNS.map(c => c.key)).toContain('status');
    });

    it('maps a row with placeholders, the deleted-contract marker and the scan indicator', () => {
        const [row] = toPowerOfAttorneyRows([
            {
                id: '1',
                number: '5',
                holderName: '',
                validFrom: null,
                validUntil: null,
                status: 'expired',
                scanId: 's-1',
                hasScan: true,
                contractId: null,
                contractName: null,
                counterpartyId: null,
                counterpartyName: null,
                contractDeleted: true,
            },
        ]);
        expect(row).toMatchObject({
            holder: '—',
            customer: '—',
            contract: '—',
            status: 'expired',
            contractDeleted: true,
            hasScan: true,
            scanId: 's-1',
        });
    });

    it('keeps the Russian catalogue in step with the English one', () => {
        expect(Object.keys(ruErp.powerOfAttorney).sort()).toEqual(
            Object.keys(enErp.powerOfAttorney).sort(),
        );
    });
});

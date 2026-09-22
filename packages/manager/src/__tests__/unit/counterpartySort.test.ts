import { describe, it, expect } from 'vitest';
import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { mapSortToApi } from '../../components/bulk-operations/counterpartySort';

// Test plan (see .claude/skills/test-design/SKILL.md):
//
// - Changed behavior: mapSortToApi (extracted from CounterpartyActivationDataTable.vue) maps the
//   table's own column-keyed sort state to the backend's CounterpartySortParameter shape.
// - Business invariant: the API key sent is always the column's `sortField`, never the column's
//   own display `field` — a table column key and its backend sort field are only coincidentally
//   the same string for some columns (shortName/inn/phone/officialEmail), never guaranteed.
// - Real incident this guards: the "Manager" column (field: 'manager', sortField:
//   'managerErpId') sent `{ manager: 'DESC' }` before this fix — a field
//   CounterpartySortParameter doesn't have, which failed GraphQL variable validation and wiped
//   every column's data for the whole table, not just Manager's (found live during this session).
// - Scope: pure client-side mapping function, no backend/DOM boundary — unit level.
// - Failure modes covered: (a) the exact regression (field/sortField mismatch), (b) empty sort
//   state, (c) a column with no sortField at all (must never be sent), (d) sort direction
//   (ASC/DESC) mapped correctly in both directions.
// - Applicable patterns: none of docs/testing-patterns.md's backend risk patterns apply.
// - Existing coverage reused: none — first test for this table's sort mapping.
// - Deliberate omissions: no component-mount test (no jsdom/happy-dom in this package, see
//   useTabSync.test.ts's own doc comment) and no E2E spec — this session's own manual Playwright
//   driver already confirmed the fix end-to-end live but isn't part of the committed suite.

const COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'shortName',
        header: 'Company name',
        width: 220,
        sortField: 'shortName',
        filterConfig: { type: 'none' },
    },
    {
        field: 'manager',
        header: 'Manager',
        width: 160,
        sortField: 'managerErpId',
        filterConfig: { type: 'none' },
    },
    { field: 'branch', header: 'Branch', width: 140, filterConfig: { type: 'none' } },
];

describe('mapSortToApi', () => {
    it('maps a column with field !== sortField to its real backend sortField (the regression this guards)', () => {
        const result = mapSortToApi([{ field: 'manager', order: -1 }], COLUMNS);
        expect(result).toEqual({ managerErpId: 'DESC' });
        expect(result).not.toHaveProperty('manager');
    });

    it('maps a column whose field happens to equal its sortField correctly too', () => {
        const result = mapSortToApi([{ field: 'shortName', order: 1 }], COLUMNS);
        expect(result).toEqual({ shortName: 'ASC' });
    });

    it('returns an empty object when nothing is sorted', () => {
        expect(mapSortToApi([], COLUMNS)).toEqual({});
    });

    it('returns an empty object for a column with no sortField, rather than sending an invalid key', () => {
        const result = mapSortToApi([{ field: 'branch', order: 1 }], COLUMNS);
        expect(result).toEqual({});
    });

    it('maps order -1 to DESC and order 1 to ASC', () => {
        expect(mapSortToApi([{ field: 'shortName', order: -1 }], COLUMNS)).toEqual({
            shortName: 'DESC',
        });
        expect(mapSortToApi([{ field: 'shortName', order: 1 }], COLUMNS)).toEqual({
            shortName: 'ASC',
        });
    });
});

import { describe, expect, it } from 'vitest';
import {
    filterPortalUsers,
    sortPortalUsers,
    type PortalUserRow,
} from '../../utils/portalUsersList';

const row = (over: Partial<PortalUserRow>): PortalUserRow => ({
    id: '1',
    name: 'Ann Lee',
    email: 'ann@example.com',
    portalRole: 'buyer',
    active: true,
    createdAt: '2026-03-10T12:00:00.000Z',
    ...over,
});

const ROWS = [
    row({ id: '1' }),
    row({ id: '2', name: 'Bob Kim', email: 'bob@example.com', portalRole: 'accountant', active: false }),
    row({ id: '3', name: 'Cy Roe', email: 'cy@example.com', portalRole: null, createdAt: '2026-04-01T12:00:00.000Z' }),
];
const ids = (rows: PortalUserRow[]): string[] => rows.map(r => r.id);

describe('filterPortalUsers', () => {
    it('keeps everything for a blank state', () => {
        expect(ids(filterPortalUsers(ROWS, ' ', []))).toEqual(['1', '2', '3']);
    });

    it('searches name and email case-insensitively', () => {
        expect(ids(filterPortalUsers(ROWS, 'BOB@', []))).toEqual(['2']);
        expect(ids(filterPortalUsers(ROWS, 'lee', []))).toEqual(['1']);
    });

    it('filters by role and status, with eq and notEq', () => {
        expect(
            ids(filterPortalUsers(ROWS, '', [{ columnKey: 'portalRole', operator: 'eq', value: 'buyer' }])),
        ).toEqual(['1']);
        expect(
            ids(filterPortalUsers(ROWS, '', [{ columnKey: 'status', operator: 'notEq', value: 'active' }])),
        ).toEqual(['2']);
    });

    it('filters by creation day range', () => {
        const filtered = filterPortalUsers(ROWS, '', [
            { columnKey: 'createdAt', operator: 'after', value: '2026-03-31' },
        ]);
        expect(ids(filtered)).toEqual(['3']);
    });

    it('combines conditions with the search', () => {
        expect(
            ids(
                filterPortalUsers(ROWS, 'example', [
                    { columnKey: 'status', operator: 'eq', value: 'active' },
                    { columnKey: 'portalRole', operator: 'notEq', value: 'buyer' },
                ]),
            ),
        ).toEqual([]);
    });
});

describe('sortPortalUsers', () => {
    it('sorts by date either way without touching the input', () => {
        expect(ids(sortPortalUsers(ROWS, { field: 'createdAt', dir: 'DESC' }))).toEqual(['3', '1', '2']);
        expect(ids(sortPortalUsers(ROWS, { field: 'createdAt', dir: 'ASC' }))).toEqual(['1', '2', '3']);
        expect(ids(ROWS)).toEqual(['1', '2', '3']);
    });

    it('sorts by name', () => {
        expect(ids(sortPortalUsers(ROWS, { field: 'name', dir: 'DESC' }))).toEqual(['3', '2', '1']);
    });
});

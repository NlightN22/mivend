import { describe, expect, it, vi, afterEach } from 'vitest';
import {
    BLANK_APPROVALS_FILTERS,
    conditionsToOptions,
    fetchApprovalsList,
    restoreApprovalsFilters,
} from '../../api/approvals-list';
import { adminApi } from '../../api/client';

vi.mock('../../api/client', () => ({ adminApi: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('conditionsToOptions', () => {
    it('maps select conditions to list arguments', () => {
        expect(
            conditionsToOptions([
                {
                    columnKey: 'type',
                    operator: 'in',
                    value: ['creditTermApproval', 'discountGrantApproval'],
                },
                { columnKey: 'status', operator: 'eq', value: 'pending' },
                { columnKey: 'requestedBy', operator: 'eq', value: '7' },
            ]),
        ).toEqual({
            requestTypes: ['creditTermApproval', 'discountGrantApproval'],
            statuses: ['pending'],
            requestedByAdministratorId: '7',
        });
    });

    it('turns date conditions into an inclusive-from, exclusive-to window', () => {
        const out = conditionsToOptions([
            { columnKey: 'createdAt', operator: 'between', value: ['2026-11-01', '2026-11-02'] },
        ]);
        const span = Date.parse(out.createdTo!) - Date.parse(out.createdFrom!);
        expect(span).toBe(2 * 24 * 60 * 60 * 1000);
    });

    it('ignores incomplete and unknown conditions', () => {
        expect(
            conditionsToOptions([
                { columnKey: 'status', operator: 'eq', value: '' },
                { columnKey: 'nope', operator: 'eq', value: 'x' },
            ]),
        ).toEqual({});
    });
});

describe('fetchApprovalsList', () => {
    const empty = { items: [], totalItems: 0 };
    function respond(): void {
        vi.mocked(adminApi).mockResolvedValue({
            myApprovalsInbox: {
                awaitingMyDecision: { items: [], totalItems: 3 },
                allInvolved: { items: [], totalItems: 9 },
            },
            mine: { allInvolved: { ...empty, totalItems: 4 } },
        } as never);
    }

    it('loads rows only for the active view and counts the others with take 0', async () => {
        respond();
        const result = await fetchApprovalsList(
            { ...BLANK_APPROVALS_FILTERS, view: 'mine', search: '8' },
            { field: 'status', dir: 'ASC' },
            2,
            10,
            'admin-1',
        );
        const vars = vi.mocked(adminApi).mock.calls[0][1] as Record<
            string,
            Record<string, unknown>
        >;
        expect(vars.awaitingOptions).toEqual({ search: '8', take: 0 });
        expect(vars.allInvolvedOptions).toEqual({ search: '8', take: 0 });
        expect(vars.mineOptions).toMatchObject({
            take: 10,
            skip: 10,
            sortField: 'status',
            sortDir: 'ASC',
            requestedByAdministratorId: 'admin-1',
        });
        expect(result.counts).toEqual({ awaiting: 3, all: 9, mine: 4 });
    });
});

describe('restoreApprovalsFilters', () => {
    it('falls back to blank for junk and drops unknown conditions', () => {
        expect(restoreApprovalsFilters('x')).toEqual(BLANK_APPROVALS_FILTERS);
        const r = restoreApprovalsFilters({
            view: 'bogus',
            conditions: [{ columnKey: 'nope', operator: 'eq', value: '1' }],
        });
        expect(r.view).toBe('awaiting');
        expect(r.conditions).toEqual([]);
    });
});

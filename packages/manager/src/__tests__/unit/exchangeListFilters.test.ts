import { describe, expect, it } from 'vitest';
import {
    toInboxOptions,
    toOutboxOptions,
    toReportOptions,
    type ListRequest,
} from '../../api/exchangeListFilters';

const COLUMNS = [
    { key: 'stream', label: 'Stream', type: 'string' as const },
    { key: 'status', label: 'Status', type: 'select' as const },
];

const request = (over: Partial<ListRequest> = {}): ListRequest => ({
    conditions: [],
    view: 'all',
    search: '',
    sort: { field: 'updatedAt', dir: 'DESC' },
    skip: 20,
    take: 10,
    ...over,
});

describe('exchange list server options', () => {
    it('sends only paging and sort for an untouched list', () => {
        expect(toInboxOptions(request(), COLUMNS)).toEqual({
            skip: 20,
            take: 10,
            filter: {},
            filterOperator: 'AND',
            sort: { updatedAt: 'DESC' },
        });
    });

    it('ANDs the chip and builder conditions and adds the search term on top of them', () => {
        const options = toInboxOptions(
            request({
                view: 'failed',
                search: 'abc',
                conditions: [{ columnKey: 'stream', operator: 'eq', value: 'orders' }],
            }),
            COLUMNS,
        );
        expect(options.filterOperator).toBe('OR');
        expect(options.filter).toEqual({
            _and: [{ stream: { eq: 'orders' } }, { status: { eq: 'failed' } }],
            entityId: { contains: 'abc' },
        });
    });

    it('searches the outbox by event id', () => {
        const options = toOutboxOptions(request({ search: 'x' }), COLUMNS);
        expect(options.filter).toEqual({
            eventId: { contains: 'x' },
        });
    });

    it('maps the reports chip and exact-match conditions to plain arguments', () => {
        expect(
            toReportOptions(
                request({
                    view: 'open',
                    conditions: [
                        { columnKey: 'severity', operator: 'eq', value: 'critical' },
                        { columnKey: 'source', operator: 'eq', value: 'search' },
                        { columnKey: 'type', operator: 'notEq', value: 'ignored' },
                    ],
                }),
            ),
        ).toEqual({ skip: 20, take: 10, status: 'open', severity: 'critical', source: 'search' });
        expect(toReportOptions(request({ view: 'all' })).status).toBeUndefined();
    });
});

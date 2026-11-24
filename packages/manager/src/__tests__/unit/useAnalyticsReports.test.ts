// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import type { AnalyticsReportInfo } from '../../api/analytics';
import { groupOperations, searchable } from '../../components/catalog/catalogGroups';
import { useAnalyticsReports } from '../../composables/useAnalyticsReports';

const fetchAnalyticsReports = vi.hoisted(() => vi.fn());
vi.mock('../../api/analytics', () => ({
    fetchAnalyticsReports,
    localizeReport: (r: unknown) => r,
}));

const report = (i: number, area: string): AnalyticsReportInfo => ({
    key: `r-${i}`,
    title: `Report ${i}`,
    description: `About ${i}`,
    area,
    status: 'planned',
    note: 'note',
});

function mountComposable(): ReturnType<typeof useAnalyticsReports> {
    let result!: ReturnType<typeof useAnalyticsReports>;
    createApp(
        defineComponent({
            setup() {
                result = useAnalyticsReports();
                return () => h('div');
            },
        }),
    ).mount(document.createElement('div'));
    return result;
}

describe('useAnalyticsReports', () => {
    beforeEach(() => fetchAnalyticsReports.mockReset());

    it('loads the reports on mount', async () => {
        fetchAnalyticsReports.mockResolvedValue([report(1, 'sales')]);
        const state = mountComposable();
        expect(state.loading.value).toBe(true);
        await vi.waitFor(() => expect(state.loading.value).toBe(false));
        expect(state.reports.value.map(r => r.key)).toEqual(['r-1']);
        expect(state.failed.value).toBe(false);
    });

    it('flags a failed load and recovers on retry', async () => {
        fetchAnalyticsReports.mockRejectedValueOnce(new Error('down'));
        const state = mountComposable();
        await vi.waitFor(() => expect(state.failed.value).toBe(true));
        fetchAnalyticsReports.mockResolvedValue([report(2, 'sales')]);
        await state.load();
        expect(state.failed.value).toBe(false);
        expect(state.reports.value).toHaveLength(1);
    });
});

describe('analytics catalog grouping', () => {
    it('groups a long report list by area and makes it searchable', () => {
        const list = Array.from({ length: 11 }, (_, i) => report(i, i % 2 ? 'sales' : 'customers'));
        expect(searchable(list)).toBe(true);
        expect(groupOperations(list).map(g => g.area)).toEqual(['customers', 'sales']);
    });
});

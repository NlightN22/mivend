import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatNumber } from '../i18n/format';

export interface PaginationLabels {
    previousLabel: string;
    nextLabel: string;
    summaryLabel: (start: number, end: number, total: number) => string;
    pageLabel: (page: number, pageCount: number) => string;
}

export function usePaginationLabels(): ComputedRef<PaginationLabels> {
    const { t } = useI18n();
    return computed(() => ({
        previousLabel: t('common.previous'),
        nextLabel: t('common.next'),
        summaryLabel: (start, end, total) =>
            t('pagination.summary', {
                start: formatNumber(start),
                end: formatNumber(end),
                total: formatNumber(total),
            }),
        pageLabel: (page, count) => t('pagination.page', { page, count }),
    }));
}

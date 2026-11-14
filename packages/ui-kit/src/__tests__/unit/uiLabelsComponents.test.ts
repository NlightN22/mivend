// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import MvPagination from '../../components/MvPagination/MvPagination.vue';
import { UI_LABELS_KEY } from '../../utils/uiLabels';

const props = { page: 2, pageSize: 10, total: 25 };

describe('MvPagination labels', () => {
    it('keeps the English text without provided labels', () => {
        const text = mount(MvPagination, { props }).text();
        expect(text).toContain('11–20 of 25');
        expect(text).toContain('Page 2 of 3');
        expect(text).toContain('Previous');
    });

    it('uses provided labels and fills placeholders', () => {
        const labels = ref({
            paginationSummary: '{start}–{end} из {total}',
            paginationPage: 'Страница {page} из {pageCount}',
            previous: 'Назад',
            next: 'Далее',
        });
        const text = mount(MvPagination, {
            props,
            global: { provide: { [UI_LABELS_KEY as symbol]: labels } },
        }).text();
        expect(text).toContain('11–20 из 25');
        expect(text).toContain('Страница 2 из 3');
        expect(text).toContain('Далее');
    });
});

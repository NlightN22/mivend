// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MvDocumentLines from '../../components/MvDocumentLines/MvDocumentLines.vue';
import { columnCount, type DocColumn } from '../../components/MvDocumentLines/documentLinesModel';

const columns: DocColumn[] = [
    { key: 'name', label: 'Item' },
    { key: 'qty', label: 'Qty' },
];
const rows = [{ id: '1', testId: 'row-1' }];
const slots = { 'cell-name': 'Item', 'cell-qty': '1' };

describe('MvDocumentLines view-only mode', () => {
    it('counts no actions cell when the document has no actions', () => {
        expect(columnCount(columns, false, false)).toBe(2);
        expect(columnCount(columns, true, false)).toBe(3);
    });

    it('renders no selection or actions column without selection, canEdit and canRemove', () => {
        const wrapper = mount(MvDocumentLines, { props: { title: 'Lines', columns, rows }, slots });
        expect(wrapper.findAll('thead th')).toHaveLength(2);
        expect(wrapper.findAll('tbody tr[data-testid="row-1"] td')).toHaveLength(2);
        expect(wrapper.find('.doc-row__actions').exists()).toBe(false);
        expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    });

    it('keeps the actions column when rows can be edited', () => {
        const wrapper = mount(MvDocumentLines, {
            props: { title: 'Lines', columns, rows, canEdit: () => true },
            slots,
        });
        expect(wrapper.findAll('thead th')).toHaveLength(3);
        expect(wrapper.find('.doc-row__actions').exists()).toBe(true);
    });
});

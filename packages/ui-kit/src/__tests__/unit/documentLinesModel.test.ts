import { describe, expect, it } from 'vitest';
import {
    columnCount,
    rowStripe,
    visibleColumns,
    worstTone,
    type DocColumn,
    type DocFlag,
} from '../../components/MvDocumentLines/documentLinesModel';

const flag = (tone: DocFlag['tone']): DocFlag => ({ tone, notes: [{ text: 'x' }] });

describe('document lines model', () => {
    it('ranks danger over orange over warning', () => {
        expect(worstTone(['warning', 'danger', 'orange'])).toBe('danger');
        expect(worstTone(['warning', 'orange'])).toBe('orange');
        expect(worstTone([])).toBeNull();
    });

    it('stripes a row by its worst flag and is ok without flags', () => {
        expect(rowStripe({ price: flag('warning'), qty: flag('orange'), skipped: undefined })).toBe(
            'orange',
        );
        expect(rowStripe({})).toBe('ok');
        expect(rowStripe(undefined)).toBe('ok');
    });

    it('drops hidden columns and counts selection and actions cells', () => {
        const columns: DocColumn[] = [
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B', hidden: true },
        ];
        expect(visibleColumns(columns).map(c => c.key)).toEqual(['a']);
        expect(columnCount(columns, false)).toBe(2);
        expect(columnCount(columns, true)).toBe(3);
    });
});

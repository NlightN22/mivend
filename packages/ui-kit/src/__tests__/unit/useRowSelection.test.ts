import { describe, expect, it, vi } from 'vitest';
import { useRowSelection } from '../../components/MvAdvancedDataTable/useRowSelection';

const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];

function setup(selected: string[], blocked: number[] = []) {
    const onChange = vi.fn();
    const selection = useRowSelection<{ id: number }>({
        rows: () => rows,
        dataKey: () => 'id',
        selectedIds: () => new Set(selected),
        rowSelectable: () => row => !blocked.includes(row.id),
        onChange,
    });
    return { selection, onChange };
}

describe('useRowSelection', () => {
    it('reports an indeterminate header when only some selectable rows are selected', () => {
        const { selection } = setup(['1']);
        expect(selection.headerCheckboxState.value).toEqual({
            checked: false,
            indeterminate: true,
        });
    });

    it('ignores rows that are not selectable for the header state and select-all', () => {
        const { selection, onChange } = setup(['1', '2'], [3]);
        expect(selection.headerCheckboxState.value.checked).toBe(true);
        selection.toggleSelectAllOnPage();
        expect([...onChange.mock.calls[0][0]]).toEqual([]);
    });

    it('does not toggle a row that is not selectable', () => {
        const { selection, onChange } = setup([], [2]);
        selection.toggleRowSelected({ id: 2 });
        expect(onChange).not.toHaveBeenCalled();
        selection.toggleRowSelected({ id: 1 });
        expect([...onChange.mock.calls[0][0]]).toEqual(['1']);
    });
});

import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { useRowSelection } from '../../composables/useRowSelection';

describe('useRowSelection', () => {
    it('toggles single rows and selects all', () => {
        const s = useRowSelection(ref(['a', 'b', 'c']));
        s.toggle('a');
        expect(s.count.value).toBe(1);
        expect(s.allSelected.value).toBe(false);
        s.setAll(true);
        expect(s.allSelected.value).toBe(true);
        s.toggle('a');
        expect([...s.selected.value]).toEqual(['b', 'c']);
        s.setAll(false);
        expect(s.count.value).toBe(0);
    });

    it('drops selected rows that disappeared from the list and clears the mode', async () => {
        const ids = ref(['a', 'b']);
        const s = useRowSelection(ids);
        s.active.value = true;
        s.setAll(true);
        ids.value = ['b'];
        await nextTick();
        expect([...s.selected.value]).toEqual(['b']);
        s.clear();
        expect(s.active.value).toBe(false);
        expect(s.count.value).toBe(0);
    });
});

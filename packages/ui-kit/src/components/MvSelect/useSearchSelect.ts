import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
    type ComputedRef,
    type Ref,
} from 'vue';
import { filterOptionsByQuery } from '../MvColumnFilter/filterOptionsByQuery';
import type { SelectOption } from './MvSelect.vue';

export interface UseSearchSelect {
    open: Ref<boolean>;
    query: Ref<string>;
    active: Ref<number>;
    visible: ComputedRef<SelectOption[]>;
    selectedLabel: ComputedRef<string>;
    pick: (value: string) => void;
    onSearchKey: (e: KeyboardEvent) => void;
}

// Open state, search query, highlighted row and outside-click/Escape handling of MvSearchSelect.
export function useSearchSelect(options: {
    options: () => SelectOption[];
    selected: () => string;
    pick: (value: string) => void;
    root: Ref<HTMLElement | null>;
    panel: Ref<HTMLElement | null>;
    search: Ref<HTMLInputElement | null>;
}): UseSearchSelect {
    const open = ref(false);
    const query = ref('');
    const active = ref(0);
    const visible = computed(() => filterOptionsByQuery(options.options(), query.value));
    const selectedLabel = computed(
        () => options.options().find(o => o.value === options.selected())?.label ?? '',
    );

    watch(query, () => {
        active.value = 0;
    });
    watch(open, async isOpen => {
        if (!isOpen) {
            query.value = '';
            return;
        }
        active.value = Math.max(
            0,
            visible.value.findIndex(o => o.value === options.selected()),
        );
        await nextTick();
        options.search.value?.focus();
    });

    function pick(value: string): void {
        options.pick(value);
        open.value = false;
    }
    function onSearchKey(e: KeyboardEvent): void {
        const last = visible.value.length - 1;
        if (e.key === 'ArrowDown') active.value = Math.min(active.value + 1, last);
        else if (e.key === 'ArrowUp') active.value = Math.max(active.value - 1, 0);
        else if (e.key === 'Enter') {
            const option = visible.value[active.value];
            if (option) pick(option.value);
        } else return;
        e.preventDefault();
    }
    function onDocClick(e: MouseEvent): void {
        const path = e.composedPath();
        const inside = [options.root.value, options.panel.value].some(el =>
            path.includes(el as EventTarget),
        );
        if (!inside) open.value = false;
    }
    function onKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && open.value) {
            open.value = false;
            e.stopImmediatePropagation();
        }
    }
    onMounted(() => {
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onKeydown, true);
    });
    onBeforeUnmount(() => {
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKeydown, true);
    });

    return { open, query, active, visible, selectedLabel, pick, onSearchKey };
}

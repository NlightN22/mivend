import { ref, watch, type Ref } from 'vue';

// The notice stays until the user edits conditions or switches the view chip.
export function useDroppedFilterNotice(view: () => unknown): {
    dropped: Ref<boolean>;
    markDropped: () => void;
    reset: () => void;
} {
    const dropped = ref(false);
    watch(view, () => {
        dropped.value = false;
    });
    return {
        dropped,
        markDropped: () => {
            dropped.value = true;
        },
        reset: () => {
            dropped.value = false;
        },
    };
}

import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

const GAP = 6;
const EDGE = 8;
const FLIP_BELOW_MIN = 240;

export interface AnchoredPanel {
    style: Ref<Record<string, string>>;
    place: () => void;
}

// Fixed-position placement under an anchor: clamped to the viewport, flipped above when the room
// below is short, and left to the owner's bottom-sheet CSS on phones (`sheet`).
export function useAnchoredPanel(options: {
    open: Ref<boolean>;
    anchor: () => HTMLElement | null;
    width: number;
    sheet: Ref<boolean>;
}): AnchoredPanel {
    const style = ref<Record<string, string>>({});

    function place(): void {
        const anchor = options.anchor();
        if (!anchor || options.sheet.value) {
            style.value = {};
            return;
        }
        const r = anchor.getBoundingClientRect();
        const width = Math.min(options.width, window.innerWidth - EDGE * 2);
        const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE));
        const below = window.innerHeight - r.bottom - GAP - EDGE;
        const above = r.top - GAP - EDGE;
        const flip = below < FLIP_BELOW_MIN && above > below;
        style.value = flip
            ? {
                  left: `${left}px`,
                  bottom: `${window.innerHeight - r.top + GAP}px`,
                  width: `${width}px`,
                  maxHeight: `${above}px`,
              }
            : {
                  left: `${left}px`,
                  top: `${r.bottom + GAP}px`,
                  width: `${width}px`,
                  maxHeight: `${below}px`,
              };
    }

    watch(options.open, async value => {
        if (!value) return;
        place();
        await nextTick();
        place();
    });
    onMounted(() => {
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
    });
    onBeforeUnmount(() => {
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
    });

    return { style, place };
}

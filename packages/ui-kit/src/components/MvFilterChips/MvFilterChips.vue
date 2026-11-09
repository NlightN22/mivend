<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MvSkeleton from '../MvSkeleton/MvSkeleton.vue';
import { formatCompactCount, formatExactCount } from '../../utils/compactCount';
import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

// Quick-filter chip row; a `variant` chip mirrors its table badge colour, see docs/ui-standards.md.
export interface FilterChip {
    key: string;
    label: string;
    variant?: StatusBadgeVariant;
    // Server COUNT for the chip; shown as a pill after the label.
    count?: number;
    // Shows a placeholder of the pill's width instead of the count while it is being fetched.
    countLoading?: boolean;
    // Inverts the count pill while count > 0, for the chip people look at first.
    emphasis?: boolean;
}

// Chips wrap to at most two rows; "More" expands to all rows when they overflow.
const props = withDefaults(defineProps<{ chips: FilterChip[]; active: string; scrollable?: boolean }>(), {
    scrollable: false,
});
const TWO_ROWS_PX = 68;
const row = ref<HTMLElement | null>(null);
const expanded = ref(false);
const overflows = ref(false);

function measure(): void {
    if (row.value) overflows.value = row.value.scrollHeight > TWO_ROWS_PX + 1;
}
let observer: ResizeObserver | undefined;
onMounted(() => {
    measure();
    if (typeof ResizeObserver !== 'undefined' && row.value) {
        observer = new ResizeObserver(measure);
        observer.observe(row.value);
    }
});
onBeforeUnmount(() => observer?.disconnect());
watch(
    () => props.chips.length,
    async () => {
        await nextTick();
        measure();
    },
);
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <div class="mv-filter-chips-wrap">
        <div
            ref="row"
            class="mv-filter-chips"
            :class="{
                'mv-filter-chips--scrollable': scrollable,
                'mv-filter-chips--clamped': !expanded,
            }"
        >
            <button
                v-for="chip in chips"
                :key="chip.key"
                type="button"
                class="mv-filter-chip"
                :data-active="chip.key === active"
                :aria-pressed="chip.key === active"
                :class="[
                    chip.variant ? `mv-filter-chip--${chip.variant}` : '',
                    chip.key === active
                        ? chip.variant
                            ? 'mv-filter-chip--selected'
                            : 'mv-filter-chip--active'
                        : '',
                ]"
                @click="emit('select', chip.key)"
            >
                <span class="mv-filter-chip__label" :title="chip.label">{{ chip.label }}</span>
                <span
                    v-if="chip.countLoading"
                    class="mv-filter-chip__count-skeleton"
                    role="status"
                    aria-label="Loading"
                    data-testid="chip-count-skeleton"
                    ><MvSkeleton width="28px" height="17px" radius="999px" aria-hidden="true"
                /></span>
                <span
                    v-else-if="chip.count !== undefined"
                    class="mv-filter-chip__count"
                    :class="{ 'mv-filter-chip__count--emphasis': chip.emphasis && chip.count > 0 }"
                    :title="formatExactCount(chip.count)"
                    >{{ formatCompactCount(chip.count) }}</span
                >
            </button>
        </div>
        <button
            v-if="overflows"
            type="button"
            class="mv-filter-chips__toggle"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
        >
            {{ expanded ? 'Collapse' : 'More' }}
        </button>
    </div>
</template>

<style scoped src="./MvFilterChips.css"></style>

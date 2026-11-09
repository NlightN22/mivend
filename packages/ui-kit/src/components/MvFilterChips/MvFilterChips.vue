<script setup lang="ts">
import { computed } from 'vue';
import MvSkeleton from '../MvSkeleton/MvSkeleton.vue';
import { formatCompactCount, formatExactCount } from '../../utils/compactCount';
import { shouldCollapseChips } from './chipOverflow';
import { useChipScroll } from './useChipScroll';
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

// More than `maxInline` chips collapse into one horizontally scrolling row with a fade edge.
const props = withDefaults(
    defineProps<{
        chips: FilterChip[];
        active: string;
        scrollable?: boolean;
        maxInline?: number;
    }>(),
    { scrollable: false, maxInline: 6 },
);
const collapsed = computed(() => shouldCollapseChips(props.chips.length, props.maxInline));

const { row, canPrev, canNext, measure, step } = useChipScroll(
    () => props.active,
    () => props.chips.length,
);
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <div class="mv-filter-chips-wrap">
        <button
            v-if="collapsed"
            :disabled="!canPrev"
            type="button"
            class="mv-filter-chips__arrow"
            aria-label="Scroll chips left"
            @click="step(-1)"
        >
            ‹
        </button>
        <div
            ref="row"
            class="mv-filter-chips"
            :class="{
                'mv-filter-chips--scrollable': scrollable,
                'mv-filter-chips--collapsed': collapsed,
                'mv-filter-chips--fade-start': collapsed && canPrev,
                'mv-filter-chips--fade-end': collapsed && canNext,
            }"
            @scroll.passive="measure"
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
            v-if="collapsed"
            :disabled="!canNext"
            type="button"
            class="mv-filter-chips__arrow"
            aria-label="Scroll chips right"
            @click="step(1)"
        >
            ›
        </button>
    </div>
</template>

<style scoped src="./MvFilterChips.css"></style>

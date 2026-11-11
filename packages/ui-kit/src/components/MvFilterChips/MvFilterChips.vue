<script setup lang="ts">
import { ref } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import { useChipsOverflow } from './useChipsOverflow';
import MvSkeleton from '../MvSkeleton/MvSkeleton.vue';
import { formatCompactCount, formatExactCount } from '../../utils/compactCount';
import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

// Quick-filter chips: two rows at most, the rest behind More; see docs/ui-standards.md.
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

const props = defineProps<{ chips: FilterChip[]; active: string }>();
const row = ref<HTMLElement | null>(null);
const toggle = ref<{ $el: HTMLElement } | null>(null);
const expanded = ref(false);
const { visible, overflows, hiddenCount } = useChipsOverflow(
    row,
    toggle,
    () => [props.chips.map(c => `${c.key}|${c.label}|${c.count}|${c.countLoading}`), props.active],
    () => props.chips.findIndex(c => c.key === props.active),
);
function isHidden(index: number): boolean {
    return !expanded.value && visible.value !== null && visible.value[index] === false;
}
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <div ref="row" class="mv-filter-chips">
        <button
            v-for="(chip, index) in chips"
            :key="chip.key"
            type="button"
            class="mv-filter-chip"
            :class="[
                chip.variant ? `mv-filter-chip--${chip.variant}` : '',
                chip.key === active
                    ? chip.variant
                        ? 'mv-filter-chip--selected'
                        : 'mv-filter-chip--active'
                    : '',
                { 'mv-filter-chip--overflow': isHidden(index) },
            ]"
            :data-active="chip.key === active"
            :aria-pressed="chip.key === active"
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
        <MvButton
            v-if="overflows"
            ref="toggle"
            class="mv-filter-chips__toggle"
            variant="subtle"
            size="sm"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
        >
            {{ expanded ? 'Collapse' : `More ${hiddenCount}` }}
        </MvButton>
    </div>
</template>

<style scoped src="./MvFilterChips.css"></style>

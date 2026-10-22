<script setup lang="ts">
import { computed } from 'vue';
import { IconCircleCheckFilled } from '@tabler/icons-vue';

export interface TierLadder {
    currentLabel: string;
    targetLabel: string;
    value: number;
    max: number;
    complete?: boolean;
}

const props = defineProps<{ ladder: TierLadder }>();

const fraction = computed(() =>
    props.ladder.max <= 0 ? 0 : Math.min(1, Math.max(0, props.ladder.value / props.ladder.max)),
);
</script>

<template>
    <div v-if="ladder.complete" class="mv-tier-ladder mv-tier-ladder--complete">
        <IconCircleCheckFilled :size="22" />
        <span class="mv-tier-ladder__achieved">{{ ladder.currentLabel }}</span>
    </div>
    <div v-else class="mv-tier-ladder" :style="{ '--tier-progress': fraction }">
        <div class="mv-tier-ladder__labels">
            <span class="mv-tier-ladder__current">{{ ladder.currentLabel }}</span>
            <span class="mv-tier-ladder__target">{{ ladder.targetLabel }}</span>
        </div>
        <div class="mv-tier-ladder__track">
            <div class="mv-tier-ladder__fill" :style="{ width: `${fraction * 100}%` }" />
            <span class="mv-tier-ladder__pin" :style="{ left: `${fraction * 100}%` }" />
        </div>
    </div>
</template>

<style scoped>
.mv-tier-ladder {
    --tier-orange: var(--app-accent-orange, #ff8a00);
    --tier-green: #00a878;
    --tier-color: color-mix(
        in srgb,
        var(--tier-green) calc(var(--tier-progress, 0) * 100%),
        var(--tier-orange)
    );
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.mv-tier-ladder__labels {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    line-height: 1.2;
}

.mv-tier-ladder__current {
    font-weight: 700;
    color: #5b6b65;
}

.mv-tier-ladder__target {
    font-weight: 600;
    color: color-mix(in srgb, var(--tier-color) 70%, #000);
}

.mv-tier-ladder__track {
    position: relative;
    height: 6px;
    border-radius: 4px;
    background: #e3efe9;
}

.mv-tier-ladder__fill {
    height: 100%;
    border-radius: 4px;
    background: var(--tier-color);
    transition:
        width 0.25s ease,
        background-color 0.25s ease;
}

.mv-tier-ladder__pin {
    position: absolute;
    top: -3px;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    box-sizing: border-box;
    border: 2px solid #fff;
    border-radius: 50%;
    background: color-mix(in srgb, var(--tier-color) 70%, #000);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: left 0.25s ease;
}

.mv-tier-ladder--complete {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #00875f;
}

.mv-tier-ladder__achieved {
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
}
</style>

<script setup lang="ts">
import { computed } from 'vue';

export interface TierLadder {
    currentLabel: string;
    targetLabel: string;
    value: number;
    max: number;
    complete?: boolean;
}

const props = defineProps<{ ladder: TierLadder }>();

const percent = computed(() =>
    props.ladder.max <= 0
        ? 0
        : Math.min(100, Math.max(0, (props.ladder.value / props.ladder.max) * 100)),
);
</script>

<template>
    <div class="mv-tier-ladder" :class="{ 'mv-tier-ladder--complete': ladder.complete }">
        <div class="mv-tier-ladder__labels">
            <span class="mv-tier-ladder__current">{{ ladder.currentLabel }}</span>
            <span class="mv-tier-ladder__target">{{ ladder.targetLabel }}</span>
        </div>
        <div class="mv-tier-ladder__track">
            <div class="mv-tier-ladder__fill" :style="{ width: `${percent}%` }" />
            <span class="mv-tier-ladder__pin" :style="{ left: `${percent}%` }" />
        </div>
    </div>
</template>

<style scoped>
.mv-tier-ladder {
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
    color: #b45309;
}

.mv-tier-ladder--complete .mv-tier-ladder__target {
    color: #00875f;
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
    background: #d97706;
    transition: width 0.25s ease;
}

.mv-tier-ladder--complete .mv-tier-ladder__fill {
    background: #00a878;
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
    background: #92400e;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: left 0.25s ease;
}

.mv-tier-ladder--complete .mv-tier-ladder__pin {
    background: #007a55;
}
</style>

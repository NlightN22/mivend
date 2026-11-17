<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Component } from 'vue';
import {
    IconArrowBackUp,
    IconEdit,
    IconInfoCircle,
    IconPoint,
    IconTruckDelivery,
} from '@tabler/icons-vue';
import MvPopover from '../MvPopover/MvPopover.vue';
import { formatSigned } from './lineChange';
import type { LineChangeViewEvent } from './lineChange';

// Change chip plus the compact `i` button of an order-composition row; the portal supplies all texts.
const props = defineProps<{
    events: LineChangeViewEvent[];
    ordered: number;
    actual: number;
    heading: string;
    productName: string;
    sku: string;
    footer: string;
    infoLabel: string;
}>();

const open = ref(false);
const delta = computed(() => props.actual - props.ordered);
const KIND_ICONS: Record<string, Component> = {
    realization: IconTruckDelivery,
    'realization-correction': IconEdit,
    return: IconArrowBackUp,
};
const iconOf = (kind: string): Component => KIND_ICONS[kind] ?? IconPoint;
</script>

<template>
    <span class="mv-line-change">
        <span
            class="mv-line-change__chip"
            :class="{ 'mv-line-change__chip--up': delta > 0 }"
            data-test="line-change-chip"
            >{{ formatSigned(delta) }}</span
        >
        <MvPopover v-model:open="open" :width="340" placement="bottom-end">
            <template #trigger>
                <button type="button" class="mv-line-change__info" :aria-label="infoLabel">
                    <IconInfoCircle :size="16" aria-hidden="true" />
                </button>
            </template>
            <div class="mv-line-change__panel">
                <div class="mv-line-change__heading">{{ heading }}</div>
                <div class="mv-line-change__product">{{ productName }}</div>
                <div class="mv-line-change__sku">{{ sku }}</div>
                <ul class="mv-line-change__events">
                    <li v-for="(event, index) in events" :key="index" class="mv-line-change__event">
                        <span class="mv-line-change__icon">
                            <component :is="iconOf(event.kind)" :size="16" aria-hidden="true" />
                        </span>
                        <span class="mv-line-change__text">
                            <span class="mv-line-change__title">{{ event.title }}</span>
                            <span class="mv-line-change__subtitle">{{ event.subtitle }}</span>
                            <span v-if="event.reference" class="mv-line-change__subtitle">{{
                                event.reference
                            }}</span>
                        </span>
                        <span class="mv-line-change__numbers">
                            <span
                                class="mv-line-change__qty"
                                :class="{ 'mv-line-change__qty--up': event.quantity > 0 }"
                                >{{ formatSigned(event.quantity) }}</span
                            >
                            <span class="mv-line-change__remainder">{{ event.remainder }}</span>
                        </span>
                    </li>
                </ul>
                <div class="mv-line-change__footer">{{ footer }}</div>
            </div>
        </MvPopover>
    </span>
</template>

<style scoped>
.mv-line-change {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
}
.mv-line-change__chip {
    padding: 0 6px;
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
    font-size: 12px;
    font-weight: 700;
    line-height: 20px;
}
.mv-line-change__chip--up {
    background: var(--app-ok-bg);
    color: var(--app-ok-fg);
}
.mv-line-change__info {
    display: inline-flex;
    padding: 2px;
    border: 0;
    border-radius: var(--app-radius-sm, 8px);
    background: transparent;
    color: var(--app-text-grey);
    cursor: pointer;
}
.mv-line-change__info:hover {
    color: var(--app-text-deep);
}
.mv-line-change__info:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
}
.mv-line-change__panel {
    display: grid;
    gap: 4px;
    color: var(--app-text-body2);
    font-size: 13px;
    white-space: normal;
}
.mv-line-change__heading {
    color: var(--app-text-deep);
    font-size: 15px;
    font-weight: 700;
}
.mv-line-change__product {
    font-weight: 600;
}
.mv-line-change__sku {
    color: var(--app-text-grey);
    font-size: 12px;
}
.mv-line-change__events {
    display: grid;
    gap: 10px;
    margin: 8px 0 4px;
    padding: 10px 0;
    border-top: 1px solid var(--app-nav-border);
    border-bottom: 1px solid var(--app-nav-border);
    list-style: none;
}
.mv-line-change__event {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: start;
}
.mv-line-change__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-slate-bg);
    color: var(--app-slate-fg);
}
.mv-line-change__text {
    display: grid;
    min-width: 0;
}
.mv-line-change__title {
    color: var(--app-text-deep);
    font-weight: 600;
}
.mv-line-change__subtitle {
    color: var(--app-text-grey);
    font-size: 12px;
}
.mv-line-change__numbers {
    display: grid;
    justify-items: end;
}
.mv-line-change__qty {
    color: var(--app-danger-fg);
    font-weight: 700;
}
.mv-line-change__qty--up {
    color: var(--app-ok-fg);
}
.mv-line-change__remainder {
    color: var(--app-text-grey);
    font-size: 12px;
}
.mv-line-change__footer {
    color: var(--app-text-deep);
    font-weight: 700;
}
</style>

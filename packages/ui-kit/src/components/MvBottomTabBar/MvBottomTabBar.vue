<script setup lang="ts">
import type { Component } from 'vue';
import { RouterLink } from 'vue-router';

export interface BottomTabItem {
    key: string;
    label: string;
    icon: Component;
    to?: string;
    active: boolean;
    badgeCount?: number;
}

defineProps<{ items: BottomTabItem[]; ariaLabel?: string }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <Teleport to="body">
        <nav class="mv-bottom-tab-bar" :aria-label="ariaLabel">
            <component
                :is="item.to ? RouterLink : 'button'"
                v-for="item in items"
                :key="item.key"
                v-bind="item.to ? { to: item.to } : { type: 'button' }"
                class="mv-bottom-tab-bar__item"
                :class="{ 'mv-bottom-tab-bar__item--active': item.active }"
                :aria-current="item.active ? 'page' : undefined"
                :data-tab="item.key"
                @click="emit('select', item.key)"
            >
                <span class="mv-bottom-tab-bar__icon">
                    <component :is="item.icon" :size="24" aria-hidden="true" />
                    <span v-if="item.badgeCount" class="mv-bottom-tab-bar__badge">{{
                        item.badgeCount
                    }}</span>
                </span>
                <span class="mv-bottom-tab-bar__label">{{ item.label }}</span>
            </component>
        </nav>
    </Teleport>
</template>

<style scoped>
.mv-bottom-tab-bar {
    display: none;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--mv-z-floating);
    height: var(--mv-bottom-bar-height);
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 2px;
    padding: 6px 6px env(safe-area-inset-bottom, 0px);
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(14px) saturate(1.4);
    border-top: 1px solid var(--app-nav-border);
    box-shadow: 0 -8px 24px rgba(16, 24, 40, 0.08);
}

@media (max-width: 1180px) {
    .mv-bottom-tab-bar {
        display: grid;
    }
}

.mv-bottom-tab-bar__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 0;
    border: 0;
    border-radius: var(--app-radius-md);
    background: transparent;
    color: var(--app-nav-label);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
    transition:
        background 0.14s,
        color 0.14s;
}

.mv-bottom-tab-bar__item:hover {
    background: var(--app-nav-hover-bg);
    color: var(--app-nav-accent);
}

.mv-bottom-tab-bar__item:active {
    background: var(--app-nav-active-bg);
}

.mv-bottom-tab-bar__item:focus-visible {
    outline: 2px solid var(--app-nav-accent);
    outline-offset: -2px;
}

.mv-bottom-tab-bar__item--active {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}

.mv-bottom-tab-bar__icon {
    position: relative;
    display: flex;
}

.mv-bottom-tab-bar__badge {
    position: absolute;
    top: -5px;
    right: -9px;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    border-radius: 999px;
    background: var(--app-badge-bg);
    color: var(--app-badge-text);
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
    display: grid;
    place-items: center;
}

.mv-bottom-tab-bar__label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
}

@media (max-width: 400px) {
    .mv-bottom-tab-bar {
        gap: 0;
        padding-inline: 2px;
    }

    .mv-bottom-tab-bar__label {
        font-size: 10px;
        letter-spacing: -0.02em;
    }
}
</style>

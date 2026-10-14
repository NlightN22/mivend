<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{ icon: Component; label: string; value: string }>();
</script>

<template>
    <div class="mv-icon-stat">
        <span class="mv-icon-stat__icon"><component :is="icon" :size="20" /></span>
        <span class="mv-icon-stat__body">
            <span class="mv-icon-stat__label">{{ label }}</span>
            <span class="mv-icon-stat__value">{{ value }}</span>
        </span>
    </div>
</template>

<style scoped>
.mv-icon-stat {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
}
.mv-icon-stat__icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: #e2f8ef;
    color: #008a64;
}
.mv-icon-stat__body {
    display: grid;
    gap: 4px;
    min-width: 0;
}
.mv-icon-stat__label {
    color: #66736e;
    font-size: 12px;
}
.mv-icon-stat__value {
    font-size: 14px;
    font-weight: 950;
    color: #1b2d26;
    overflow-wrap: anywhere;
}
</style>

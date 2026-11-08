<script setup lang="ts">
import MvStatusBadge from '../MvStatusBadge/MvStatusBadge.vue';
import type { DocFlagNote } from './documentLinesModel';

defineProps<{ notes: DocFlagNote[] }>();
</script>

<template>
    <ul class="flag-notes">
        <li v-for="(note, i) in notes" :key="i" class="flag-notes__item">
            <span class="flag-notes__text">{{ note.text }}</span>
            <span v-if="note.detail" class="flag-notes__meta">{{ note.detail }}</span>
            <span v-if="note.badge" class="flag-notes__consequence">
                <span class="flag-notes__meta">Consequence:</span>
                <MvStatusBadge :variant="note.badge.variant">{{ note.badge.label }}</MvStatusBadge>
            </span>
        </li>
    </ul>
</template>

<style scoped>
.flag-notes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.flag-notes__item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
}

.flag-notes__text {
    font-weight: 700;
}

.flag-notes__meta {
    color: var(--app-text-grey);
    font-size: 12px;
}

.flag-notes__consequence {
    display: flex;
    align-items: center;
    gap: 6px;
}
</style>

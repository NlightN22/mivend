<script setup lang="ts">
import { computed } from 'vue';

// The manager portal's standard rendering for a "base date" table cell (manager-table-standard
// skill's "identifying number first, creation date second" column) — the date on its own line,
// the exact time in smaller/muted text below it. Sorting/filtering still only ever operate on
// the date value itself (the table's own `sortField`/`filterConfig`, unaffected by this); the
// time is purely informational, for a user who needs to tell apart same-day rows precisely.
const props = defineProps<{ value: string }>();

const date = computed(() => new Date(props.value));
const dateLabel = computed(() => date.value.toLocaleDateString('en-US'));
const timeLabel = computed(() =>
    date.value.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
);
</script>

<template>
    <div class="mv-date-time-cell">
        <div class="mv-date-time-cell__date">{{ dateLabel }}</div>
        <div class="mv-date-time-cell__time">{{ timeLabel }}</div>
    </div>
</template>

<style scoped>
.mv-date-time-cell {
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.mv-date-time-cell__date {
    font-size: 13px;
}

.mv-date-time-cell__time {
    font-size: 11px;
    color: var(--el-text-color-secondary, #98a2b3);
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import MvSkeleton from '../MvSkeleton/MvSkeleton.vue';

const props = defineProps<{ rows: number; fields: number; badge: boolean }>();
const cards = computed(() => Array.from({ length: props.rows }, (_, i) => i));
const fieldSlots = computed(() => Array.from({ length: props.fields }, (_, i) => i));
</script>

<template>
    <article
        v-for="n in cards"
        :key="n"
        class="mv-table-skeleton-card"
        aria-hidden="true"
        data-testid="table-skeleton-card"
    >
        <div class="mv-table-skeleton-card__head">
            <MvSkeleton width="90px" height="16px" />
            <MvSkeleton v-if="badge" width="72px" height="20px" radius="999px" />
        </div>
        <div class="mv-table-skeleton-card__grid">
            <div v-for="f in fieldSlots" :key="f" class="mv-table-skeleton-card__field">
                <MvSkeleton width="50%" height="10px" />
                <MvSkeleton width="80%" height="14px" />
            </div>
        </div>
    </article>
</template>

<style scoped>
.mv-table-skeleton-card {
    border: 1px solid var(--el-border-color);
    background: var(--app-surface);
    border-radius: 12px;
    padding: 13px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 11px;
}

.mv-table-skeleton-card__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.mv-table-skeleton-card__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
}

.mv-table-skeleton-card__field {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { MvCard, MvNotice } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { availableBulkOperations } from './operations';

const authStore = useAuthStore();
const operations = computed(() => availableBulkOperations(authStore.hasPermission));
</script>

<template>
    <div class="bulk-operations-page">
        <h1 class="bulk-operations-page__title">Bulk operations</h1>
        <p class="bulk-operations-page__subtitle">
            Pick an operation to run on many records at once.
        </p>

        <MvNotice v-if="!operations.length" variant="info">
            No bulk operations are available for your role.
        </MvNotice>

        <div class="bulk-operations-page__list">
            <RouterLink
                v-for="operation in operations"
                :key="operation.key"
                :to="operation.path"
                class="bulk-operations-page__link"
            >
                <MvCard class="bulk-operations-page__card">
                    <h2 class="bulk-operations-page__card-title">{{ operation.title }}</h2>
                    <p class="bulk-operations-page__card-text">{{ operation.description }}</p>
                </MvCard>
            </RouterLink>
        </div>
    </div>
</template>

<style scoped>
.bulk-operations-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.bulk-operations-page__subtitle {
    margin: 8px 0 18px;
    color: var(--el-text-color-secondary, #6b7280);
}

.bulk-operations-page__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: 18px;
}

.bulk-operations-page__link {
    display: block;
    color: inherit;
    text-decoration: none;
}

.bulk-operations-page__card {
    height: 100%;
    box-sizing: border-box;
}

.bulk-operations-page__link:hover .bulk-operations-page__card-title {
    text-decoration: underline;
}

.bulk-operations-page__card-title {
    margin: 0 0 8px;
    font-size: 18px;
}

.bulk-operations-page__card-text {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 14px;
}
</style>

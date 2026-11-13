<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvStatusBadge } from '@mivend/ui-kit';
import { fetchOrderCheckHealth, type OrderCheckHealthRow } from '../../api/integration-health';

const { t } = useI18n();
const rows = ref<OrderCheckHealthRow[]>([]);
const loaded = ref(false);
const error = ref('');

onMounted(async () => {
    try {
        rows.value = await fetchOrderCheckHealth();
    } catch (e) {
        error.value =
            e instanceof Error ? e.message : t('settingsPanels.orderCheckHealth.loadFailed');
    } finally {
        loaded.value = true;
    }
});
</script>

<template>
    <div class="check-health">
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <p v-else-if="loaded && !rows.length" class="check-health__empty">
            {{ t('settingsPanels.orderCheckHealth.empty') }}
        </p>
        <ul v-else class="check-health__list">
            <li v-for="r in rows" :key="`${r.checkCode}:${r.reason}`" class="check-health__row">
                <span>
                    <strong>{{ r.checkCode }}</strong>
                    <span v-if="r.reason" class="check-health__reason"> · {{ r.reason }}</span>
                </span>
                <span class="check-health__counts">
                    <MvStatusBadge variant="warning">{{
                        t(
                            'settingsPanels.orderCheckHealth.orders',
                            { count: r.orderCount },
                            r.orderCount,
                        )
                    }}</MvStatusBadge>
                    <MvStatusBadge v-if="r.staleOrderCount" variant="neutral">{{
                        t('settingsPanels.orderCheckHealth.outOfDate', { count: r.staleOrderCount })
                    }}</MvStatusBadge>
                </span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.check-health__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.check-health__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 6px;
    font-size: 14px;
}

.check-health__reason,
.check-health__empty {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.check-health__counts {
    display: flex;
    gap: 8px;
}
</style>

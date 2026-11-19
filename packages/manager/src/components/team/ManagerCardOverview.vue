<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvNotImplemented, MvNotice } from '@mivend/ui-kit';
import type { ManagerCard } from '../../api/managerCard';
import { formatDateTime } from '../../i18n/format';
import ManagerCardKpis from './ManagerCardKpis.vue';
import ManagerDynamicsPanel from './ManagerDynamicsPanel.vue';
import ManagerLostPanel from './ManagerLostPanel.vue';
import ManagerReceivablesPanel from './ManagerReceivablesPanel.vue';

defineProps<{ card: ManagerCard }>();
const emit = defineEmits<{ 'update:threshold': [days: number] }>();

const { t } = useI18n();
</script>

<template>
    <div class="manager-overview">
        <MvNotice v-if="card.customersVisible < card.customersTotal" variant="info">
            {{
                t('managerCard.partial', {
                    visible: card.customersVisible,
                    total: card.customersTotal,
                })
            }}
        </MvNotice>
        <ManagerCardKpis :card="card" />
        <div class="manager-overview__grid">
            <ManagerReceivablesPanel :card="card" />
            <ManagerDynamicsPanel :card="card" />
            <ManagerLostPanel :card="card" @update:threshold="emit('update:threshold', $event)" />
            <div class="manager-overview__placeholders">
                <MvNotImplemented
                    size="widget"
                    :title="t('managerCard.plan.title')"
                    :message="`${t('managerCard.notImplemented')}. ${t('managerCard.plan.message')}`"
                />
                <MvNotImplemented
                    size="widget"
                    :title="t('managerCard.brands.title')"
                    :message="`${t('managerCard.notImplemented')}. ${t('managerCard.brands.message')}`"
                />
            </div>
        </div>
        <p class="manager-overview__note">
            {{ t('managerCard.calculated', { date: formatDateTime(card.computedAt) }) }}
        </p>
    </div>
</template>

<style scoped>
.manager-overview {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.manager-overview__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}

.manager-overview__placeholders {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.manager-overview__note {
    margin: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.manager-overview :deep(.manager-panel__title) {
    margin: 0 0 8px;
    font-size: 16px;
}

.manager-overview :deep(.manager-panel__subtitle) {
    margin: 14px 0 6px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.manager-overview :deep(.manager-panel__hint),
.manager-overview :deep(.manager-panel__empty) {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.manager-overview :deep(.manager-panel__figures) {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
}

.manager-overview :deep(.manager-panel__figures > div) {
    display: flex;
    flex-direction: column;
}

.manager-overview :deep(.manager-panel__label) {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.manager-overview :deep(.manager-panel__list) {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.manager-overview :deep(.manager-panel__list li) {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.manager-overview :deep(.manager-panel__list a) {
    color: var(--el-text-color-primary);
    font-weight: 500;
    text-decoration: none;
}

.manager-overview :deep(.manager-panel__list a:hover) {
    color: var(--el-color-primary);
    text-decoration: underline;
}

.manager-overview :deep(.manager-panel__table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.manager-overview :deep(.manager-panel__table th),
.manager-overview :deep(.manager-panel__table td) {
    padding: 6px 8px;
    text-align: right;
}

.manager-overview :deep(.manager-panel__table th:first-child) {
    text-align: left;
    font-weight: 500;
}

@media (max-width: 800px) {
    .manager-overview__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>

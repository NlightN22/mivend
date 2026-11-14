<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvStatusBadge } from '@mivend/ui-kit';
import {
    setTradingPointActive,
    type CustomerListItem,
    type TradingPointInfo,
} from '../../api/customers';
import { tradingPointDefectLabel, visibleTradingPointDefects } from './tradingPointDefects';
import TradingPointEditForm from './TradingPointEditForm.vue';
import TradingPointPendingChange from './TradingPointPendingChange.vue';
import EntityChangeJournal from '../change-journal/EntityChangeJournal.vue';
import type { ManagerOption } from '../../api/orders';
import { CHANGE_JOURNAL_LABELS } from '../change-journal/changeJournalLabels';
import { useAuthStore } from '../../stores/auth';
import { usePendingTradingPointChanges } from '../../composables/usePendingTradingPointChanges';

const props = withDefaults(
    defineProps<{ customer: CustomerListItem; managers?: ManagerOption[] }>(),
    { managers: () => [] },
);
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const editingId = ref<string | null>(null);
const authStore = useAuthStore();
const canReadJournal = computed(() => authStore.hasPermission('ReadChangeJournal'));
const reactivating = ref<string | null>(null);
const pending = usePendingTradingPointChanges(() => emit('changed'));

function siblingOf(tp: TradingPointInfo): { latitude: number; longitude: number } | null {
    const other = props.customer.tradingPoints.find(
        p => p.id !== tp.id && p.latitude != null && p.longitude != null,
    );
    return other ? { latitude: other.latitude!, longitude: other.longitude! } : null;
}

function handleEdited(): void {
    editingId.value = null;
    emit('changed');
}

async function reactivate(tp: TradingPointInfo): Promise<void> {
    reactivating.value = tp.id;
    try {
        await setTradingPointActive(tp.id, true);
        emit('changed');
    } finally {
        reactivating.value = null;
    }
}
</script>

<template>
    <div class="tp-list">
        <h3>{{ t('customers.tradingPoints.title') }}</h3>
        <ul v-if="customer.tradingPoints.length">
            <li v-for="tp in customer.tradingPoints" :key="tp.id">
                <template v-if="editingId === tp.id">
                    <h4 class="tp-list__edit-title">
                        {{ t('customers.tradingPoints.editTitle') }}
                    </h4>
                    <TradingPointPendingChange
                        v-if="pending.byPoint.value.get(tp.id)"
                        :change="pending.byPoint.value.get(tp.id)!"
                        :busy="false"
                        locked
                        @accept="pending.accept(pending.byPoint.value.get(tp.id)!)"
                        @reject="pending.reject(pending.byPoint.value.get(tp.id)!)"
                    />
                    <TradingPointEditForm
                        :trading-point="tp"
                        :sibling-point="siblingOf(tp)"
                        @submitted="handleEdited"
                        @cancel="editingId = null"
                    />
                    <section v-if="canReadJournal" class="tp-list__journal">
                        <h3 class="tp-list__journal-title">{{ CHANGE_JOURNAL_LABELS.tab }}</h3>
                        <EntityChangeJournal
                            entity-type="TradingPoint"
                            :entity-id="tp.id"
                            :managers="managers"
                        />
                    </section>
                </template>
                <template v-else>
                    <div class="tp-list__row">
                        <div>
                            <strong>{{ tp.name }}</strong>
                            <div class="tp-list__meta">{{ tp.address }}</div>
                            <div v-if="tp.defects.length" class="tp-list__defects">
                                <MvStatusBadge
                                    v-for="d in visibleTradingPointDefects(tp.defects)"
                                    :key="d"
                                    variant="warning"
                                >
                                    {{ tradingPointDefectLabel(d) }}
                                </MvStatusBadge>
                                <div v-if="!tp.customerUsable" class="tp-list__meta tp-list__warn">
                                    {{ t('customers.tradingPoints.unusable') }}
                                </div>
                            </div>
                        </div>
                        <div class="tp-list__actions">
                            <MvStatusBadge :variant="tp.isActive ? 'success' : 'neutral'">
                                {{
                                    tp.isActive
                                        ? t('customers.tradingPoints.active')
                                        : t('customers.tradingPoints.inactive')
                                }}
                            </MvStatusBadge>
                            <button
                                v-if="!tp.isActive"
                                type="button"
                                class="tp-list__btn"
                                :disabled="reactivating === tp.id"
                                @click="reactivate(tp)"
                            >
                                {{ t('customers.tradingPoints.reactivate') }}
                            </button>
                            <button
                                type="button"
                                class="tp-list__btn"
                                :disabled="editingId !== null"
                                @click="editingId = tp.id"
                            >
                                {{ t('customers.tradingPoints.edit') }}
                            </button>
                        </div>
                    </div>
                    <TradingPointPendingChange
                        v-if="pending.byPoint.value.get(tp.id)"
                        :change="pending.byPoint.value.get(tp.id)!"
                        :busy="pending.busyId.value !== null"
                        @accept="pending.accept(pending.byPoint.value.get(tp.id)!)"
                        @reject="pending.reject(pending.byPoint.value.get(tp.id)!)"
                    />
                </template>
            </li>
        </ul>
        <p v-if="pending.error.value" class="tp-list__warn">{{ pending.error.value }}</p>
        <p v-else-if="!customer.tradingPoints.length" class="tp-list__empty">
            {{ t('customers.tradingPoints.empty') }}
        </p>
    </div>
</template>

<style scoped>
.tp-list {
    grid-column: 1 / -1;
}

.tp-list h3 {
    font-size: 13px;
    margin: 0 0 10px;
    color: var(--el-text-color-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.tp-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.tp-list li {
    padding: 10px 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 12px;
}

.tp-list__row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.tp-list__edit-title {
    margin: 0 0 12px;
    font-size: 16px;
}

.tp-list__meta {
    display: flex;
    gap: 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.tp-list__defects {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: center;
}

.tp-list__warn {
    color: var(--el-color-warning-dark-2, var(--el-color-warning));
    font-weight: 700;
}

.tp-list__empty {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.tp-list__actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.tp-list__btn {
    background: none;
    border: none;
    color: var(--el-color-primary-dark-2);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}

.tp-list__btn:disabled {
    opacity: 0.5;
    cursor: default;
}

.tp-list__journal {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-lighter);
}

.tp-list__journal-title {
    margin: 0 0 12px;
    font-size: 16px;
}
</style>

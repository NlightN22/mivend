<script setup lang="ts">
import { computed, ref } from 'vue';
import { MvStatusBadge, MvModal } from '@mivend/ui-kit';
import {
    setTradingPointActive,
    type CustomerListItem,
    type CustomerCredit,
    type TradingPointInfo,
} from '../../api/customers';
import { useCurrency } from '../../composables/useCurrency';
import { tradingPointDefectLabel, visibleTradingPointDefects } from './tradingPointDefects';
import TradingPointEditForm from './TradingPointEditForm.vue';
import TradingPointPendingChange from './TradingPointPendingChange.vue';
import EntityChangeJournal from '../change-journal/EntityChangeJournal.vue';
import type { ManagerOption } from '../../api/orders';
import { CHANGE_JOURNAL_LABELS } from '../change-journal/changeJournalLabels';
import { useAuthStore } from '../../stores/auth';
import { usePendingTradingPointChanges } from '../../composables/usePendingTradingPointChanges';

const props = withDefaults(
    defineProps<{
        customer: CustomerListItem;
        credit: CustomerCredit | null;
        managers?: ManagerOption[];
    }>(),
    { managers: () => [] },
);
const emit = defineEmits<{ changed: [] }>();

const editingTradingPoint = ref<TradingPointInfo | null>(null);
const authStore = useAuthStore();
const canReadJournal = computed(() => authStore.hasPermission('ReadChangeJournal'));
const reactivating = ref<string | null>(null);

const { formatWhole } = useCurrency();
const pending = usePendingTradingPointChanges(() => emit('changed'));

function siblingOf(tp: TradingPointInfo): { latitude: number; longitude: number } | null {
    const other = props.customer.tradingPoints.find(
        p => p.id !== tp.id && p.latitude != null && p.longitude != null,
    );
    return other ? { latitude: other.latitude!, longitude: other.longitude! } : null;
}

function handleEdited(): void {
    editingTradingPoint.value = null;
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
    <div class="overview-tab">
        <div class="overview-tab__contacts">
            <h3>Contacts</h3>
            <ul v-if="customer.contacts.length">
                <li
                    v-for="contact in customer.contacts"
                    :key="contact.name + (contact.phone ?? '')"
                >
                    <strong>{{ contact.name }}</strong>
                    <span v-if="contact.isPrimary" class="overview-tab__primary">Primary</span>
                    <div class="overview-tab__contact-meta">
                        <span v-if="contact.phone">{{ contact.phone }}</span>
                        <span v-if="contact.email">{{ contact.email }}</span>
                    </div>
                </li>
            </ul>
            <p v-else class="overview-tab__empty">No contacts on file</p>
        </div>

        <dl class="overview-tab__facts">
            <div>
                <dt>Price type</dt>
                <dd>{{ customer.priceType ?? '—' }}</dd>
            </div>
            <div v-if="credit">
                <dt>Credit limit</dt>
                <dd>{{ formatWhole(credit.creditLimit) }}</dd>
            </div>
            <div v-if="credit">
                <dt>Debt</dt>
                <dd>{{ formatWhole(credit.creditBalance) }}</dd>
            </div>
            <div v-if="credit">
                <dt>Available</dt>
                <dd>{{ formatWhole(credit.creditLimit - credit.creditBalance) }}</dd>
            </div>
            <div v-if="credit && credit.paymentDelayDays > 0">
                <dt>Payment terms</dt>
                <dd>{{ credit.paymentDelayDays }} days</dd>
            </div>
        </dl>

        <div class="overview-tab__trading-points">
            <h3>Trading points</h3>
            <ul v-if="customer.tradingPoints.length">
                <li v-for="tp in customer.tradingPoints" :key="tp.id">
                    <div>
                        <strong>{{ tp.name }}</strong>
                        <div class="overview-tab__contact-meta">{{ tp.address }}</div>
                        <div v-if="tp.defects.length" class="overview-tab__tp-defects">
                            <MvStatusBadge
                                v-for="d in visibleTradingPointDefects(tp.defects)"
                                :key="d"
                                variant="warning"
                            >
                                {{ tradingPointDefectLabel(d) }}
                            </MvStatusBadge>
                            <div
                                v-if="!tp.customerUsable"
                                class="overview-tab__contact-meta overview-tab__no-location"
                            >
                                The customer cannot use this point
                            </div>
                        </div>
                    </div>
                    <div class="overview-tab__tp-actions">
                        <MvStatusBadge :variant="tp.isActive ? 'success' : 'neutral'">
                            {{ tp.isActive ? 'Active' : 'Inactive' }}
                        </MvStatusBadge>
                        <button
                            v-if="!tp.isActive"
                            type="button"
                            class="overview-tab__tp-btn"
                            :disabled="reactivating === tp.id"
                            @click="reactivate(tp)"
                        >
                            Reactivate
                        </button>
                        <button
                            type="button"
                            class="overview-tab__tp-btn"
                            @click="editingTradingPoint = tp"
                        >
                            Edit
                        </button>
                    </div>
                    <TradingPointPendingChange
                        v-if="pending.byPoint.value.get(tp.id)"
                        :change="pending.byPoint.value.get(tp.id)!"
                        :busy="pending.busyId.value !== null"
                        @accept="pending.accept(pending.byPoint.value.get(tp.id)!)"
                        @reject="pending.reject(pending.byPoint.value.get(tp.id)!)"
                    />
                </li>
            </ul>
            <p v-if="pending.error.value" class="overview-tab__no-location">
                {{ pending.error.value }}
            </p>
            <p v-else-if="!customer.tradingPoints.length" class="overview-tab__empty">
                No trading points on file
            </p>
        </div>

        <MvModal
            v-if="editingTradingPoint"
            title="Edit trading point"
            @close="editingTradingPoint = null"
        >
            <TradingPointEditForm
                :trading-point="editingTradingPoint"
                :sibling-point="siblingOf(editingTradingPoint)"
                @submitted="handleEdited"
                @cancel="editingTradingPoint = null"
            />
            <section v-if="canReadJournal" class="overview-tab__journal">
                <h3 class="overview-tab__journal-title">{{ CHANGE_JOURNAL_LABELS.tab }}</h3>
                <EntityChangeJournal
                    entity-type="TradingPoint"
                    :entity-id="editingTradingPoint.id"
                    :managers="managers"
                />
            </section>
        </MvModal>
    </div>
</template>

<style scoped>
.overview-tab__journal {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-lighter);
}

.overview-tab__journal-title {
    margin: 0 0 12px;
    font-size: 16px;
}

.overview-tab__tp-defects {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: center;
}

.overview-tab__no-location {
    color: var(--el-color-warning-dark-2, var(--el-color-warning));
    font-weight: 700;
}

.overview-tab {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
}

.overview-tab__contacts h3 {
    font-size: 13px;
    margin: 0 0 10px;
    color: var(--el-text-color-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.overview-tab__contacts ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.overview-tab__primary {
    margin-left: 8px;
    font-size: 11px;
    color: var(--el-color-primary-dark-2);
    text-transform: uppercase;
    font-weight: 800;
}

.overview-tab__contact-meta {
    display: flex;
    gap: 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.overview-tab__empty {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.overview-tab__facts {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.overview-tab__facts dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary);
}

.overview-tab__facts dd {
    margin: 2px 0 0;
    font-size: 14px;
}

.overview-tab__trading-points {
    grid-column: 1 / -1;
}

.overview-tab__trading-points h3 {
    font-size: 13px;
    margin: 0 0 10px;
    color: var(--el-text-color-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.overview-tab__trading-points ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.overview-tab__trading-points li {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 12px;
}

.overview-tab__tp-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.overview-tab__tp-btn {
    background: none;
    border: none;
    color: var(--el-color-primary-dark-2);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}

.overview-tab__tp-btn:disabled {
    opacity: 0.5;
    cursor: default;
}
</style>

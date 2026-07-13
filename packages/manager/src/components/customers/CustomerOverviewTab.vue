<script setup lang="ts">
import { ref } from 'vue';
import { MvStatusBadge, MvModal } from '@mivend/ui-kit';
import { setTradingPointActive, type CustomerListItem, type CustomerCredit, type TradingPointInfo } from '../../api/customers';
import TradingPointEditForm from './TradingPointEditForm.vue';

defineProps<{ customer: CustomerListItem; credit: CustomerCredit | null }>();
const emit = defineEmits<{ changed: [] }>();

const editingTradingPoint = ref<TradingPointInfo | null>(null);
const reactivating = ref<string | null>(null);

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
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
                <li v-for="contact in customer.contacts" :key="contact.name + (contact.phone ?? '')">
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
                <dd>{{ customer.priceType }}</dd>
            </div>
            <div v-if="credit">
                <dt>Credit limit</dt>
                <dd>{{ money(credit.creditLimit) }}</dd>
            </div>
            <div v-if="credit">
                <dt>Credit balance</dt>
                <dd>{{ money(credit.creditBalance) }}</dd>
            </div>
        </dl>

        <div class="overview-tab__trading-points">
            <h3>Trading points</h3>
            <ul v-if="customer.tradingPoints.length">
                <li v-for="tp in customer.tradingPoints" :key="tp.id">
                    <div>
                        <strong>{{ tp.name }}</strong>
                        <div class="overview-tab__contact-meta">{{ tp.address }}</div>
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
                        <button type="button" class="overview-tab__tp-btn" @click="editingTradingPoint = tp">
                            Edit
                        </button>
                    </div>
                </li>
            </ul>
            <p v-else class="overview-tab__empty">No trading points on file</p>
        </div>

        <MvModal v-if="editingTradingPoint" title="Edit trading point" @close="editingTradingPoint = null">
            <TradingPointEditForm
                :trading-point="editingTradingPoint"
                @submitted="handleEdited"
                @cancel="editingTradingPoint = null"
            />
        </MvModal>
    </div>
</template>

<style scoped>
.overview-tab {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
}

.overview-tab__contacts h3 {
    font-size: 13px;
    margin: 0 0 10px;
    color: var(--el-text-color-secondary, #6b7280);
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
    color: var(--el-color-primary-dark-2, #008a70);
    text-transform: uppercase;
    font-weight: 800;
}

.overview-tab__contact-meta {
    display: flex;
    gap: 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.overview-tab__empty {
    color: var(--el-text-color-secondary, #6b7280);
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
    color: var(--el-text-color-secondary, #6b7280);
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
    color: var(--el-text-color-secondary, #6b7280);
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
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color, #e4e7ec);
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
    color: var(--el-color-primary-dark-2, #008a70);
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

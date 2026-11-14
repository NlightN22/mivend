<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Location, Wallet, User } from '@element-plus/icons-vue';
import { useCurrency } from '../../composables/useCurrency';
import type { CustomerListItem, CustomerCredit } from '../../api/customers';
import type { ManagerOption, BranchOption } from '../../api/orders';
import type { CounterpartyTeamMember } from '../../api/counterpartyTeam';

// Info-only row: reassigning managers or changing the credit limit belongs on the Team tab / approval flows.
const props = defineProps<{
    customer: CustomerListItem;
    credit: CustomerCredit | null;
    managers: ManagerOption[];
    branches: BranchOption[];
    teamMembers: CounterpartyTeamMember[];
}>();

const { t } = useI18n();
const { formatWhole } = useCurrency();

function managerName(id: string | null): string | null {
    if (!id) return null;
    return props.managers.find(m => m.id === id)?.name ?? null;
}

const backupManagerName = computed(() => {
    const backup = props.teamMembers.find(m => m.role === 'backup');
    return backup ? managerName(backup.administratorId) : null;
});
const observerCount = computed(() => props.teamMembers.filter(m => m.role === 'observer').length);

// Counterparty.branchId is a mivend Branch.id, never Branch.erpId.
const branchName = computed(() =>
    props.customer.branchId
        ? (props.branches.find(b => b.id === props.customer.branchId)?.name ?? null)
        : null,
);

// ManagerOption has no avatar URL, so initials on a plain circle are the fallback.
function initials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
</script>

<template>
    <div class="customer-detail__info-row">
        <div class="customer-detail__info-item">
            <Location class="customer-detail__info-icon" />
            <div class="customer-detail__info-text">
                <span class="customer-detail__info-label">{{
                    t('customers.detail.location')
                }}</span>
                <span class="customer-detail__info-value">{{ branchName ?? '—' }}</span>
            </div>
        </div>
        <span class="customer-detail__info-divider" />
        <div class="customer-detail__info-item">
            <Wallet class="customer-detail__info-icon" />
            <div class="customer-detail__info-text">
                <span class="customer-detail__info-label">{{
                    t('customers.detail.creditLimit')
                }}</span>
                <span class="customer-detail__info-value">{{
                    credit ? formatWhole(credit.creditLimit) : '—'
                }}</span>
            </div>
        </div>
        <template v-if="credit && credit.paymentDelayDays > 0">
            <span class="customer-detail__info-divider" />
            <div class="customer-detail__info-item">
                <Wallet class="customer-detail__info-icon" />
                <div class="customer-detail__info-text">
                    <span class="customer-detail__info-label">{{
                        t('customers.detail.paymentTerms')
                    }}</span>
                    <span class="customer-detail__info-value">{{
                        t(
                            'customers.overview.days',
                            { count: credit.paymentDelayDays },
                            credit.paymentDelayDays,
                        )
                    }}</span>
                </div>
            </div>
        </template>
        <span class="customer-detail__info-divider" />
        <div class="customer-detail__info-item">
            <span class="customer-detail__avatar">{{
                initials(managerName(customer.assignedManagerId))
            }}</span>
            <div class="customer-detail__info-text">
                <span class="customer-detail__info-label">{{
                    t('customers.detail.primaryManager')
                }}</span>
                <span class="customer-detail__info-value">{{
                    managerName(customer.assignedManagerId) ?? t('customers.detail.unassigned')
                }}</span>
            </div>
        </div>
        <div class="customer-detail__info-item">
            <span class="customer-detail__avatar">{{ initials(backupManagerName) }}</span>
            <div class="customer-detail__info-text">
                <span class="customer-detail__info-label">{{
                    t('customers.detail.backupManager')
                }}</span>
                <span class="customer-detail__info-value">{{ backupManagerName ?? '—' }}</span>
            </div>
        </div>
        <span class="customer-detail__info-divider" />
        <div class="customer-detail__info-item">
            <User class="customer-detail__info-icon" />
            <div class="customer-detail__info-text">
                <span class="customer-detail__info-label">{{
                    t('customers.detail.observers')
                }}</span>
                <span class="customer-detail__info-value">{{ observerCount }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.customer-detail__info-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
    padding: 20px 24px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-lg, 16px);
    background: var(--app-surface);
    box-shadow: var(--app-shadow-sm);
}

.customer-detail__info-divider {
    width: 1px;
    align-self: stretch;
    background: var(--el-border-color);
}

.customer-detail__info-item {
    display: flex;
    align-items: center;
    gap: 10px;
}

.customer-detail__info-icon {
    width: 18px;
    height: 18px;
    color: var(--el-text-color-secondary);
    flex-shrink: 0;
}

.customer-detail__avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
}

.customer-detail__info-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.customer-detail__info-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.customer-detail__info-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
}
</style>

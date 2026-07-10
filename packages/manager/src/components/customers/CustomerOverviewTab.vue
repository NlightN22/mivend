<script setup lang="ts">
import type { CustomerListItem, CustomerCredit } from '../../api/customers';

defineProps<{ customer: CustomerListItem; credit: CustomerCredit | null }>();

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
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
</style>

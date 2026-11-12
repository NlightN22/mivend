<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { CustomerListItem, CustomerCredit } from '../../api/customers';
import { useCurrency } from '../../composables/useCurrency';
import CustomerTradingPoints from './CustomerTradingPoints.vue';
import type { ManagerOption } from '../../api/orders';

withDefaults(
    defineProps<{
        customer: CustomerListItem;
        credit: CustomerCredit | null;
        managers?: ManagerOption[];
    }>(),
    { managers: () => [] },
);
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const { formatWhole } = useCurrency();
</script>

<template>
    <div class="overview-tab">
        <div class="overview-tab__contacts">
            <h3>{{ t('customers.overview.contacts') }}</h3>
            <ul v-if="customer.contacts.length">
                <li
                    v-for="contact in customer.contacts"
                    :key="contact.name + (contact.phone ?? '')"
                >
                    <strong>{{ contact.name }}</strong>
                    <span v-if="contact.isPrimary" class="overview-tab__primary">{{
                        t('customers.overview.primary')
                    }}</span>
                    <div class="overview-tab__contact-meta">
                        <span v-if="contact.phone">{{ contact.phone }}</span>
                        <span v-if="contact.email">{{ contact.email }}</span>
                    </div>
                </li>
            </ul>
            <p v-else class="overview-tab__empty">{{ t('customers.overview.noContacts') }}</p>
        </div>

        <dl class="overview-tab__facts">
            <div>
                <dt>{{ t('customers.overview.priceType') }}</dt>
                <dd>{{ customer.priceType ?? '—' }}</dd>
            </div>
            <div v-if="credit">
                <dt>{{ t('customers.overview.creditLimit') }}</dt>
                <dd>{{ formatWhole(credit.creditLimit) }}</dd>
            </div>
            <div v-if="credit">
                <dt>{{ t('customers.overview.debt') }}</dt>
                <dd>{{ formatWhole(credit.creditBalance) }}</dd>
            </div>
            <div v-if="credit">
                <dt>{{ t('customers.overview.available') }}</dt>
                <dd>{{ formatWhole(credit.creditLimit - credit.creditBalance) }}</dd>
            </div>
            <div v-if="credit && credit.paymentDelayDays > 0">
                <dt>{{ t('customers.overview.paymentTerms') }}</dt>
                <dd>
                    {{
                        t(
                            'customers.overview.days',
                            { count: credit.paymentDelayDays },
                            credit.paymentDelayDays,
                        )
                    }}
                </dd>
            </div>
        </dl>

        <CustomerTradingPoints
            :customer="customer"
            :managers="managers"
            @changed="emit('changed')"
        />
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
</style>

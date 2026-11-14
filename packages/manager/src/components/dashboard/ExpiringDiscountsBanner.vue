<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { useI18n } from 'vue-i18n';
import { MvWarningBanner } from '@mivend/ui-kit';

export interface ExpiringDiscount {
    id: string;
    customerName: string;
    validTo: string;
}

const props = defineProps<{ discounts: ExpiringDiscount[] }>();
const { t } = useI18n();
</script>

<template>
    <MvWarningBanner
        v-if="props.discounts.length"
        :action-text="t('dashboardParts.expiring.action')"
        action-to="/discounts"
    >
        <strong>{{ t('dashboardParts.expiring.title') }}</strong>
        <ul>
            <li v-for="discount in props.discounts.slice(0, 3)" :key="discount.id">
                {{
                    t('dashboardParts.expiring.line', {
                        customer: discount.customerName,
                        date: formatDate(discount.validTo),
                    })
                }}
            </li>
        </ul>
    </MvWarningBanner>
</template>

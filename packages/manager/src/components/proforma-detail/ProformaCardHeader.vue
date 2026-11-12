<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IconCalendar, IconDownload, IconExternalLink, IconShoppingCart } from '@tabler/icons-vue';
import {
    MvActionMenu,
    MvButton,
    MvDateTimeCell,
    MvStatusBadge,
    formatDocumentNumber,
} from '@mivend/ui-kit';
import {
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    PROFORMA_INVOICE_STATUS_LABEL,
} from '../../api/proforma-invoices';
import { proformaPdfHref, type ProformaCard } from '../../api/proformaInvoiceCard';

const props = defineProps<{ card: ProformaCard }>();
const { t } = useI18n();
const router = useRouter();

const pdfUrl = computed(() =>
    props.card.document?.status === 'ready' ? props.card.document.pdfUrl : null,
);
const menu = computed(() => [
    { key: 'copy', label: t('proformaInvoices.header.copyNumber') },
    { key: 'list', label: t('proformaInvoices.header.showInList') },
    ...(props.card.order ? [{ key: 'order', label: t('proformaInvoices.header.openOrder') }] : []),
]);

function onMenu(key: string): void {
    if (key === 'copy')
        void navigator.clipboard?.writeText(props.card.number).catch(() => undefined);
    else if (key === 'list')
        void router.push({ path: '/proforma-invoices', query: { search: props.card.number } });
    else if (key === 'order' && props.card.order)
        void router.push(`/orders/${props.card.order.code}`);
}
</script>

<template>
    <header class="pf-header" data-testid="proforma-card-header">
        <div class="pf-header__breadcrumb">
            <RouterLink to="/proforma-invoices">{{
                t('proformaInvoices.header.breadcrumb')
            }}</RouterLink> /
            {{ formatDocumentNumber(card.number) }}
        </div>
        <div class="pf-header__row">
            <h1 class="pf-header__title">
                {{
                    t('proformaInvoices.header.title', {
                        number: formatDocumentNumber(card.number),
                    })
                }}
                <MvStatusBadge variant="info" data-testid="proforma-version">
                    v{{ card.version }}
                </MvStatusBadge>
                <MvStatusBadge
                    :variant="
                        PROFORMA_INVOICE_STATUS_BADGE_VARIANT[card.displayStatus] ?? 'neutral'
                    "
                    data-testid="proforma-status"
                >
                    {{ PROFORMA_INVOICE_STATUS_LABEL[card.displayStatus] ?? card.displayStatus }}
                </MvStatusBadge>
            </h1>
            <div class="pf-header__actions">
                <template v-if="pdfUrl">
                    <MvButton
                        variant="secondary"
                        :href="proformaPdfHref(pdfUrl, false)"
                        target="_blank"
                        data-testid="proforma-open-pdf"
                    >
                        <IconExternalLink :size="16" /> {{ t('proformaInvoices.header.open') }}
                    </MvButton>
                    <MvButton
                        variant="secondary"
                        :href="proformaPdfHref(pdfUrl, true)"
                        download
                        data-testid="proforma-download-pdf"
                    >
                        <IconDownload :size="16" /> {{ t('proformaInvoices.header.download') }}
                    </MvButton>
                </template>
                <MvButton v-else variant="secondary" disabled>{{
                    t('proformaInvoices.header.pdfPreparing')
                }}</MvButton>
                <MvActionMenu :items="menu" @select="onMenu" />
            </div>
        </div>
        <div class="pf-header__meta">
            <span class="pf-header__item">
                <IconCalendar :size="16" /> {{ t('proformaInvoices.header.issued') }}
                <strong><MvDateTimeCell :value="card.issuedAt" /></strong>
            </span>
            <span class="pf-header__item">
                <IconCalendar :size="16" /> {{ t('proformaInvoices.header.payBy') }}
                <strong><MvDateTimeCell :value="card.dueDate" /></strong>
            </span>
            <span v-if="card.order" class="pf-header__item">
                <IconShoppingCart :size="16" /> {{ t('proformaInvoices.header.order') }}
                <RouterLink
                    :to="`/orders/${card.order.code}`"
                    class="pf-header__link"
                    data-testid="proforma-order-link"
                >
                    {{ formatDocumentNumber(card.order.code) }}
                </RouterLink>
            </span>
        </div>
    </header>
</template>

<style scoped>
.pf-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.pf-header__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
}

.pf-header__breadcrumb a {
    color: inherit;
    text-decoration: none;
}

.pf-header__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.pf-header__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}

.pf-header__actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.pf-header__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 24px;
    font-size: 13px;
    color: var(--app-text-grey);
}

.pf-header__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.pf-header__item strong {
    color: var(--el-text-color-primary);
}

.pf-header__link {
    color: var(--el-color-primary-dark-2);
    font-weight: 700;
    text-decoration: none;
}

@media (max-width: 800px) {
    .pf-header__title {
        font-size: 22px;
    }
}
</style>

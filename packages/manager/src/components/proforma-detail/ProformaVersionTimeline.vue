<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvDateTimeCell, MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import {
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    PROFORMA_INVOICE_STATUS_LABEL,
} from '../../api/proforma-invoices';
import { PROFORMA_KIND_LABEL, type ProformaCard } from '../../api/proformaInvoiceCard';
import { documentMoney } from '../../utils/documentMoney';
import { changeSummary, signedMoney } from '../../utils/proformaVersionText';
import { timelineEntries } from '../../utils/proformaVersionDiff';

const props = defineProps<{ card: ProformaCard }>();
const { t } = useI18n();
const money = computed(() => documentMoney(props.card.currencyCode));
const entries = computed(() => timelineEntries(props.card.versions));
</script>

<template>
    <MvPanel :title="t('proformaInvoices.versions.title')" data-testid="proforma-versions">
        <ol class="pf-timeline">
            <li
                v-for="entry in entries"
                :key="entry.version.id"
                class="pf-timeline__item"
                :class="{ 'pf-timeline__item--current': entry.version.id === card.id }"
                :data-testid="`proforma-version-${entry.version.version}`"
            >
                <div class="pf-timeline__main">
                    <MvStatusBadge variant="info">v{{ entry.version.version }}</MvStatusBadge>
                    <RouterLink
                        v-if="entry.version.id !== card.id"
                        :to="`/proforma-invoices/${entry.version.id}`"
                        class="pf-timeline__number"
                    >
                        № {{ entry.version.number }}
                    </RouterLink>
                    <strong v-else class="pf-timeline__number">
                        № {{ entry.version.number }} {{ t('proformaInvoices.versions.thisOne') }}
                    </strong>
                    <MvStatusBadge
                        :variant="
                            PROFORMA_INVOICE_STATUS_BADGE_VARIANT[entry.version.displayStatus] ??
                            'neutral'
                        "
                    >
                        {{
                            PROFORMA_INVOICE_STATUS_LABEL[entry.version.displayStatus] ??
                            entry.version.displayStatus
                        }}
                    </MvStatusBadge>
                    <strong class="pf-timeline__amount">{{ money(entry.version.amount) }}</strong>
                </div>
                <div class="pf-timeline__meta">
                    <MvDateTimeCell :value="entry.version.issuedAt" /> ·
                    {{ PROFORMA_KIND_LABEL[entry.version.kind] ?? entry.version.kind }}
                </div>
                <div v-if="entry.change" class="pf-timeline__change">
                    {{ signedMoney(entry.change.amountDelta, money)
                    }}<template v-if="changeSummary(entry.change)"
                        >, {{ changeSummary(entry.change) }}</template
                    >
                </div>
            </li>
        </ol>
    </MvPanel>
</template>

<style scoped>
.pf-timeline {
    margin: 0;
    padding: 0 0 0 14px;
    list-style: none;
    border-left: 2px solid var(--app-row-border);
}

.pf-timeline__item {
    position: relative;
    display: grid;
    gap: 2px;
    padding: 0 0 14px 14px;
}

.pf-timeline__item::before {
    content: '';
    position: absolute;
    left: -22px;
    top: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--app-surface);
    border: 2px solid var(--app-text-grey);
}

.pf-timeline__item--current::before {
    background: var(--el-color-primary);
    border-color: var(--el-color-primary);
}

.pf-timeline__main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.pf-timeline__number {
    color: var(--el-color-primary-dark-2);
    font-weight: 700;
    text-decoration: none;
}

strong.pf-timeline__number {
    color: var(--el-text-color-primary);
}

.pf-timeline__amount {
    margin-left: auto;
}

.pf-timeline__meta {
    display: flex;
    align-items: center;
    gap: 6px;
}

.pf-timeline__meta,
.pf-timeline__change {
    color: var(--app-text-grey);
    font-size: 12px;
}
</style>

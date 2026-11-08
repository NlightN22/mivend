<script setup lang="ts">
import { useRoute } from 'vue-router';
import { MvPanel } from '@mivend/ui-kit';
import { useProformaCard } from '../../composables/useProformaCard';
import ProformaCardHeader from '../../components/proforma-detail/ProformaCardHeader.vue';
import ProformaLinesTable from '../../components/proforma-detail/ProformaLinesTable.vue';
import ProformaParties from '../../components/proforma-detail/ProformaParties.vue';
import ProformaPaymentsPanel from '../../components/proforma-detail/ProformaPaymentsPanel.vue';
import ProformaRelated from '../../components/proforma-detail/ProformaRelated.vue';
import ProformaVersionTimeline from '../../components/proforma-detail/ProformaVersionTimeline.vue';

const route = useRoute();
const { card, notFound } = useProformaCard(() => String(route.params.id));
</script>

<template>
    <div v-if="notFound" class="pf-detail__not-found">
        <h1>Proforma invoice not found</h1>
        <RouterLink to="/proforma-invoices">Back to proforma invoices</RouterLink>
    </div>

    <div v-else-if="card" class="pf-detail" data-testid="proforma-card">
        <ProformaCardHeader :card="card" />
        <ProformaParties :card="card" />
        <MvPanel><ProformaLinesTable :card="card" /></MvPanel>
        <div class="pf-detail__below">
            <ProformaPaymentsPanel :card="card" />
            <ProformaVersionTimeline v-if="card.versions.length > 1" :card="card" />
            <ProformaRelated :card="card" />
        </div>
    </div>
</template>

<style scoped>
.pf-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.pf-detail__below {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 18px;
    align-items: start;
}

.pf-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--app-text-grey);
}
</style>

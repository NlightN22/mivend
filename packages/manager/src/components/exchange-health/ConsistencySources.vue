<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { fetchConsistencySources, type ConsistencySourceRow } from '../../api/exchangeHealth';
import ConsistencySourceCard from './ConsistencySourceCard.vue';

const { t } = useI18n();
const sources = ref<ConsistencySourceRow[] | null>(null);
const failed = ref(false);

onMounted(async () => {
    try {
        sources.value = await fetchConsistencySources();
    } catch (e) {
        console.warn('[exchange health] could not load the report sources:', e);
        failed.value = true;
    }
});
</script>

<template>
    <MvNotice v-if="failed" variant="error">{{
        t('exchangeHealth.reports.sourcesFailed')
    }}</MvNotice>
    <MvNotice v-else-if="sources && !sources.length" variant="info">{{
        t('exchangeHealth.reports.noSources')
    }}</MvNotice>
    <MvPanel v-for="s in sources ?? []" :key="s.source">
        <ConsistencySourceCard :source="s" />
    </MvPanel>
</template>

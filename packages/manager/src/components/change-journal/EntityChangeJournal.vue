<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { fetchChangeJournalForEntity } from '../../api/changeJournal';
import type { ManagerOption } from '../../api/orders';
import { useChangeJournal } from '../../composables/useChangeJournal';
import ChangeJournalList from './ChangeJournalList.vue';

const props = withDefaults(
    defineProps<{ entityType: string; entityId: string; managers?: ManagerOption[] }>(),
    { managers: () => [] },
);

const journal = useChangeJournal(request =>
    fetchChangeJournalForEntity(props.entityType, props.entityId, request),
);
const { entries, totalItems, page, pageSize, loading, error, load } = journal;

onMounted(() => void load(1));
watch(
    () => [props.entityType, props.entityId],
    () => void load(1),
);
</script>

<template>
    <ChangeJournalList
        :entries="entries"
        :total-items="totalItems"
        :page="page"
        :page-size="pageSize"
        :loading="loading"
        :error="error"
        :managers="managers"
        @update:page="load"
        @retry="load()"
    />
</template>

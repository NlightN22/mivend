<script setup lang="ts">
import { computed, ref } from 'vue';
import { MvButton, MvModal } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import type { ManagerOption } from '../../api/orders';
import EntityChangeJournal from './EntityChangeJournal.vue';
import { CHANGE_JOURNAL_LABELS as L } from './changeJournalLabels';

const props = withDefaults(
    defineProps<{
        entityType: string;
        entityId: string;
        title: string;
        managers?: ManagerOption[];
    }>(),
    { managers: () => [] },
);

const authStore = useAuthStore();
const allowed = computed(() => authStore.hasPermission('ReadChangeJournal'));
const open = ref(false);
const modalTitle = computed(() => `${L.tab}: ${props.title}`);
</script>

<template>
    <template v-if="allowed">
        <MvButton size="sm" variant="secondary" @click="open = true">{{ L.tab }}</MvButton>
        <MvModal v-if="open" :title="modalTitle" @close="open = false">
            <EntityChangeJournal
                :entity-type="entityType"
                :entity-id="entityId"
                :managers="managers"
            />
        </MvModal>
    </template>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { fetchRelatedErpDocumentCounts } from '../../api/erpDocumentsList';
import {
    ERP_DOCUMENT_KINDS,
    ERP_DOCUMENT_PATHS,
    POWER_OF_ATTORNEY_PATH,
} from '../../api/erpDocumentKinds';

// Opens the first document list that has rows, preset to the order or the customer; hidden when there are none.
const props = defineProps<{ orderId?: string | null; counterpartyId?: string | null }>();

const { t } = useI18n();
const authStore = useAuthStore();
const counts = ref<Awaited<ReturnType<typeof fetchRelatedErpDocumentCounts>> | null>(null);

// Powers of attorney belong to a customer's contract, so only the customer card counts them.
const withPowers = computed(
    () => !!props.counterpartyId && authStore.hasPermission('ReadCounterparty'),
);
const lists = computed(() => [
    ...ERP_DOCUMENT_KINDS.map(k => ({ key: k, path: ERP_DOCUMENT_PATHS[k] })),
    ...(withPowers.value
        ? [{ key: 'powerOfAttorney' as const, path: POWER_OF_ATTORNEY_PATH }]
        : []),
]);
const total = computed(() =>
    counts.value ? lists.value.reduce((sum, l) => sum + (counts.value?.[l.key] ?? 0), 0) : 0,
);
const target = computed(() => {
    const list = lists.value.find(l => (counts.value?.[l.key] ?? 0) > 0);
    if (!list) return null;
    const query = props.orderId
        ? { orderId: props.orderId }
        : { counterpartyId: props.counterpartyId ?? '' };
    return { path: list.path, query };
});

async function load(): Promise<void> {
    counts.value = null;
    if (!authStore.hasPermission('ReadOrder') || (!props.orderId && !props.counterpartyId)) return;
    try {
        counts.value = await fetchRelatedErpDocumentCounts(
            props.orderId ?? null,
            props.counterpartyId ?? null,
        );
    } catch (e) {
        console.warn('[erp-documents] could not load related counts:', e);
    }
}

watch(() => [props.orderId, props.counterpartyId], load, { immediate: true });
</script>

<template>
    <RouterLink
        v-if="target"
        :to="target"
        class="erp-documents-link"
        data-testid="erp-documents-link"
    >
        {{ t('erpDocuments.link', { count: total }) }}
    </RouterLink>
</template>

<style scoped>
.erp-documents-link {
    color: var(--app-text-body2);
    font-size: 14px;
    text-decoration: underline;
}
</style>

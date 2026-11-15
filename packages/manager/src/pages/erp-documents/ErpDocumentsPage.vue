<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import ErpDocumentsList from '../../components/erp-documents/ErpDocumentsList.vue';
import { useAuthStore } from '../../stores/auth';
import {
    ERP_DOCUMENT_KINDS,
    ERP_DOCUMENT_PATHS,
    POWER_OF_ATTORNEY_PATH,
    type ErpDocumentKind,
} from '../../api/erpDocumentKinds';

const props = defineProps<{ kind: ErpDocumentKind }>();

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();

// The other lists open with the same order/customer preset, so a card link can reach any of them.
const siblings = computed(() => [
    ...ERP_DOCUMENT_KINDS.filter(k => k !== props.kind).map(k => ({
        kind: k as string,
        to: {
            path: ERP_DOCUMENT_PATHS[k],
            query: {
                ...(route.query.orderId ? { orderId: route.query.orderId } : {}),
                ...(route.query.counterpartyId
                    ? { counterpartyId: route.query.counterpartyId }
                    : {}),
            },
        },
    })),
    ...(authStore.hasPermission('ReadCounterparty')
        ? [
              {
                  kind: 'powerOfAttorney',
                  to: {
                      path: POWER_OF_ATTORNEY_PATH,
                      query: route.query.counterpartyId
                          ? { counterpartyId: route.query.counterpartyId }
                          : {},
                  },
              },
          ]
        : []),
]);
</script>

<template>
    <div class="erp-documents-page">
        <div class="erp-documents-page__header">
            <div class="erp-documents-page__breadcrumb">
                {{ t('erpDocuments.page.breadcrumb') }}
            </div>
            <div class="erp-documents-page__title-row">
                <h1 class="erp-documents-page__title">{{ t(`erpDocuments.${kind}.title`) }}</h1>
                <nav class="erp-documents-page__links">
                    <RouterLink
                        v-for="s in siblings"
                        :key="s.kind"
                        :to="s.to"
                        class="erp-documents-page__link"
                    >
                        {{ t(`erpDocuments.${s.kind}.title`) }}
                    </RouterLink>
                </nav>
            </div>
        </div>

        <ErpDocumentsList :key="kind" :kind="kind" />
    </div>
</template>

<style scoped>
.erp-documents-page__header {
    margin-bottom: 14px;
}

.erp-documents-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.erp-documents-page__title-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
}

.erp-documents-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.erp-documents-page__links {
    display: flex;
    gap: 16px;
}

.erp-documents-page__link {
    color: var(--app-text-body2);
    font-size: 14px;
    text-decoration: underline;
}

@media (max-width: 800px) {
    .erp-documents-page__breadcrumb {
        display: none;
    }

    .erp-documents-page__title {
        font-size: 22px;
    }
}
</style>

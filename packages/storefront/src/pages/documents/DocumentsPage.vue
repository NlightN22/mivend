<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvPagination } from '@mivend/ui-kit';
import AccountSidebar from '../account/AccountSidebar.vue';
import DocumentsToolbar from './DocumentsToolbar.vue';
import DocumentRow from './DocumentRow.vue';
import { useDocuments, toDocData, DOCUMENT_TYPE_LABEL } from './useDocuments';
import type { TypeFilterOption } from './DocumentsToolbar.vue';

const { documents, totalItems, loading, load } = useDocuments();

const PAGE_SIZE = 20;

const activeFilter = ref('all');
const search = ref('');
const page = ref(1);

const typeFilters: TypeFilterOption[] = [
    { key: 'all', label: 'All documents' },
    ...Object.entries(DOCUMENT_TYPE_LABEL).map(([key, label]) => ({ key, label })),
];

function reload(): void {
    void load({
        take: PAGE_SIZE,
        skip: (page.value - 1) * PAGE_SIZE,
        type: activeFilter.value === 'all' ? undefined : activeFilter.value,
        search: search.value.trim() || undefined,
    });
}

watch([activeFilter, search], () => {
    page.value = 1;
    reload();
});
watch(page, reload);

onMounted(reload);

const stats = computed(() => [
    { title: 'Total documents', value: String(totalItems.value), note: 'All types' },
]);
</script>

<template>
  <div class="documents-page">
    <AccountSidebar />

    <section class="documents-page__content">
      <div class="documents-page__head">
        <div>
          <h1 class="documents-page__title">Documents</h1>
          <p class="documents-page__subtitle">Invoices, contracts, returns and reconciliation reports linked to your account.</p>
        </div>
      </div>

      <div class="documents-page__stats">
        <div v-for="stat in stats" :key="stat.title" class="documents-page__stat-card">
          <div class="documents-page__stat-title">{{ stat.title }}</div>
          <div class="documents-page__stat-value">{{ stat.value }}</div>
          <div class="documents-page__stat-note">{{ stat.note }}</div>
        </div>
      </div>

      <div class="documents-page__main">
          <DocumentsToolbar
            :active-filter="activeFilter"
            :search="search"
            :type-filters="typeFilters"
            @update:active-filter="activeFilter = $event"
            @update:search="search = $event"
          />

          <div v-if="loading" class="documents-page__state">Loading...</div>
          <div v-else-if="!documents.length" class="documents-page__state">No documents found.</div>
          <template v-else>
            <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
            <div class="documents-page__list">
              <DocumentRow v-for="doc in documents" :key="doc.id" :doc="toDocData(doc)" />
            </div>
            <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
          </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.documents-page {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.documents-page__content { min-width: 0; }

.documents-page__head {
  margin-bottom: 18px;
}

.documents-page__title {
  margin: 0 0 6px;
  font-size: clamp(34px, 3.6vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}

.documents-page__subtitle {
  margin: 0;
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.documents-page__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.documents-page__stat-card {
  min-height: 112px;
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 20px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
}

.documents-page__stat-title {
  color: #66736e;
  font-size: 13px;
  font-weight: 850;
  margin-bottom: 13px;
}

.documents-page__stat-value {
  font-size: 28px;
  font-weight: 950;
  letter-spacing: -0.055em;
  margin-bottom: 4px;
}

.documents-page__stat-note {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
}

.documents-page__main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.documents-page__state {
  text-align: center;
  padding: 48px 24px;
  color: #66736e;
  font-size: 15px;
}

.documents-page__list { display: grid; gap: 10px; }

@media (max-width: 960px) {
  .documents-page {
    grid-template-columns: 1fr;
    padding-left: 16px;
    padding-right: 16px;
  }
  .documents-page__stats { grid-template-columns: 1fr; }
}
</style>

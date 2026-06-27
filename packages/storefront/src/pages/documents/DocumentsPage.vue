<script setup lang="ts">
import { ref } from 'vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import DocumentsToolbar from './DocumentsToolbar.vue';
import DocumentRow from './DocumentRow.vue';
import type { DocData } from './DocumentRow.vue';

const activeFilter = ref('all');
const activeChip = ref('all');
const search = ref('');

const stats = [
    { title: 'New documents', value: '12', note: 'This month' },
    { title: 'Total amount', value: '286 410 ₽', note: 'Documents for June' },
    { title: 'Reconciliation reports', value: '3', note: 'Available for download' },
    { title: 'Not sent', value: '2', note: 'Can be sent by email' },
];

const documents: DocData[] = [
    {
        icon: '📄',
        iconVariant: 'green',
        name: 'UPD #KM-004812 from 26.06.2026',
        meta: 'Order #348921 · North Highway, 12 · 7 items',
        date: '26.06.2026',
        amount: '42 860 ₽',
        statusLabel: 'New',
        statusVariant: 'green',
        actions: ['download', 'email', 'order'],
    },
    {
        icon: '₽',
        iconVariant: 'orange',
        name: 'Invoice #11874',
        meta: 'Order #348744 · partial payment · balance 21 420 ₽',
        date: '25.06.2026',
        amount: '86 420 ₽',
        statusLabel: 'Due',
        statusVariant: 'warning',
        actions: ['pay', 'download', 'email'],
    },
    {
        icon: '🧾',
        iconVariant: 'blue',
        name: 'Reconciliation report Jun 2026',
        meta: 'Company · main contract',
        date: '24.06.2026',
        amountLabel: 'Balance',
        amount: '188 580 ₽',
        statusLabel: 'Generated',
        statusVariant: 'muted',
        actions: ['download', 'email'],
    },
    {
        icon: '↩',
        iconVariant: 'green',
        name: 'Return #VZ-001932',
        meta: 'Order #347982 · return by agreement',
        date: '22.06.2026',
        amount: '4 710 ₽',
        statusLabel: 'Closed',
        statusVariant: 'muted',
        actions: ['download', 'order'],
    },
    {
        icon: '📦',
        iconVariant: 'blue',
        name: 'Waybill #TN-009442',
        meta: 'Order #347611 · ready for shipment',
        date: '21.06.2026',
        amount: '124 300 ₽',
        statusLabel: 'Available',
        statusVariant: 'green',
        actions: ['download', 'email', 'order'],
    },
];
</script>

<template>
  <div class="documents-page">
    <AccountSidebar />

    <section class="documents-page__content">
      <div class="documents-page__head">
        <div>
          <h1 class="documents-page__title">Documents</h1>
          <p class="documents-page__subtitle">Invoices, sales records, UPD, reconciliation reports, returns and order documents.</p>
        </div>
        <div class="documents-page__head-actions">
          <button class="documents-page__btn">Send by email</button>
          <button class="documents-page__btn documents-page__btn--primary">Download selected</button>
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
            :active-chip="activeChip"
            :search="search"
            @update:active-filter="activeFilter = $event"
            @update:active-chip="activeChip = $event"
            @update:search="search = $event"
          />

          <div class="documents-page__notice">
            <span>ℹ️</span>
            <div>
              <strong>Documents are linked to the client and trading point.</strong>
              You can quickly download, send by email or open the related order.
            </div>
          </div>

          <div class="documents-page__list">
            <DocumentRow v-for="doc in documents" :key="doc.name" :doc="doc" />
          </div>
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
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
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

.documents-page__head-actions {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.documents-page__btn {
  border: 0;
  min-height: 40px;
  border-radius: 12px;
  padding: 0 14px;
  background: #f3f8f6;
  color: #263732;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.documents-page__btn--primary { background: #00a878; color: #fff; }

.documents-page__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.documents-page__notice {
  padding: 15px 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 138, 0, 0.22);
  background: #fff5df;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: #573a14;
  font-size: 14px;
  line-height: 1.42;
}

.documents-page__notice strong {
  display: block;
  color: #33210a;
  margin-bottom: 2px;
}

.documents-page__list { display: grid; gap: 10px; }

@media (max-width: 960px) {
  .documents-page {
    grid-template-columns: 1fr;
    padding-left: 16px;
    padding-right: 16px;
  }
  .documents-page__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .documents-page__head { display: grid; }
  .documents-page__head-actions { justify-content: flex-start; }
}

@media (max-width: 640px) {
  .documents-page__stats { grid-template-columns: 1fr; }
}
</style>

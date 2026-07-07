<script setup lang="ts">
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';

export interface DocData {
    icon: string;
    iconVariant: 'green' | 'orange' | 'blue';
    name: string;
    meta: string;
    date: string;
    amountLabel?: string;
    amount: string;
    statusLabel: string;
    statusVariant: 'green' | 'warning' | 'muted';
    actions: Array<'download' | 'email' | 'order' | 'pay'>;
    downloadUrl?: string | null;
}

defineProps<{ doc: DocData }>();
</script>

<template>
  <article class="doc-row">
    <div class="doc-row__icon" :class="`doc-row__icon--${doc.iconVariant}`">{{ doc.icon }}</div>

    <div>
      <div class="doc-row__name">{{ doc.name }}</div>
      <div class="doc-row__meta">{{ doc.meta }}</div>
    </div>

    <div>
      <div class="doc-row__cell-title">Date</div>
      <div class="doc-row__cell-value">{{ doc.date }}</div>
    </div>

    <div>
      <div class="doc-row__cell-title">{{ doc.amountLabel ?? 'Amount' }}</div>
      <div class="doc-row__cell-value">{{ doc.amount }}</div>
    </div>

    <span class="doc-row__pill" :class="`doc-row__pill--${doc.statusVariant}`">{{ doc.statusLabel }}</span>

    <div class="doc-row__actions">
      <MvButton v-if="doc.actions.includes('pay')" variant="buy" size="sm">
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1.5" y="4" width="15" height="10.5" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M1.5 7.5h15" stroke="currentColor" stroke-width="1.5"/>
          <rect x="3.5" y="10" width="4" height="1.5" rx="0.75" fill="currentColor"/>
        </svg>
        Pay
      </MvButton>
      <MvButton
        v-if="doc.actions.includes('download') && doc.downloadUrl"
        variant="secondary"
        size="sm"
        :href="doc.downloadUrl"
        target="_blank"
        download
      >
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 2v9m0 0l-3-3m3 3l3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 13.5h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        Download
      </MvButton>
      <MvButton v-if="doc.actions.includes('email')" variant="secondary" size="sm">
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1.5" y="3.5" width="15" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M1.5 6l7.5 5 7.5-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        Email
      </MvButton>
      <MvButton v-if="doc.actions.includes('order')" variant="secondary" size="sm">
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M5.5 7h7M5.5 10h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Order
      </MvButton>
    </div>
  </article>
</template>

<style scoped>
.doc-row {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.9);
  border-radius: 22px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 16px 18px;
  display: grid;
  grid-template-columns: 46px minmax(0, 1.25fr) 150px 140px 120px 180px;
  gap: 14px;
  align-items: center;
}

.doc-row__icon {
  width: 46px;
  height: 46px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 950;
  background: #eaf4ff;
  color: #1f65b2;
}

.doc-row__icon--green { background: #e2f8ef; color: #008a64; }
.doc-row__icon--orange { background: #fff5df; color: #e87800; }
.doc-row__icon--blue { background: #eaf4ff; color: #1f65b2; }

.doc-row__name {
  font-weight: 950;
  letter-spacing: -0.02em;
  margin-bottom: 5px;
  line-height: 1.28;
}

.doc-row__meta {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
}

.doc-row__cell-title {
  color: #66736e;
  font-size: 12px;
  margin-bottom: 4px;
  font-weight: 850;
}

.doc-row__cell-value {
  font-size: 14px;
  font-weight: 900;
  line-height: 1.3;
}

.doc-row__pill {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 950;
  white-space: nowrap;
  background: #e2f8ef;
  color: #008a64;
}

.doc-row__pill--warning { background: #fff5df; color: #e87800; }
.doc-row__pill--muted { background: #eef4f1; color: #5f6e68; }
.doc-row__pill--green { background: #e2f8ef; color: #008a64; }

.doc-row__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

@media (max-width: 1260px) {
  .doc-row {
    grid-template-columns: 46px minmax(0, 1fr) 120px;
  }
  .doc-row__actions { grid-column: 2 / -1; justify-content: flex-start; }
}

@media (max-width: 640px) {
  .doc-row { grid-template-columns: 1fr; }
  .doc-row__actions { grid-column: auto; }
}
</style>

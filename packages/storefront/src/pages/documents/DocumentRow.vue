<script setup lang="ts">
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
      <button v-if="doc.actions.includes('pay')" class="doc-row__icon-btn doc-row__icon-btn--orange" title="Pay">
        <span class="doc-row__icon-btn-icon">💳</span>
        <span class="doc-row__icon-btn-label">Pay</span>
      </button>
      <button v-if="doc.actions.includes('download')" class="doc-row__icon-btn doc-row__icon-btn--primary" title="Download">
        <span class="doc-row__icon-btn-icon">⬇</span>
        <span class="doc-row__icon-btn-label">Download</span>
      </button>
      <button v-if="doc.actions.includes('email')" class="doc-row__icon-btn" title="Send by email">
        <span class="doc-row__icon-btn-icon">✉</span>
        <span class="doc-row__icon-btn-label">Email</span>
      </button>
      <button v-if="doc.actions.includes('order')" class="doc-row__icon-btn" title="Open order">
        <span class="doc-row__icon-btn-icon">📦</span>
        <span class="doc-row__icon-btn-label">Order</span>
      </button>
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
  gap: 4px;
  flex-wrap: wrap;
}

.doc-row__icon-btn {
  border: 0;
  width: 52px;
  padding: 8px 4px 6px;
  border-radius: 12px;
  background: #f3f8f6;
  color: #4a5e57;
  font: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  transition: background 0.14s;
}

.doc-row__icon-btn:hover { background: #e2f8ef; color: #008a64; }

.doc-row__icon-btn--primary { background: #e2f8ef; color: #008a64; }
.doc-row__icon-btn--primary:hover { background: #c6f0df; }

.doc-row__icon-btn--orange { background: #fff0df; color: #e87800; }
.doc-row__icon-btn--orange:hover { background: #ffe0bf; }

.doc-row__icon-btn-icon { font-size: 18px; line-height: 1; }

.doc-row__icon-btn-label {
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
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

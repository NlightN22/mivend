<script setup lang="ts">
const docs = [
    { title: 'UPD #91384', note: 'Order #348510 · Jun 24', action: 'Download' },
    { title: 'Invoice #88241', note: 'Order #348744 · Jun 25', action: 'Download' },
    { title: 'Reconciliation report', note: 'June 2026', action: 'Open' },
];
</script>

<template>
  <div class="account-documents">
    <div class="account-documents__header">
      <div>
        <h2 class="account-documents__title">Documents</h2>
        <div class="account-documents__subtitle">Latest available documents.</div>
      </div>
      <a href="#" class="account-documents__link-more">All</a>
    </div>

    <div class="account-documents__list">
      <div v-for="doc in docs" :key="doc.title" class="account-documents__row">
        <div>
          <div class="account-documents__doc-title">{{ doc.title }}</div>
          <div class="account-documents__doc-note">{{ doc.note }}</div>
        </div>
        <a href="#" class="account-documents__action">{{ doc.action }}</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account-documents {
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  border: 1px solid rgba(221, 231, 226, 0.86);
  padding: 22px;
}

.account-documents__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.account-documents__title {
  margin: 0 0 5px;
  font-size: 26px;
  letter-spacing: -0.045em;
}

.account-documents__subtitle {
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.account-documents__link-more {
  color: #008a64;
  font-weight: 950;
  font-size: 14px;
  white-space: nowrap;
  text-decoration: none;
}

.account-documents__list { display: grid; gap: 10px; }

.account-documents__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid #edf2ef;
  background: #fbfdfc;
}

.account-documents__doc-title {
  font-weight: 900;
  margin-bottom: 3px;
}

.account-documents__doc-note {
  color: #66736e;
  font-size: 13px;
  line-height: 1.3;
}

.account-documents__action {
  color: #008a64;
  font-size: 13px;
  font-weight: 950;
  white-space: nowrap;
  text-decoration: none;
}
</style>

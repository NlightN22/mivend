<script setup lang="ts">
import { ref } from 'vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import RequestsToolbar from './RequestsToolbar.vue';
import RequestCard from './RequestCard.vue';
import type { RequestData } from './RequestCard.vue';

const activeStatus = ref('all');
const activeTopic = ref('');
const search = ref('');
const sort = ref('newest');

const requests: RequestData[] = [
    {
        id: '1048',
        title: 'One item missing from shipment',
        meta: 'Request #1048 · Order #348744 · created today at 15:12',
        status: 'awaiting',
        statusLabel: 'Awaiting reply',
        assignee: 'Sales manager',
        icon: '📦',
        iconVariant: 'orange',
        preview: 'Order arrived with 11 of 12 items. Customer asks to check whether the item was excluded during picking or will be shipped separately.',
        message: {
            author: 'Manager',
            time: '15:28',
            text: 'Checking with the warehouse. Preliminary info: item went into a separate reserve, we\'ll confirm after reconciliation.',
        },
        actions: ['Open', 'Reply', 'Order'],
    },
    {
        id: '1042',
        title: 'Reconciliation report for June needed',
        meta: 'Request #1042 · Documents · created yesterday at 11:40',
        status: 'in-progress',
        statusLabel: 'In progress',
        assignee: 'Accounting',
        icon: '🧾',
        iconVariant: 'blue',
        preview: 'Customer requested a reconciliation report for the main contract and all trading points for the current month.',
        message: {
            author: 'Accounting',
            time: 'yesterday at 13:05',
            text: 'Report is being generated. After review it will appear in the Documents section and will be sent by email.',
        },
        actions: ['Open', 'Documents'],
    },
    {
        id: '1037',
        title: 'Partial payment for order',
        meta: 'Request #1037 · Order #348921 · created June 24',
        status: 'resolved',
        statusLabel: 'Resolved',
        assignee: 'Finance dept.',
        icon: '₽',
        iconVariant: 'green',
        preview: 'Customer asked whether a partial advance payment is possible and how it would be allocated across orders.',
        message: {
            author: 'Finance dept.',
            time: 'June 24 at 17:20',
            text: 'Payment accepted as advance. Allocation across orders will be handled internally.',
        },
        actions: ['Open', 'Payments'],
    },
    {
        id: '1029',
        title: 'Return request for antifreeze',
        meta: 'Request #1029 · Return · created June 21',
        status: 'closed',
        statusLabel: 'Closed',
        assignee: 'Service dept.',
        icon: '↩',
        iconVariant: 'orange',
        preview: 'Return approved, documents generated, goods accepted at warehouse.',
        message: null,
        actions: ['Open', 'Documents', 'Repeat request'],
    },
];

function handleQuickSubmit(_topic: string, _message: string) {
    // placeholder: send quick request
}
</script>

<template>
  <div class="requests-page">
    <AccountSidebar />

    <section class="requests-page__content">
      <div class="requests-page__head">
        <div>
          <h1 class="requests-page__title">Requests</h1>
          <p class="requests-page__subtitle">Questions about orders, returns, documents, payments, and customer service.</p>
        </div>
        <div class="requests-page__head-actions">
          <button class="requests-page__btn">Request templates</button>
          <button class="requests-page__btn requests-page__btn--primary">Create request</button>
        </div>
      </div>

      <div class="requests-page__main">
        <RequestsToolbar
          :search="search"
          :sort="sort"
          :active-status="activeStatus"
          :active-topic="activeTopic"
          @update:search="search = $event"
          @update:sort="sort = $event"
          @update:active-status="activeStatus = $event"
          @update:active-topic="activeTopic = $event"
          @quick-submit="handleQuickSubmit"
        />

        <div class="requests-page__notice">
          <span>ℹ️</span>
          <div>
            <strong>A request can be linked to an order, document, or payment.</strong>
            This way the customer doesn't need to re-explain the context, and the manager can resolve it faster.
          </div>
        </div>

        <div class="requests-page__list">
          <RequestCard
            v-for="req in requests"
            :key="req.id"
            :request="req"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.requests-page {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.requests-page__content { min-width: 0; }

.requests-page__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.requests-page__title {
  margin: 0 0 6px;
  font-size: clamp(34px, 3.6vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}

.requests-page__subtitle {
  margin: 0;
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.requests-page__head-actions {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.requests-page__btn {
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

.requests-page__btn--primary { background: #00a878; color: #fff; }

.requests-page__main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.requests-page__notice {
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

.requests-page__notice strong {
  display: block;
  color: #33210a;
  margin-bottom: 2px;
}

.requests-page__list { display: grid; gap: 12px; }

@media (max-width: 960px) {
  .requests-page {
    grid-template-columns: 1fr;
    padding-left: 16px;
    padding-right: 16px;
  }
  .requests-page__head { display: grid; }
  .requests-page__head-actions { justify-content: flex-start; }
}
</style>

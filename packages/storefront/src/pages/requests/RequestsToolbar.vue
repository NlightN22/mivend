<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
    search: string;
    sort: string;
    activeStatus: string;
    activeTopic: string;
}>();

const emit = defineEmits<{
    'update:search': [value: string];
    'update:sort': [value: string];
    'update:activeStatus': [value: string];
    'update:activeTopic': [value: string];
    quickSubmit: [topic: string, message: string];
}>();

const statuses = [
    { key: 'all', label: 'All requests', count: 12 },
    { key: 'new', label: 'New', count: 2 },
    { key: 'in-progress', label: 'In progress', count: 4 },
    { key: 'awaiting', label: 'Awaiting reply', count: 2 },
    { key: 'resolved', label: 'Resolved', count: 3 },
    { key: 'closed', label: 'Closed', count: 1 },
];

const topics = [
    { key: 'order', label: 'Order' },
    { key: 'payment', label: 'Payment' },
    { key: 'documents', label: 'Documents' },
    { key: 'return', label: 'Return' },
    { key: 'delivery', label: 'Delivery' },
];

const showQuick = ref(false);
const quickTopic = ref('order');
const quickMessage = ref('');

function handleQuickSubmit() {
    if (!quickMessage.value.trim()) return;
    emit('quickSubmit', quickTopic.value, quickMessage.value.trim());
    quickMessage.value = '';
    showQuick.value = false;
}
</script>

<template>
  <div class="req-toolbar">
    <div class="req-toolbar__line">
      <input
        class="req-toolbar__search"
        :value="props.search"
        placeholder="Search by request, order, document or message text"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
      <select
        class="req-toolbar__select"
        :value="props.sort"
        @change="emit('update:sort', ($event.target as HTMLSelectElement).value)"
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="status">By status</option>
      </select>
      <button
        class="req-toolbar__quick-btn"
        :class="{ 'req-toolbar__quick-btn--active': showQuick }"
        type="button"
        @click="showQuick = !showQuick"
      >
        Quick request
      </button>
    </div>

    <div class="req-toolbar__chips">
      <button
        v-for="s in statuses"
        :key="s.key"
        class="req-toolbar__chip"
        :class="{ 'req-toolbar__chip--active': props.activeStatus === s.key }"
        @click="emit('update:activeStatus', s.key)"
      >
        {{ s.label }}<span class="req-toolbar__count">{{ s.count }}</span>
      </button>
    </div>

    <div class="req-toolbar__chips">
      <button
        v-for="t in topics"
        :key="t.key"
        class="req-toolbar__chip req-toolbar__chip--sm"
        :class="{ 'req-toolbar__chip--active': props.activeTopic === t.key }"
        @click="emit('update:activeTopic', props.activeTopic === t.key ? '' : t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="showQuick" class="req-toolbar__quick">
      <div class="req-toolbar__quick-fields">
        <div class="req-toolbar__field">
          <label>Topic</label>
          <select v-model="quickTopic">
            <option value="order">Order question</option>
            <option value="payment">Payment</option>
            <option value="documents">Documents</option>
            <option value="return">Return</option>
          </select>
        </div>
        <div class="req-toolbar__field req-toolbar__field--grow">
          <label>Message</label>
          <textarea v-model="quickMessage" placeholder="Briefly describe your question" rows="2"></textarea>
        </div>
        <button class="req-toolbar__submit" @click="handleQuickSubmit">Send</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.req-toolbar {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
  display: grid;
  gap: 12px;
}

.req-toolbar__line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 150px;
  gap: 10px;
  align-items: center;
}

.req-toolbar__search,
.req-toolbar__select {
  min-height: 46px;
  border: 1px solid #dde7e2;
  border-radius: 16px;
  padding: 0 15px;
  outline: none;
  background: #fff;
  font: inherit;
  font-size: 14px;
}

.req-toolbar__search:focus,
.req-toolbar__select:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.10);
}

.req-toolbar__quick-btn {
  min-height: 46px;
  border: 1px solid #dde7e2;
  border-radius: 16px;
  padding: 0 15px;
  background: #fff;
  color: #263732;
  font: inherit;
  font-weight: 950;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: 0.14s ease;
}

.req-toolbar__quick-btn--active {
  background: #e2f8ef;
  border-color: #00a878;
  color: #008a64;
}

.req-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.req-toolbar__chip {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #dde7e2;
  background: #fff;
  color: #344640;
  font: inherit;
  font-weight: 850;
  font-size: 13px;
  cursor: pointer;
  transition: 0.14s ease;
}

.req-toolbar__chip--sm { min-height: 30px; font-size: 12px; }

.req-toolbar__chip--active {
  background: #00a878;
  border-color: #00a878;
  color: #fff;
}

.req-toolbar__count {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eef4f1;
  color: #66736e;
  font-size: 11px;
  font-weight: 900;
}

.req-toolbar__chip--active .req-toolbar__count {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.req-toolbar__quick {
  border-top: 1px solid #edf2ef;
  padding-top: 14px;
}

.req-toolbar__quick-fields {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 100px;
  gap: 10px;
  align-items: end;
}

.req-toolbar__field {
  display: grid;
  gap: 6px;
}

.req-toolbar__field label {
  color: #66736e;
  font-size: 13px;
  font-weight: 850;
}

.req-toolbar__field select,
.req-toolbar__field textarea {
  border: 1px solid #dde7e2;
  border-radius: 13px;
  padding: 0 12px;
  outline: none;
  background: #fff;
  font: inherit;
  font-size: 14px;
}

.req-toolbar__field select { min-height: 42px; }

.req-toolbar__field textarea {
  padding: 10px 12px;
  resize: none;
  line-height: 1.42;
}

.req-toolbar__field select:focus,
.req-toolbar__field textarea:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.10);
}

.req-toolbar__submit {
  min-height: 42px;
  border: 0;
  border-radius: 13px;
  padding: 0 14px;
  background: #00a878;
  color: #fff;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
}

@media (max-width: 960px) {
  .req-toolbar__line { grid-template-columns: minmax(0, 1fr) 150px; }
  .req-toolbar__quick-btn { display: none; }
  .req-toolbar__quick-fields { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .req-toolbar__line { grid-template-columns: 1fr; }
}
</style>

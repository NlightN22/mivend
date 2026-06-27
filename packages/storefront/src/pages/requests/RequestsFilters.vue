<script setup lang="ts">
const props = defineProps<{
    activeStatus: string;
    activeTopic: string;
}>();

const emit = defineEmits<{
    'update:activeStatus': [value: string];
    'update:activeTopic': [value: string];
    submit: [topic: string, message: string];
}>();

import { ref } from 'vue';

const quickTopic = ref('order');
const quickMessage = ref('');

function handleSubmit() {
    if (!quickMessage.value.trim()) return;
    emit('submit', quickTopic.value, quickMessage.value.trim());
    quickMessage.value = '';
}

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
</script>

<template>
  <aside class="req-filters">
    <h2 class="req-filters__title">Statuses</h2>
    <nav class="req-filters__list">
      <a
        v-for="s in statuses"
        :key="s.key"
        href="#"
        class="req-filters__link"
        :class="{ 'req-filters__link--active': props.activeStatus === s.key }"
        @click.prevent="emit('update:activeStatus', s.key)"
      >
        <span>{{ s.label }}</span>
        <span class="req-filters__count">{{ s.count }}</span>
      </a>
    </nav>

    <div class="req-filters__block">
      <h2 class="req-filters__title">Topic</h2>
      <nav class="req-filters__list">
        <a
          v-for="t in topics"
          :key="t.key"
          href="#"
          class="req-filters__link"
          :class="{ 'req-filters__link--active': props.activeTopic === t.key }"
          @click.prevent="emit('update:activeTopic', props.activeTopic === t.key ? '' : t.key)"
        >
          {{ t.label }}
        </a>
      </nav>
    </div>

    <div class="req-filters__quick">
      <div class="req-filters__quick-title">Quick request</div>
      <div class="req-filters__quick-note">For a short question without a separate form.</div>

      <div class="req-filters__field">
        <label>Topic</label>
        <select v-model="quickTopic">
          <option value="order">Order question</option>
          <option value="payment">Payment</option>
          <option value="documents">Documents</option>
          <option value="return">Return</option>
        </select>
      </div>

      <div class="req-filters__field">
        <label>Message</label>
        <textarea v-model="quickMessage" placeholder="Briefly describe your question"></textarea>
      </div>

      <button class="req-filters__submit" @click="handleSubmit">Send</button>
    </div>
  </aside>
</template>

<style scoped>
.req-filters {
  position: sticky;
  top: 118px;
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
}

.req-filters__title {
  margin: 0 0 13px;
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -0.035em;
}

.req-filters__list {
  display: grid;
  gap: 4px;
}

.req-filters__link {
  min-height: 39px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 12px;
  padding: 0 11px;
  color: #2d3d37;
  font-size: 14px;
  font-weight: 800;
  text-decoration: none;
}

.req-filters__link--active {
  background: #e2f8ef;
  color: #008a64;
  font-weight: 950;
}

.req-filters__link:hover:not(.req-filters__link--active) {
  background: #f4faf7;
}

.req-filters__count {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eef4f1;
  color: #66736e;
  font-size: 12px;
  font-weight: 900;
}

.req-filters__block {
  border-top: 1px solid #edf2ef;
  padding-top: 16px;
  margin-top: 16px;
}

.req-filters__quick {
  background: linear-gradient(135deg, #ffffff, #f2fff7);
  border: 1px solid rgba(0, 168, 120, 0.18);
  border-radius: 20px;
  padding: 16px;
  margin-top: 16px;
}

.req-filters__quick-title {
  font-weight: 950;
  margin-bottom: 5px;
  letter-spacing: -0.02em;
}

.req-filters__quick-note {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
  margin-bottom: 12px;
}

.req-filters__field {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
}

.req-filters__field label {
  color: #66736e;
  font-size: 13px;
  font-weight: 850;
}

.req-filters__field select,
.req-filters__field textarea {
  border: 1px solid #dde7e2;
  border-radius: 13px;
  padding: 0 12px;
  outline: none;
  background: #fff;
  font: inherit;
  font-size: 14px;
}

.req-filters__field select { min-height: 42px; }

.req-filters__field textarea {
  padding: 12px;
  min-height: 88px;
  resize: vertical;
  line-height: 1.42;
}

.req-filters__field select:focus,
.req-filters__field textarea:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.10);
}

.req-filters__submit {
  width: 100%;
  border: 0;
  min-height: 40px;
  border-radius: 12px;
  padding: 0 14px;
  background: #00a878;
  color: #fff;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
}

@media (max-width: 960px) {
  .req-filters { position: static; }
}
</style>

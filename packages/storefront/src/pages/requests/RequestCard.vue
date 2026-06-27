<script setup lang="ts">
export interface RequestMessage {
    author: string;
    time: string;
    text: string;
}

export interface RequestData {
    id: string;
    title: string;
    meta: string;
    status: 'new' | 'in-progress' | 'awaiting' | 'resolved' | 'closed';
    statusLabel: string;
    assignee: string;
    icon: string;
    iconVariant: 'blue' | 'green' | 'orange';
    preview: string;
    message: RequestMessage | null;
    actions: string[];
}

defineProps<{ request: RequestData }>();

const statusVariant: Record<RequestData['status'], string> = {
    new: 'green',
    'in-progress': 'blue',
    awaiting: 'warning',
    resolved: 'green',
    closed: 'muted',
};
</script>

<template>
  <article class="req-card">
    <div class="req-card__head">
      <div>
        <div class="req-card__title">{{ request.title }}</div>
        <div class="req-card__meta">{{ request.meta }}</div>
      </div>
      <span class="req-card__status" :class="`req-card__status--${statusVariant[request.status]}`">
        {{ request.statusLabel }}
      </span>
      <div class="req-card__meta">Assignee<br /><strong>{{ request.assignee }}</strong></div>
    </div>

    <div class="req-card__body">
      <div class="req-card__preview">
        <div class="req-card__icon" :class="`req-card__icon--${request.iconVariant}`">{{ request.icon }}</div>
        <div>{{ request.preview }}</div>
      </div>

      <div v-if="request.message" class="req-card__message">
        <div class="req-card__msg-author">{{ request.message.author }} · {{ request.message.time }}</div>
        <div class="req-card__msg-text">{{ request.message.text }}</div>
      </div>

      <div class="req-card__actions">
        <button
          v-for="action in request.actions"
          :key="action"
          class="req-card__btn"
          :class="{ 'req-card__btn--primary': action === 'Open' }"
        >
          {{ action }}
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.req-card {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.9);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  overflow: hidden;
}

.req-card__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px 150px;
  gap: 14px;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid #edf2ef;
}

.req-card__title {
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -0.035em;
  margin-bottom: 5px;
}

.req-card__meta {
  color: #66736e;
  font-size: 13px;
  line-height: 1.38;
}

.req-card__status {
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

.req-card__status--green { background: #e2f8ef; color: #008a64; }
.req-card__status--blue { background: #eaf4ff; color: #1f65b2; }
.req-card__status--warning { background: #fff5df; color: #e87800; }
.req-card__status--muted { background: #eef4f1; color: #5f6e68; }

.req-card__body {
  padding: 16px 20px 18px;
  display: grid;
  gap: 14px;
}

.req-card__preview {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.req-card__icon {
  width: 46px;
  height: 46px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 950;
  flex-shrink: 0;
  background: #eaf4ff;
  color: #1f65b2;
}

.req-card__icon--green { background: #e2f8ef; color: #008a64; }
.req-card__icon--orange { background: #fff5df; color: #e87800; }
.req-card__icon--blue { background: #eaf4ff; color: #1f65b2; }

.req-card__message {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 16px;
  background: #fbfdfc;
  border: 1px solid #edf2ef;
}

.req-card__msg-author {
  font-weight: 950;
  font-size: 13px;
  color: #008a64;
}

.req-card__msg-text {
  color: #43524d;
  font-size: 13px;
  line-height: 1.42;
}

.req-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.req-card__btn {
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

.req-card__btn--primary { background: #00a878; color: #fff; }

@media (max-width: 960px) {
  .req-card__head { grid-template-columns: 1fr; }
  .req-card__actions { justify-content: flex-start; }
}
</style>

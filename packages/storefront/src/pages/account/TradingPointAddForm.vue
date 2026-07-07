<script setup lang="ts">
import type { TradingPointAddForm } from './useTradingPoints';

const model = defineModel<TradingPointAddForm>({ required: true });

defineProps<{ saving: boolean }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();
</script>

<template>
    <div class="tp-add-card">
        <div class="tp-add-title">New trading point</div>
        <div class="tp-form">
            <label class="tp-field">
                <span>Name</span>
                <input v-model="model.name" placeholder="e.g. North AutoService" />
            </label>
            <label class="tp-field tp-field--wide">
                <span>Delivery address</span>
                <input v-model="model.address" placeholder="Full address" />
            </label>
            <label class="tp-field">
                <span>Contact person</span>
                <input v-model="model.contactName" placeholder="Full name" />
            </label>
            <label class="tp-field">
                <span>Phone</span>
                <input v-model="model.contactPhone" placeholder="+7 ..." type="tel" />
            </label>
            <label class="tp-field tp-field--wide">
                <span>Working hours</span>
                <input v-model="model.workingHours" placeholder="e.g. Mon–Fri 09:00–18:00" />
            </label>
            <label class="tp-field tp-field--wide">
                <span>Delivery comment</span>
                <textarea v-model="model.deliveryComment" rows="2" placeholder="Gate code, entry from rear, etc." />
            </label>
        </div>
        <div class="tp-add-actions">
            <button
                class="tp-btn tp-btn--primary"
                :disabled="saving || !model.name || !model.address"
                @click="emit('submit')"
            >{{ saving ? 'Saving…' : 'Add point' }}</button>
            <button class="tp-btn tp-btn--ghost" @click="emit('cancel')">Cancel</button>
        </div>
    </div>
</template>

<style scoped>
.tp-add-card {
    background: #fff;
    border: 1px solid #00a878;
    border-radius: 20px;
    padding: 18px 20px;
    margin-bottom: 16px;
}

.tp-add-title {
    font-size: 16px;
    font-weight: 900;
    letter-spacing: -0.03em;
    margin-bottom: 14px;
}

.tp-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
}

.tp-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 13px;
    font-weight: 700;
    color: #66736e;
}

.tp-field--wide { grid-column: 1 / -1; }

.tp-field input,
.tp-field textarea {
    border: 1px solid #dde7e2;
    border-radius: 12px;
    padding: 10px 12px;
    font: inherit;
    font-size: 14px;
    outline: none;
    resize: vertical;
}

.tp-field input:focus,
.tp-field textarea:focus {
    border-color: #00a878;
    box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.1);
}

.tp-add-actions { display: flex; gap: 8px; }

.tp-btn {
    border: 0;
    border-radius: 12px;
    padding: 0 16px;
    min-height: 40px;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    transition: 0.14s ease;
}
.tp-btn--primary { background: #00a878; color: #fff; }
.tp-btn--ghost { background: #f3f8f6; color: #263732; border: 1px solid #dde7e2; }
.tp-btn:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 960px) {
    .tp-form { grid-template-columns: 1fr; }
    .tp-field--wide { grid-column: auto; }
}
</style>

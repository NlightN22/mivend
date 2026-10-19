<script setup lang="ts">
import type { TradingPointAddForm } from './useTradingPoints';

const model = defineModel<TradingPointAddForm>({ required: true });
</script>

<template>
    <div class="tp-form">
        <label class="tp-field">
            <span>{{ $t('tradingPoints.field.name') }}</span>
            <input v-model="model.name" :placeholder="$t('tradingPoints.field.namePlaceholder')" />
        </label>
        <label class="tp-field tp-field--wide">
            <span>{{ $t('tradingPoints.field.address') }}</span>
            <input
                v-model="model.address"
                :placeholder="$t('tradingPoints.field.addressPlaceholder')"
            />
        </label>
        <label class="tp-field">
            <span>{{ $t('tradingPoints.field.contactName') }}</span>
            <input
                v-model="model.contactName"
                :placeholder="$t('tradingPoints.field.contactNamePlaceholder')"
            />
        </label>
        <label class="tp-field">
            <span>{{ $t('tradingPoints.field.phone') }}</span>
            <input
                v-model="model.contactPhone"
                :placeholder="$t('tradingPoints.field.phonePlaceholder')"
                type="tel"
            />
        </label>
        <label class="tp-field tp-field--wide">
            <span>{{ $t('tradingPoints.field.hours') }}</span>
            <input
                v-model="model.workingHours"
                :placeholder="$t('tradingPoints.field.hoursPlaceholder')"
            />
        </label>
        <label class="tp-field tp-field--wide">
            <span>{{ $t('tradingPoints.field.comment') }}</span>
            <textarea
                v-model="model.deliveryComment"
                rows="2"
                :placeholder="$t('tradingPoints.field.commentPlaceholder')"
            />
        </label>
    </div>
</template>

<style scoped>
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

.tp-field--wide {
    grid-column: 1 / -1;
}

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

@media (max-width: 960px) {
    .tp-form {
        grid-template-columns: 1fr;
    }
    .tp-field--wide {
        grid-column: auto;
    }
}
</style>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { MvAddressInput, MvFormField, MvInput, MvNameInput, MvPhoneInput } from '@mivend/ui-kit';
import type { TradingPointAddForm } from './useTradingPoints';
import { suggestAddress } from './suggestAddress';
import { tradingPointErrors } from './tradingPointValidation';

const model = defineModel<TradingPointAddForm>({ required: true });
const props = defineProps<{ original?: TradingPointAddForm }>();
const touched = reactive({ name: false, address: false, contactName: false, contactPhone: false });
const errors = computed(() => tradingPointErrors(model.value, props.original));
</script>

<template>
    <div class="tp-form">
        <MvFormField
            :label="$t('tradingPoints.field.name')"
            :error="touched.name && errors.name ? $t(errors.name) : undefined"
            required
        >
            <MvInput
                v-model="model.name"
                :placeholder="$t('tradingPoints.field.namePlaceholder')"
                :error="touched.name && !!errors.name"
                @focusout="touched.name = true"
            />
        </MvFormField>
        <MvFormField
            class="tp-field--wide"
            :label="$t('tradingPoints.field.address')"
            :error="touched.address && errors.address ? $t(errors.address) : undefined"
            required
        >
            <MvAddressInput
                v-model="model.address"
                :fetch-suggestions="suggestAddress"
                :placeholder="$t('tradingPoints.field.addressPlaceholder')"
                :error="touched.address && !!errors.address"
                @blur="touched.address = true"
            />
        </MvFormField>
        <MvFormField
            :label="$t('tradingPoints.field.contactName')"
            :error="touched.contactName && errors.contactName ? $t(errors.contactName) : undefined"
        >
            <MvNameInput
                v-model="model.contactName"
                :placeholder="$t('tradingPoints.field.contactNamePlaceholder')"
                :error="touched.contactName && !!errors.contactName"
                @blur="touched.contactName = true"
            />
        </MvFormField>
        <MvFormField
            :label="$t('tradingPoints.field.phone')"
            :error="
                touched.contactPhone && errors.contactPhone ? $t(errors.contactPhone) : undefined
            "
        >
            <MvPhoneInput
                v-model="model.contactPhone"
                :error="touched.contactPhone && !!errors.contactPhone"
                @blur="touched.contactPhone = true"
            />
        </MvFormField>
        <MvFormField class="tp-field--wide" :label="$t('tradingPoints.field.hours')">
            <MvInput
                v-model="model.workingHours"
                :placeholder="$t('tradingPoints.field.hoursPlaceholder')"
            />
        </MvFormField>
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
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

.tp-field textarea {
    border: 1px solid #dde7e2;
    border-radius: 12px;
    padding: 10px 12px;
    font: inherit;
    font-size: 14px;
    outline: none;
    resize: vertical;
}

.tp-field textarea:focus {
    border-color: #00a878;
    box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.1);
}

@media (max-width: 960px) {
    .tp-form {
        grid-template-columns: minmax(0, 1fr);
    }
    .tp-field--wide {
        grid-column: auto;
    }
}
</style>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
    MvAddressInput,
    MvButton,
    MvFormField,
    MvInput,
    MvNotice,
    MvWorkingHoursInput,
    tradingPointFieldErrors,
    type GeoPoint,
    type TradingPointFieldValues,
} from '@mivend/ui-kit';
import { updateTradingPointDetails, type TradingPointInfo } from '../../api/customers';
import { suggestAddress } from '../../api/geo';
import { useContactRows } from '../../composables/useContactRows';
import TradingPointContactRows from './TradingPointContactRows.vue';
import TradingPointLocationField from './TradingPointLocationField.vue';

const props = defineProps<{ tradingPoint: TradingPointInfo; siblingPoint?: GeoPoint | null }>();
const emit = defineEmits<{ submitted: []; cancel: [] }>();

const FIELD_ERROR_TEXT = {
    name: 'Enter the trading point name',
    address: 'Enter a full address with a street and building number',
    workingHours: 'Enter working hours with a time, e.g. Mon-Fri 9:00-18:00',
} as const;

const submitting = ref(false);
const error = ref('');
const touched = reactive({ name: false, address: false, workingHours: false });

const form = reactive({
    name: props.tradingPoint.name,
    address: props.tradingPoint.address,
    location:
        props.tradingPoint.latitude != null && props.tradingPoint.longitude != null
            ? ({
                  latitude: props.tradingPoint.latitude,
                  longitude: props.tradingPoint.longitude,
              } as GeoPoint | null)
            : null,
    workingHours: props.tradingPoint.workingHours ?? '',
    deliveryComment: props.tradingPoint.deliveryComment ?? '',
});
const contacts = useContactRows(props.tradingPoint.contacts);

const originalValues: TradingPointFieldValues = {
    name: props.tradingPoint.name,
    address: props.tradingPoint.address,
    contactName: '',
    contactPhone: '',
    workingHours: props.tradingPoint.workingHours ?? '',
    latitude: props.tradingPoint.latitude,
    longitude: props.tradingPoint.longitude,
};
const errors = computed(() =>
    tradingPointFieldErrors(
        {
            ...originalValues,
            name: form.name,
            address: form.address,
            workingHours: form.workingHours,
            latitude: form.location?.latitude ?? null,
            longitude: form.location?.longitude ?? null,
        },
        originalValues,
    ),
);

function shown(key: keyof typeof FIELD_ERROR_TEXT): string | undefined {
    return touched[key] && errors.value[key] ? FIELD_ERROR_TEXT[key] : undefined;
}

async function submit(): Promise<void> {
    error.value = '';
    Object.assign(touched, { name: true, address: true, workingHours: true });
    contacts.touchAll();
    if (errors.value.name || errors.value.address || errors.value.workingHours) return;
    if (!form.location) {
        error.value = 'Pick the trading point location on the map';
        return;
    }
    if (!contacts.valid.value) return;
    submitting.value = true;
    try {
        await updateTradingPointDetails(props.tradingPoint.id, {
            name: form.name.trim(),
            address: form.address.trim(),
            latitude: form.location.latitude,
            longitude: form.location.longitude,
            workingHours: form.workingHours.trim() || null,
            deliveryComment: form.deliveryComment.trim() || null,
            contacts: contacts.rows.map(c => ({
                name: c.name.trim(),
                phone: c.phone.trim() || null,
                email: c.email.trim() || null,
                isPrimary: c.isPrimary,
            })),
        });
        emit('submitted');
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not save the trading point';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="tp-edit-form">
        <div class="tp-edit-form__grid">
            <MvFormField label="Name" :error="shown('name')" required>
                <MvInput
                    v-model="form.name"
                    size="sm"
                    :error="!!shown('name')"
                    @focusout="touched.name = true"
                />
            </MvFormField>
            <MvFormField label="Address" :error="shown('address')" required>
                <MvAddressInput
                    v-model="form.address"
                    size="sm"
                    :fetch-suggestions="suggestAddress"
                    :error="!!shown('address')"
                    @blur="touched.address = true"
                />
            </MvFormField>
            <MvFormField label="Working hours" :error="shown('workingHours')">
                <MvWorkingHoursInput
                    v-model="form.workingHours"
                    size="sm"
                    :error="!!shown('workingHours')"
                    @blur="touched.workingHours = true"
                />
            </MvFormField>
        </div>

        <TradingPointLocationField
            v-model="form.location"
            :address="form.address"
            :sibling="siblingPoint ?? null"
            :legacy="tradingPoint.latitude == null || tradingPoint.longitude == null"
        />

        <label class="tp-edit-form__comment">
            Delivery comment
            <textarea v-model="form.deliveryComment" rows="2" />
        </label>

        <TradingPointContactRows :contacts="contacts" />

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <div class="tp-edit-form__actions">
            <MvButton :loading="submitting" :disabled="!form.location" @click="submit"
                >Save changes</MvButton
            >
            <button type="button" class="tp-edit-form__cancel" @click="emit('cancel')">
                Cancel
            </button>
        </div>
    </div>
</template>

<style scoped>
.tp-edit-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.tp-edit-form__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    align-items: start;
}

.tp-edit-form__comment {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary);
}

.tp-edit-form__comment textarea {
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
    resize: vertical;
}

.tp-edit-form__actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.tp-edit-form__cancel {
    background: none;
    border: none;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    cursor: pointer;
}
</style>

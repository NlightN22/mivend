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
    workingHours: 'Working hours are too long (200 characters max)',
} as const;

const HOURS_PRESETS = [
    'Mon-Fri 9:00-18:00',
    'Mon-Fri 8:00-17:00',
    'Mon-Sat 9:00-18:00',
    'Daily 9:00-21:00',
    'Daily, round the clock',
];

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
        <MvFormField label="Name" :error="shown('name')" required>
            <MvInput
                v-model="form.name"
                :error="!!shown('name')"
                @focusout="touched.name = true"
            />
        </MvFormField>
        <MvFormField label="Address" :error="shown('address')" required>
            <MvAddressInput
                v-model="form.address"
                :fetch-suggestions="suggestAddress"
                :error="!!shown('address')"
                @blur="touched.address = true"
            />
        </MvFormField>

        <TradingPointLocationField
            v-model="form.location"
            :address="form.address"
            :sibling="siblingPoint ?? null"
            :legacy="tradingPoint.latitude == null || tradingPoint.longitude == null"
        />

        <MvFormField label="Working hours" :error="shown('workingHours')">
            <MvWorkingHoursInput
                v-model="form.workingHours"
                :presets="HOURS_PRESETS"
                :error="!!shown('workingHours')"
                @blur="touched.workingHours = true"
            />
        </MvFormField>

        <MvFormField label="Delivery comment">
            <textarea v-model="form.deliveryComment" class="tp-edit-form__comment" rows="2" />
        </MvFormField>

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

.tp-edit-form__comment {
    width: 100%;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
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

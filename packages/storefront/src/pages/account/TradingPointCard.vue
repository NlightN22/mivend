<script setup lang="ts">
import { ref, watch } from 'vue';
import type { GeoPoint } from '@mivend/ui-kit';
import type { TradingPointAddForm } from './useTradingPoints';
import { isTradingPointValid } from './tradingPointValidation';
import TradingPointFields from './TradingPointFields.vue';

export interface ContactPerson {
    id: string;
    name: string;
    phone: string | null;
    isPrimary: boolean;
}
export interface TradingPoint {
    id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    workingHours: string | null;
    deliveryComment: string | null;
    customerStatus: string;
    customerOwned: boolean;
    contacts: ContactPerson[];
    pendingChange?: {
        name: string;
        address: string;
        latitude: number;
        longitude: number;
        workingHours: string | null;
        contactName: string | null;
        contactPhone: string | null;
    } | null;
}

const props = defineProps<{
    point: TradingPoint;
    isCurrent: boolean;
    sibling?: GeoPoint | null;
}>();

const emit = defineEmits<{
    save: [
        id: string,
        data: {
            name: string;
            address: string;
            contactName: string | null;
            contactPhone: string | null;
            workingHours: string | null;
            deliveryComment: string | null;
            latitude: number | null;
            longitude: number | null;
        },
    ];
    remove: [id: string];
    setCurrent: [id: string];
}>();

const editing = ref(false);
const confirmRemove = ref(false);
const saving = ref(false);

const primaryContact = () =>
    props.point.contacts.find(c => c.isPrimary) ?? props.point.contacts[0] ?? null;

const original = ref<TradingPointAddForm | undefined>();
const form = ref({
    name: '',
    address: '',
    contactName: '',
    contactPhone: '',
    workingHours: '',
    deliveryComment: '',
    latitude: null as number | null,
    longitude: null as number | null,
});

function startEdit() {
    const c = primaryContact();
    form.value = {
        name: props.point.name,
        address: props.point.address,
        contactName: c?.name ?? '',
        contactPhone: c?.phone ?? '',
        workingHours: props.point.workingHours ?? '',
        deliveryComment: props.point.deliveryComment ?? '',
        latitude: props.point.latitude,
        longitude: props.point.longitude,
    };
    original.value = { ...form.value };
    editing.value = true;
    confirmRemove.value = false;
}

function cancelEdit() {
    editing.value = false;
}

async function handleSave() {
    saving.value = true;
    await emit('save', props.point.id, {
        name: form.value.name,
        address: form.value.address,
        contactName: form.value.contactName || null,
        contactPhone: form.value.contactPhone || null,
        workingHours: form.value.workingHours || null,
        deliveryComment: form.value.deliveryComment || null,
        latitude: form.value.latitude,
        longitude: form.value.longitude,
    });
    saving.value = false;
    editing.value = false;
}

watch(
    () => props.point,
    () => {
        editing.value = false;
        confirmRemove.value = false;
    },
);
</script>

<template>
    <article
        class="tp-card"
        :class="{ 'tp-card--current': props.isCurrent, 'tp-card--editing': editing }"
    >
        <template v-if="!editing">
            <div class="tp-card__head">
                <div class="tp-card__meta">
                    <div class="tp-card__name-row">
                        <span class="tp-card__name">{{ props.point.name }}</span>
                        <span v-if="props.isCurrent" class="tp-card__pill tp-card__pill--green">{{
                            $t('tradingPoints.current')
                        }}</span>
                        <span
                            v-if="props.point.customerOwned"
                            class="tp-card__pill tp-card__pill--blue"
                            >{{ $t('tradingPoints.addedByYou') }}</span
                        >
                    </div>
                    <div class="tp-card__addr">{{ props.point.address }}</div>
                </div>
                <div class="tp-card__head-actions">
                    <button
                        v-if="!props.isCurrent"
                        class="tp-card__btn tp-card__btn--ghost tp-card__btn--sm"
                        @click="emit('setCurrent', props.point.id)"
                    >
                        {{ $t('tradingPoints.setCurrent') }}
                    </button>
                    <button
                        class="tp-card__btn tp-card__btn--ghost tp-card__btn--sm"
                        @click="startEdit"
                    >
                        {{ $t('tradingPoints.edit') }}
                    </button>
                    <button
                        v-if="!confirmRemove"
                        class="tp-card__btn tp-card__btn--danger tp-card__btn--sm"
                        @click="confirmRemove = true"
                    >
                        {{ $t('tradingPoints.remove') }}
                    </button>
                    <template v-else>
                        <button
                            class="tp-card__btn tp-card__btn--danger tp-card__btn--sm"
                            @click="emit('remove', props.point.id)"
                        >
                            {{ $t('tradingPoints.confirmRemove') }}
                        </button>
                        <button
                            class="tp-card__btn tp-card__btn--ghost tp-card__btn--sm"
                            @click="confirmRemove = false"
                        >
                            {{ $t('common.cancel') }}
                        </button>
                    </template>
                </div>
            </div>

            <div
                v-if="primaryContact() || props.point.workingHours || props.point.deliveryComment"
                class="tp-card__info"
            >
                <div v-if="primaryContact()" class="tp-card__info-cell">
                    <div class="tp-card__info-label">{{ $t('tradingPoints.contact') }}</div>
                    <div class="tp-card__info-value">
                        {{ primaryContact()!.name }}
                        <span v-if="primaryContact()!.phone"
                            ><br />{{ primaryContact()!.phone }}</span
                        >
                    </div>
                </div>
                <div v-if="props.point.workingHours" class="tp-card__info-cell">
                    <div class="tp-card__info-label">{{ $t('tradingPoints.hours') }}</div>
                    <div class="tp-card__info-value">{{ props.point.workingHours }}</div>
                </div>
                <div v-if="props.point.deliveryComment" class="tp-card__info-cell">
                    <div class="tp-card__info-label">{{ $t('tradingPoints.note') }}</div>
                    <div class="tp-card__info-value">{{ props.point.deliveryComment }}</div>
                </div>
            </div>

            <div v-if="props.point.pendingChange" class="tp-card__pending" data-testid="tp-pending">
                <div class="tp-card__pending-title">{{ $t('tradingPoints.pendingTitle') }}</div>
                <div class="tp-card__pending-values">
                    {{ props.point.pendingChange.name }} · {{ props.point.pendingChange.address }}
                </div>
                <div class="tp-card__pending-hint">{{ $t('tradingPoints.pendingHint') }}</div>
            </div>
        </template>

        <template v-else>
            <div class="tp-card__edit-title">{{ $t('tradingPoints.editTitle') }}</div>
            <div class="tp-card__form">
                <TradingPointFields
                    v-model="form"
                    :original="original"
                    :sibling="sibling ?? null"
                />
            </div>
            <div class="tp-card__edit-actions">
                <button
                    class="tp-card__btn tp-card__btn--primary"
                    :disabled="saving || !isTradingPointValid(form, original)"
                    @click="handleSave"
                >
                    {{ saving ? $t('tradingPoints.saving') : $t('tradingPoints.saveChanges') }}
                </button>
                <button class="tp-card__btn tp-card__btn--ghost" @click="cancelEdit">
                    {{ $t('common.cancel') }}
                </button>
            </div>
        </template>
    </article>
</template>

<style scoped src="./TradingPointCard.css"></style>

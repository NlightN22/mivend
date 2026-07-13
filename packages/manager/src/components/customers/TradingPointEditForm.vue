<script setup lang="ts">
import { reactive, ref } from 'vue';
import { MvInput, MvButton, MvNotice } from '@mivend/ui-kit';
import { updateTradingPointDetails, type TradingPointInfo } from '../../api/customers';

const props = defineProps<{ tradingPoint: TradingPointInfo }>();
const emit = defineEmits<{ submitted: []; cancel: [] }>();

const submitting = ref(false);
const error = ref('');

const form = reactive({
    name: props.tradingPoint.name,
    address: props.tradingPoint.address,
    workingHours: props.tradingPoint.workingHours ?? '',
    deliveryComment: props.tradingPoint.deliveryComment ?? '',
    contacts: props.tradingPoint.contacts.map(c => ({ ...c })),
});

function addContact(): void {
    form.contacts.push({ name: '', phone: '', email: '', isPrimary: false });
}

function removeContact(index: number): void {
    form.contacts.splice(index, 1);
}

async function submit(): Promise<void> {
    error.value = '';
    if (!form.name.trim() || !form.address.trim()) {
        error.value = 'Name and address are required';
        return;
    }
    if (form.contacts.some(c => !c.name.trim())) {
        error.value = 'Every contact needs a name (remove the row instead of leaving it blank)';
        return;
    }
    submitting.value = true;
    try {
        await updateTradingPointDetails(props.tradingPoint.id, {
            name: form.name.trim(),
            address: form.address.trim(),
            workingHours: form.workingHours.trim() || null,
            deliveryComment: form.deliveryComment.trim() || null,
            contacts: form.contacts.map(c => ({
                name: c.name.trim(),
                phone: c.phone?.trim() || null,
                email: c.email?.trim() || null,
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
            <label>
                Name
                <MvInput size="sm" :model-value="form.name" @update:model-value="form.name = $event" />
            </label>
            <label>
                Address
                <MvInput size="sm" :model-value="form.address" @update:model-value="form.address = $event" />
            </label>
            <label>
                Working hours
                <MvInput size="sm" :model-value="form.workingHours" @update:model-value="form.workingHours = $event" />
            </label>
        </div>

        <label class="tp-edit-form__comment">
            Delivery comment
            <textarea v-model="form.deliveryComment" rows="2" />
        </label>

        <div class="tp-edit-form__contacts">
            <div class="tp-edit-form__contacts-head">
                <span>Contacts</span>
                <button type="button" class="tp-edit-form__add" @click="addContact">+ Add contact</button>
            </div>
            <div v-for="(contact, index) in form.contacts" :key="index" class="tp-edit-form__contact-row">
                <MvInput size="sm" placeholder="Name" :model-value="contact.name" @update:model-value="contact.name = $event" />
                <MvInput size="sm" placeholder="Phone" :model-value="contact.phone ?? ''" @update:model-value="contact.phone = $event" />
                <MvInput size="sm" placeholder="Email" :model-value="contact.email ?? ''" @update:model-value="contact.email = $event" />
                <button type="button" class="tp-edit-form__remove" @click="removeContact(index)">Remove</button>
            </div>
            <p v-if="!form.contacts.length" class="tp-edit-form__empty">No contacts</p>
        </div>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <div class="tp-edit-form__actions">
            <MvButton :loading="submitting" @click="submit">Save changes</MvButton>
            <button type="button" class="tp-edit-form__cancel" @click="emit('cancel')">Cancel</button>
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
}

.tp-edit-form__grid label,
.tp-edit-form__comment {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary, #6b7280);
}

.tp-edit-form__comment textarea {
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
    resize: vertical;
}

.tp-edit-form__contacts {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.tp-edit-form__contacts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary, #6b7280);
}

.tp-edit-form__add {
    background: none;
    border: none;
    color: var(--el-color-primary-dark-2, #008a70);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

.tp-edit-form__contact-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto;
    gap: 8px;
    align-items: center;
}

.tp-edit-form__remove {
    background: none;
    border: none;
    color: var(--el-color-danger, #dc2626);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}

.tp-edit-form__empty {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin: 0;
}

.tp-edit-form__actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.tp-edit-form__cancel {
    background: none;
    border: none;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    cursor: pointer;
}
</style>

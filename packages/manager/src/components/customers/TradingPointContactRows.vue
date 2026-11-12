<script setup lang="ts">
import { MvEmailInput, MvFormField, MvNameInput, MvPhoneInput } from '@mivend/ui-kit';
import { CONTACT_ERROR_TEXT, type useContactRows } from '../../composables/useContactRows';

defineProps<{ contacts: ReturnType<typeof useContactRows> }>();
</script>

<template>
    <div class="tp-contacts">
        <div class="tp-contacts__head">
            <span>Contacts</span>
            <button type="button" class="tp-contacts__add" @click="contacts.add()">
                + Add contact
            </button>
        </div>
        <div v-for="(row, index) in contacts.rows" :key="index" class="tp-contacts__row">
            <MvFormField
                :error="
                    row.touched.name && contacts.errors.value[index].name
                        ? CONTACT_ERROR_TEXT.name
                        : undefined
                "
            >
                <MvNameInput
                    v-model="row.name"
                    size="sm"
                    placeholder="Name"
                    :error="row.touched.name && !!contacts.errors.value[index].name"
                    @blur="row.touched.name = true"
                />
            </MvFormField>
            <MvFormField
                :error="
                    row.touched.phone && contacts.errors.value[index].phone
                        ? CONTACT_ERROR_TEXT.phone
                        : undefined
                "
            >
                <MvPhoneInput
                    v-model="row.phone"
                    size="sm"
                    placeholder="Phone"
                    :error="row.touched.phone && !!contacts.errors.value[index].phone"
                    @blur="row.touched.phone = true"
                />
            </MvFormField>
            <MvFormField
                :error="
                    row.touched.email && contacts.errors.value[index].email
                        ? CONTACT_ERROR_TEXT.email
                        : undefined
                "
            >
                <MvEmailInput
                    v-model="row.email"
                    size="sm"
                    placeholder="Email"
                    :error="row.touched.email && !!contacts.errors.value[index].email"
                    @blur="row.touched.email = true"
                />
            </MvFormField>
            <button type="button" class="tp-contacts__remove" @click="contacts.remove(index)">
                Remove
            </button>
        </div>
        <p v-if="!contacts.rows.length" class="tp-contacts__empty">No contacts</p>
    </div>
</template>

<style scoped>
.tp-contacts {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.tp-contacts__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary);
}

.tp-contacts__add {
    background: none;
    border: none;
    color: var(--el-color-primary-dark-2);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

.tp-contacts__row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto;
    gap: 8px;
    align-items: start;
}

.tp-contacts__remove {
    background: none;
    border: none;
    color: var(--el-color-danger);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    padding-top: 8px;
}

.tp-contacts__empty {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin: 0;
}
</style>

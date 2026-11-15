<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvButton, MvEmailInput, MvFormField, MvNameInput, MvPhoneInput } from '@mivend/ui-kit';
import type { useContactRows } from '../../composables/useContactRows';

defineProps<{ contacts: ReturnType<typeof useContactRows> }>();
const { t } = useI18n();
</script>

<template>
    <div class="tp-contacts">
        <div class="tp-contacts__head">
            <span>{{ t('customers.tradingPoints.contacts.title') }}</span>
            <MvButton variant="ghost" size="sm" @click="contacts.add()">
                {{ t('customers.tradingPoints.contacts.add') }}
            </MvButton>
        </div>
        <div v-for="(row, index) in contacts.rows" :key="index" class="tp-contacts__row">
            <MvFormField
                class="tp-contacts__name"
                :error="
                    row.touched.name && contacts.errors.value[index].name
                        ? t('customers.tradingPoints.contacts.nameError')
                        : undefined
                "
            >
                <MvNameInput
                    v-model="row.name"
                    :placeholder="t('customers.tradingPoints.contacts.fullName')"
                    :error="row.touched.name && !!contacts.errors.value[index].name"
                    @blur="row.touched.name = true"
                />
            </MvFormField>
            <MvFormField
                :error="
                    row.touched.phone && contacts.errors.value[index].phone
                        ? t('customers.tradingPoints.contacts.phoneError')
                        : undefined
                "
            >
                <MvPhoneInput
                    v-model="row.phone"
                    :error="row.touched.phone && !!contacts.errors.value[index].phone"
                    @blur="row.touched.phone = true"
                />
            </MvFormField>
            <MvFormField
                :error="
                    row.touched.email && contacts.errors.value[index].email
                        ? t('customers.tradingPoints.contacts.emailError')
                        : undefined
                "
            >
                <MvEmailInput
                    v-model="row.email"
                    :placeholder="t('customers.tradingPoints.contacts.email')"
                    :error="row.touched.email && !!contacts.errors.value[index].email"
                    @blur="row.touched.email = true"
                />
            </MvFormField>
            <MvButton
                class="tp-contacts__remove"
                variant="danger"
                size="sm"
                @click="contacts.remove(index)"
            >
                {{ t('customers.tradingPoints.contacts.remove') }}
            </MvButton>
        </div>
        <p v-if="!contacts.rows.length" class="tp-contacts__empty">
            {{ t('customers.tradingPoints.contacts.empty') }}
        </p>
    </div>
</template>

<style scoped>
.tp-contacts {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.tp-contacts__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
}

.tp-contacts__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--app-radius-md, 12px);
}

.tp-contacts__name,
.tp-contacts__remove {
    grid-column: 1 / -1;
}

.tp-contacts__remove {
    justify-self: start;
}

.tp-contacts__empty {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin: 0;
}

@media (max-width: 640px) {
    .tp-contacts__row {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>

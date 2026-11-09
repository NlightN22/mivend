<script setup lang="ts">
import { ref } from 'vue';
import { MvPanel } from '@mivend/ui-kit';
import DiscountsList from '../../components/discounts/DiscountsList.vue';
import DiscountGrantForm from '../../components/discounts/DiscountGrantForm.vue';
import type { DiscountRow } from '../../components/discounts/discountsRows';

const list = ref<InstanceType<typeof DiscountsList> | null>(null);
const showForm = ref(false);
const renewFrom = ref<DiscountRow | null>(null);

function openForm(row: DiscountRow | null): void {
    renewFrom.value = row;
    showForm.value = true;
}

function handleSubmitted(): void {
    showForm.value = false;
    list.value?.reload();
}
</script>

<template>
    <div class="discounts-page">
        <div class="discounts-page__header">
            <div class="discounts-page__breadcrumb">Workspace / Discounts</div>
            <h1 class="discounts-page__title">Discounts</h1>
        </div>

        <MvPanel v-if="showForm" :title="renewFrom ? 'Renew discount grant' : 'New discount grant'">
            <DiscountGrantForm
                :renew-from="renewFrom"
                @submitted="handleSubmitted"
                @cancel="showForm = false"
            />
        </MvPanel>

        <DiscountsList ref="list" @new="openForm(null)" @renew="openForm($event)" />
    </div>
</template>

<style scoped>
.discounts-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.discounts-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.discounts-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .discounts-page__breadcrumb {
        display: none;
    }

    .discounts-page__title {
        font-size: 22px;
    }
}
</style>

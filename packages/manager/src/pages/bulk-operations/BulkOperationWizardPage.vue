<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { MvNotice, MvWizard } from '@mivend/ui-kit';
import BulkReviewStep from '../../components/bulk-operations/BulkReviewStep.vue';
import BulkRunStep from '../../components/bulk-operations/BulkRunStep.vue';
import { fetchBulkCatalog } from '../../api/bulkOperations';
import { operationUi } from '../../components/bulk-operations/operationUi';
import { WIZARD_STEPS, useBulkWizard } from '../../composables/useBulkWizard';

// One shell for every operation: the operation brings only its select and parameters steps.
const type = String(useRoute().params.operation);
const ui = operationUi(type);
const wizard = ui ? useBulkWizard(type, ui) : null;
const batch = computed(() => wizard?.flow.batch.value ?? null);
const running = computed(() => wizard?.step.value === 'run');

const title = ref('Bulk operation');
onMounted(() => {
    void wizard?.init();
    void fetchBulkCatalog()
        .then(list => (title.value = list.find(o => o.type === type)?.title ?? title.value))
        .catch(() => undefined);
});
</script>

<template>
    <div class="bulk-wizard-page">
        <div>
            <RouterLink class="bulk-wizard-page__back" to="/bulk-operations"
                >Bulk operations</RouterLink
            >
            <h1 class="bulk-wizard-page__title">{{ title }}</h1>
        </div>

        <MvNotice v-if="!ui || !wizard" variant="warning">
            This operation is not available in the portal.
        </MvNotice>
        <MvWizard
            v-else
            :steps="WIZARD_STEPS"
            :model-value="wizard.step.value"
            :next-disabled-reason="wizard.nextDisabledReason.value"
            :next-label="wizard.nextLabel.value"
            :busy="wizard.flow.busy.value && !running"
            :hide-back="running"
            :hide-next="running"
            @update:model-value="wizard.goTo"
        >
            <MvNotice v-if="wizard.flow.error.value && !running" variant="error">
                {{ wizard.flow.error.value }}
            </MvNotice>
            <component
                :is="ui.selectStep"
                v-show="wizard.step.value === 'select'"
                :selected-ids="wizard.selected.value"
                @update:selected-ids="wizard.selected.value = $event"
            />
            <component
                :is="ui.parametersStep"
                v-if="wizard.step.value === 'parameters'"
                v-model="wizard.parameters.value"
            />
            <BulkReviewStep
                v-if="wizard.step.value === 'review' && batch"
                :batch="batch"
                @counted="wizard.willChange.value = $event"
            />
            <BulkRunStep
                v-if="running && batch"
                :batch="batch"
                :busy="wizard.flow.busy.value"
                :error="wizard.flow.error.value"
                @undo="wizard.undo"
            />
        </MvWizard>
    </div>
</template>

<style scoped>
.bulk-wizard-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
}

.bulk-wizard-page__back {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    text-decoration: none;
}

.bulk-wizard-page__title {
    margin: 6px 0 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .bulk-wizard-page__title {
        font-size: 22px;
    }
}
</style>

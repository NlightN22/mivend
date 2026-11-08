import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { WizardStep } from '@mivend/ui-kit';
import type { OperationUi } from '../components/bulk-operations/operationUi';
import { useBulkBatchFlow, type BulkBatchFlow } from './useBulkBatchFlow';

export const WIZARD_STEPS: WizardStep[] = [
    { key: 'select', label: 'Select records' },
    { key: 'parameters', label: 'Parameters' },
    { key: 'review', label: 'Review' },
    { key: 'run', label: 'Run and result' },
];

const NEXT_LABEL: Record<string, string> = {
    select: 'Next',
    parameters: 'Review',
    review: 'Run batch',
};

export interface BulkWizard {
    step: Ref<string>;
    selected: Ref<Set<string>>;
    parameters: Ref<Record<string, unknown>>;
    flow: BulkBatchFlow;
    willChange: Ref<number | null>;
    nextDisabledReason: ComputedRef<string>;
    nextLabel: ComputedRef<string>;
    goTo: (key: string) => Promise<void>;
    undo: () => Promise<void>;
    init: () => Promise<void>;
}

// Select -> parameters -> review -> run. The draft batch is minted by the review step and run once.
export function useBulkWizard(type: string, ui: OperationUi): BulkWizard {
    const route = useRoute();
    const router = useRouter();
    const step = ref('select');
    const selected = ref<Set<string>>(new Set());
    const parameters = ref<Record<string, unknown>>({ ...ui.defaultParameters });
    const willChange = ref<number | null>(null);
    const flow = useBulkBatchFlow(type);

    const nextDisabledReason = computed(() => {
        if (step.value === 'select' && selected.value.size === 0)
            return 'Select at least one record';
        if (step.value === 'review' && willChange.value === 0) return 'Nothing would change';
        return '';
    });

    function showBatch(): void {
        const uuid = flow.batch.value?.uuid;
        if (uuid) void router.replace({ query: { ...route.query, batch: uuid } });
    }

    async function goTo(key: string): Promise<void> {
        if (key === 'review') {
            willChange.value = null;
            if (!(await flow.preview(parameters.value, [...selected.value]))) return;
            showBatch();
        } else if (key === 'run') {
            if (flow.batch.value?.status === 'draft' && !(await flow.run())) return;
        }
        step.value = key;
    }

    async function undo(): Promise<void> {
        if (await flow.undo()) showBatch();
    }

    async function init(): Promise<void> {
        const uuid = route.query.batch;
        if (typeof uuid !== 'string' || !(await flow.open(uuid))) return;
        const batch = flow.batch.value;
        if (batch && batch.operationType !== type) {
            void router.replace({
                path: `/bulk-operations/${batch.operationType}`,
                query: { batch: uuid },
            });
            return;
        }
        step.value = batch?.status === 'draft' ? 'review' : 'run';
    }

    return {
        step,
        selected,
        parameters,
        flow,
        willChange,
        nextDisabledReason,
        nextLabel: computed(() => NEXT_LABEL[step.value] ?? 'Next'),
        goTo,
        undo,
        init,
    };
}

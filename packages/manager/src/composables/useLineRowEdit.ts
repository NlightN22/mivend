import { computed, ref } from 'vue';
import { changeOrderLineQuantity, removeOrderLine } from '../api/orderLineEdit';
import { requestPriceAdjustment } from '../api/priceAdjustment';
import {
    initialDraft,
    planLineEdit,
    type LineCapabilities,
    type LineDraft,
    type LineOriginal,
} from '../utils/lineEditPlan';

export type LineEditState = 'idle' | 'editing' | 'saving';

export interface LineRowEditDeps {
    orderId: () => string;
    lineId: () => string;
    original: () => LineOriginal;
    caps: () => LineCapabilities;
    // Runs the change under the table's busy/error handling and reloads once; resolves true on success.
    apply: (action: () => Promise<void>) => Promise<boolean>;
}

export function useLineRowEdit(deps: LineRowEditDeps) {
    const state = ref<LineEditState>('idle');
    const draft = ref<LineDraft>(initialDraft(deps.original()));
    const error = ref('');
    const sentForApproval = ref(false);

    const editing = computed(() => state.value !== 'idle');

    function start(): void {
        draft.value = initialDraft(deps.original());
        error.value = '';
        sentForApproval.value = false;
        state.value = 'editing';
    }

    function cancel(): void {
        if (state.value === 'saving') return;
        state.value = 'idle';
        error.value = '';
    }

    async function commit(): Promise<void> {
        if (state.value !== 'editing') return;
        const plan = planLineEdit(deps.original(), draft.value, deps.caps());
        if (plan.error) {
            error.value = plan.error;
            return;
        }
        if (!plan.ops.length) {
            state.value = 'idle';
            return;
        }
        state.value = 'saving';
        error.value = '';
        const ok = await deps.apply(async () => {
            for (const op of plan.ops) {
                if (op.kind === 'quantity') {
                    await changeOrderLineQuantity(deps.orderId(), deps.lineId(), op.quantity);
                } else if (op.kind === 'remove') {
                    await removeOrderLine(deps.orderId(), deps.lineId());
                } else {
                    const outcome = await requestPriceAdjustment(
                        deps.orderId(),
                        deps.lineId(),
                        op.requestedPrice,
                        op.justification,
                    );
                    sentForApproval.value = outcome.decision === 'requires-approval';
                }
            }
        });
        state.value = ok ? 'idle' : 'editing';
    }

    return { state, editing, draft, error, sentForApproval, start, cancel, commit };
}

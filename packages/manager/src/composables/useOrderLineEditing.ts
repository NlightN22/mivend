import { computed, ref } from 'vue';
import type { OrderDetailLine } from '../api/orderDetail';
import { capHint, percentFromPrice, priceFromPercent } from '../utils/lineValueModel';
import { useLineRowEdit } from './useLineRowEdit';

export interface OrderLineEditingDeps {
    orderId: () => string;
    lines: () => OrderDetailLine[];
    caps: () => { canEditQuantity: boolean; canEditPrice: boolean; canRemove: boolean };
    apply: (action: () => Promise<void>) => Promise<boolean>;
    reference: (line: OrderDetailLine) => number;
    limit: (lineId: string) => number | null;
}

// One row is edited at a time; the kit's editingId says which, this holds the draft of that row.
export function useOrderLineEditing(deps: OrderLineEditingDeps) {
    const editingId = ref<string | null>(null);
    const lastId = ref<string | null>(null);
    const edit = useLineRowEdit({
        orderId: deps.orderId,
        lineId: () => editingId.value ?? '',
        original: () => {
            const line = deps.lines().find(l => l.id === editingId.value);
            return {
                quantity: line?.quantity ?? 0,
                unitPriceMinor: line?.discountedUnitPriceWithTax ?? 0,
            };
        },
        caps: deps.caps,
        apply: deps.apply,
    });
    const discountText = ref('');
    const currentLine = (): OrderDetailLine | undefined =>
        deps.lines().find(l => l.id === editingId.value);
    const referenceMinor = (): number => {
        const line = currentLine();
        return line ? deps.reference(line) : 0;
    };
    const hint = computed(() =>
        capHint(
            discountText.value,
            currentLine()?.discountedUnitPriceWithTax ?? 0,
            Math.round(Number(edit.draft.value.unitPrice) * 100),
            editingId.value ? deps.limit(editingId.value) : null,
        ),
    );

    function setPrice(value: string): void {
        edit.draft.value.unitPrice = value;
        discountText.value = percentFromPrice(referenceMinor(), value) ?? '';
    }

    function setPercent(value: string): void {
        discountText.value = value;
        const price = priceFromPercent(referenceMinor(), value);
        if (price !== null) edit.draft.value.unitPrice = price;
    }

    const savingId = computed(() => (edit.state.value === 'saving' ? editingId.value : null));
    const errors = computed<Record<string, string>>(() =>
        editingId.value && edit.error.value ? { [editingId.value]: edit.error.value } : {},
    );

    function start(id: string): void {
        if (edit.state.value === 'saving') return;
        editingId.value = id;
        lastId.value = id;
        edit.start();
        discountText.value = percentFromPrice(referenceMinor(), edit.draft.value.unitPrice) ?? '';
    }

    async function commit(): Promise<void> {
        await edit.commit();
        if (edit.state.value === 'idle') editingId.value = null;
    }

    function cancel(): void {
        edit.cancel();
        if (edit.state.value === 'idle') editingId.value = null;
    }

    return {
        editingId,
        savingId,
        errors,
        edit,
        lastId,
        discountText,
        hint,
        setPrice,
        setPercent,
        start,
        commit,
        cancel,
    };
}

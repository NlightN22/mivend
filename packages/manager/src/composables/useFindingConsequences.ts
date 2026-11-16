import { computed, ComputedRef, onMounted, ref, type Ref } from 'vue';
import { fetchOrderCheckRules, type OrderCheckRules } from '../api/orderCheckPolicies';
import { consequencesByFinding, type FindingConsequence } from '../utils/findingConsequence';
import type { OrderCheckFinding } from '../utils/orderCheckMessages';

export interface UseFindingConsequences {
    consequences: ComputedRef<Map<string, FindingConsequence>>;
}

export function useFindingConsequences(
    findings: Ref<OrderCheckFinding[]>,
    enabled: () => boolean,
    branchId: () => string | null,
): UseFindingConsequences {
    const rules = ref<OrderCheckRules | null>(null);

    onMounted(async () => {
        if (!enabled()) return;
        try {
            rules.value = await fetchOrderCheckRules();
        } catch {
            rules.value = null;
        }
    });

    const consequences = computed(() =>
        rules.value
            ? consequencesByFinding(
                  findings.value,
                  rules.value.definitions,
                  rules.value.policies,
                  branchId(),
              )
            : new Map<string, FindingConsequence>(),
    );

    return { consequences };
}

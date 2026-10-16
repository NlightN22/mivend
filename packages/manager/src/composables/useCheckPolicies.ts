import { ref } from 'vue';
import {
    fetchOrderCheckDefinitions,
    fetchOrderCheckPolicies,
    updateCheckPolicy,
} from '../api/checkPolicies';
import { buildPolicyRows, type PolicyRow } from '../utils/checkPolicyRows';

export function useCheckPolicies() {
    const rows = ref<PolicyRow[]>([]);
    const loading = ref(true);
    const savingKey = ref<string | null>(null);
    const error = ref('');

    async function load(): Promise<void> {
        loading.value = true;
        error.value = '';
        try {
            const [defs, policies] = await Promise.all([
                fetchOrderCheckDefinitions(),
                fetchOrderCheckPolicies(),
            ]);
            rows.value = buildPolicyRows(defs, policies);
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not load controls and policies';
        } finally {
            loading.value = false;
        }
    }

    async function save(row: PolicyRow): Promise<void> {
        savingKey.value = row.key;
        error.value = '';
        try {
            const updated = await updateCheckPolicy({
                checkCode: row.checkCode,
                stage: row.stage,
                consequence: row.consequence,
                recipient: row.recipient.trim() || null,
                enabled: row.enabled,
            });
            row.recipient = updated.recipient ?? '';
            row.saved = {
                consequence: updated.consequence,
                recipient: row.recipient,
                enabled: updated.enabled,
            };
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not save the policy';
        } finally {
            savingKey.value = null;
        }
    }

    return { rows, loading, savingKey, error, load, save };
}

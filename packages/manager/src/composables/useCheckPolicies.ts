import { ref } from 'vue';
import {
    fetchCheckDefinitions,
    fetchCheckPolicies,
    resetCheckPolicyOverride,
    updateCheckPolicy,
} from '../api/checkPolicies';
import { buildPolicyRows, type PolicyRow } from '../utils/checkPolicyRows';

export function useCheckPolicies() {
    const rows = ref<PolicyRow[]>([]);
    const branchId = ref<string | null>(null);
    const loading = ref(true);
    const savingKey = ref<string | null>(null);
    const error = ref('');

    async function load(): Promise<void> {
        loading.value = true;
        error.value = '';
        try {
            const [defs, policies] = await Promise.all([
                fetchCheckDefinitions(),
                fetchCheckPolicies(),
            ]);
            rows.value = buildPolicyRows(defs, policies, branchId.value);
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not load controls and policies';
        } finally {
            loading.value = false;
        }
    }

    async function selectBranch(id: string | null): Promise<void> {
        branchId.value = id;
        await load();
    }

    async function save(row: PolicyRow): Promise<void> {
        savingKey.value = row.key;
        error.value = '';
        try {
            const updated = await updateCheckPolicy({
                checkCode: row.checkCode,
                stage: row.stage,
                branchId: row.branchId,
                consequence: row.consequence,
                recipient: row.recipient.trim() || null,
                enabled: row.enabled,
            });
            row.recipient = updated.recipient ?? '';
            row.inherited = false;
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

    async function reset(row: PolicyRow): Promise<void> {
        if (!row.branchId) return;
        savingKey.value = row.key;
        error.value = '';
        try {
            await resetCheckPolicyOverride(row.checkCode, row.stage, row.branchId);
            await load();
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not reset the override';
        } finally {
            savingKey.value = null;
        }
    }

    return { rows, branchId, loading, savingKey, error, load, selectBranch, save, reset };
}

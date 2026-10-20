import { computed, ref } from 'vue';
import { fetchBranchOptions, type BranchOption } from '../api/branchSettings';
import {
    clearDepartmentBranch,
    fetchDepartmentBranchOverview,
    setDepartmentBranch,
    type DepartmentBranchNode,
} from '../api/departmentBranch';
import { flattenDepartmentTree, isUnmappedWithPeople } from '../utils/departmentTree';

export function useDepartmentBranch() {
    const nodes = ref<DepartmentBranchNode[]>([]);
    const branches = ref<BranchOption[]>([]);
    const loading = ref(true);
    const savingId = ref<string | null>(null);
    const error = ref('');

    const rows = computed(() => flattenDepartmentTree(nodes.value));
    const unmappedWithPeopleCount = computed(() => nodes.value.filter(isUnmappedWithPeople).length);
    const branchName = computed(() => new Map(branches.value.map(b => [b.id, b.name])));

    async function load(): Promise<void> {
        loading.value = true;
        error.value = '';
        try {
            [nodes.value, branches.value] = await Promise.all([
                fetchDepartmentBranchOverview(),
                fetchBranchOptions(),
            ]);
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not load departments';
        } finally {
            loading.value = false;
        }
    }

    // Empty branchId clears the node's own mapping; descendants then inherit from further up.
    async function assign(departmentErpId: string, branchId: string): Promise<void> {
        savingId.value = departmentErpId;
        error.value = '';
        try {
            if (branchId) await setDepartmentBranch(departmentErpId, branchId);
            else await clearDepartmentBranch(departmentErpId);
            nodes.value = await fetchDepartmentBranchOverview();
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not save the mapping';
        } finally {
            savingId.value = null;
        }
    }

    return {
        rows,
        branches,
        branchName,
        loading,
        savingId,
        error,
        unmappedWithPeopleCount,
        load,
        assign,
    };
}

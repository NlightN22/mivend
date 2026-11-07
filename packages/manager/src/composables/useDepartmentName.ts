import { onMounted, ref, type Ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { fetchDepartments } from '../api/team';

// The badge next to the page title; the page never waits for it.
export function useDepartmentName(): Ref<string | null> {
    const authStore = useAuthStore();
    const name = ref<string | null>(null);

    onMounted(async () => {
        try {
            const departmentId = authStore.administrator?.customFields.departmentId;
            const departments = await fetchDepartments();
            // The administrator stores the ERP id, not the Department row id.
            name.value = departments.find(d => d.erpId === departmentId)?.name ?? null;
        } catch (e) {
            console.warn('[orders] could not load department name:', e);
        }
    });

    return name;
}

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { acceptLegal, fetchLegalStatus, type LegalStatus } from '../api/legal';

export const useLegalStore = defineStore('legal', () => {
    const statuses = ref<LegalStatus[]>([]);
    const loadedFor = ref<string | null>(null);

    const pending = computed(() => statuses.value.filter(s => s.pending));
    // An optional document alone never interrupts the customer; it stays available in the profile.
    const blocking = computed(() => pending.value.some(s => s.required));
    const marketing = computed(() => statuses.value.find(s => s.kind === 'marketing-consent'));

    async function load(customerId: string): Promise<void> {
        statuses.value = await fetchLegalStatus();
        loadedFor.value = customerId;
    }

    async function accept(
        input: { kind: string; version: number; accepted: boolean }[],
        locale: string,
    ): Promise<void> {
        statuses.value = await acceptLegal(input, locale);
    }

    function reset(): void {
        statuses.value = [];
        loadedFor.value = null;
    }

    return { statuses, loadedFor, pending, blocking, marketing, load, accept, reset };
});

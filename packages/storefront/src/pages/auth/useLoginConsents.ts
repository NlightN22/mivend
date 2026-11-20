import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchLegalOffer, type LegalStatus } from '../../api/legal';
import { useAuthStore } from '../../stores/auth';
import { useLegalStore } from '../../stores/legal';
import { acceptanceRemembered, rememberAcceptance } from './legalMemory';

interface LoginConsents {
    checks: Ref<LegalStatus[]>;
    checked: Record<string, boolean>;
    visible: ComputedRef<boolean>;
    email: Ref<string>;
    load: () => Promise<void>;
    settle: (customerId: string) => Promise<boolean>;
}

// The consents sit on the sign-in form and are saved by the same click. A browser that already
// saved them for an address hides the boxes; the server still decides whether they are needed.
export function useLoginConsents(): LoginConsents {
    const { locale } = useI18n();
    const legal = useLegalStore();
    const authStore = useAuthStore();
    const requiredVersions = ref<Record<string, number>>({});
    const checks = ref<LegalStatus[]>([]);
    const checked = reactive<Record<string, boolean>>({});
    const forced = ref(false);
    const email = ref('');

    const visible = computed(
        () =>
            checks.value.length > 0 &&
            (forced.value ||
                !acceptanceRemembered(
                    email.value,
                    checks.value
                        .filter(c => c.required)
                        .map(c => ({
                            kind: c.kind,
                            requiredVersion: requiredVersions.value[c.kind] ?? c.version,
                        })),
                )),
    );

    async function load(): Promise<void> {
        try {
            const offers = await fetchLegalOffer();
            requiredVersions.value = Object.fromEntries(
                offers.map(o => [o.kind, o.requiredVersion]),
            );
            checks.value = offers.map(o => ({
                kind: o.kind,
                version: o.version,
                required: o.required,
                accepted: false,
                pending: true,
            }));
        } catch {
            // Kept as is: a sign-in that needs a missing box is refused and then shows what is needed.
        }
    }

    function remember(): void {
        rememberAcceptance(
            [email.value, authStore.customer?.emailAddress ?? ''],
            legal.statuses.filter(st => st.required),
        );
    }

    // Shows exactly what the server still needs, with the boxes cleared so nothing unseen counts as ticked.
    function showPending(pending: LegalStatus[]): void {
        checks.value = pending.map(s => ({ ...s }));
        for (const kind of Object.keys(checked)) delete checked[kind];
        forced.value = true;
    }

    // Saves the ticked documents for the signed-in customer; false means the sign-in must be refused.
    async function settle(customerId: string): Promise<boolean> {
        try {
            await legal.load(customerId);
        } catch {
            return true;
        }
        const pending = legal.pending;
        const seen = new Map(checks.value.map(c => [c.kind, c.version]));
        if (pending.some(s => s.required && seen.get(s.kind) !== s.version)) {
            showPending(pending);
            return false;
        }
        if (pending.some(s => s.required && !checked[s.kind])) {
            forced.value = true;
            return false;
        }
        const asked = pending.filter(
            s => seen.get(s.kind) === s.version && (s.required || visible.value),
        );
        if (asked.length > 0) {
            await legal.accept(
                asked.map(s => ({ kind: s.kind, version: s.version, accepted: !!checked[s.kind] })),
                locale.value,
            );
        }
        remember();
        return true;
    }

    return { checks, checked, visible, email, load, settle };
}

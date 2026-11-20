import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchLegalOffer, type LegalStatus } from '../../api/legal';
import { useLegalStore } from '../../stores/legal';

const STORAGE_KEY = 'mv.legalAccepted';

type Remembered = Record<string, string>;

interface LoginConsents {
    checks: Ref<LegalStatus[]>;
    checked: Record<string, boolean>;
    visible: ComputedRef<boolean>;
    email: Ref<string>;
    load: () => Promise<void>;
    settle: (customerId: string) => Promise<boolean>;
}

function readRemembered(): Remembered {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Remembered;
    } catch {
        return {};
    }
}

function writeRemembered(map: Remembered): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Storage can be blocked; the boxes are simply shown again next time.
    }
}

// A fingerprint keeps addresses out of a possibly shared browser's storage; a collision only hides the boxes.
function fingerprint(email: string): string {
    let hash = 0x811c9dc5;
    for (const char of email.trim().toLowerCase()) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    }
    return hash.toString(16);
}

// The consents sit on the sign-in form and are saved by the same click. A browser that already
// saved them for an address hides the boxes; the server still decides whether they are needed.
export function useLoginConsents(): LoginConsents {
    const { locale } = useI18n();
    const legal = useLegalStore();
    const checks = ref<LegalStatus[]>([]);
    const checked = reactive<Record<string, boolean>>({});
    const forced = ref(false);
    const email = ref('');

    const signature = computed(() =>
        checks.value
            .filter(c => c.required)
            .map(c => `${c.kind}:${c.version}`)
            .join(','),
    );
    const visible = computed(
        () =>
            checks.value.length > 0 &&
            (forced.value || readRemembered()[fingerprint(email.value)] !== signature.value),
    );

    async function load(): Promise<void> {
        try {
            checks.value = (await fetchLegalOffer()).map(o => ({
                ...o,
                accepted: false,
                pending: true,
            }));
        } catch {
            // Kept as is: a sign-in that needs a missing box is refused and then shows what is needed.
        }
    }

    function remember(): void {
        writeRemembered({ ...readRemembered(), [fingerprint(email.value)]: signature.value });
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

import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchLegalDocument, type LegalStatus } from '../../api/legal';
import { useLegalStore } from '../../stores/legal';

const KINDS = ['agreement', 'personal-data-consent', 'marketing-consent'];
const REQUIRED = ['agreement', 'personal-data-consent'];
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
            (forced.value ||
                readRemembered()[email.value.trim().toLowerCase()] !== signature.value),
    );

    async function load(): Promise<void> {
        const docs = await Promise.all(
            KINDS.map(kind => fetchLegalDocument(kind, locale.value).catch(() => null)),
        );
        checks.value = docs.flatMap((d, i) =>
            d
                ? [
                      {
                          kind: KINDS[i],
                          version: d.version,
                          required: REQUIRED.includes(KINDS[i]),
                          accepted: false,
                          pending: true,
                      },
                  ]
                : [],
        );
    }

    function remember(): void {
        writeRemembered({
            ...readRemembered(),
            [email.value.trim().toLowerCase()]: signature.value,
        });
    }

    // Saves the ticked documents for the signed-in customer; false means a required one is missing.
    async function settle(customerId: string): Promise<boolean> {
        try {
            await legal.load(customerId);
        } catch {
            return true;
        }
        if (!legal.blocking) {
            remember();
            return true;
        }
        const pending = legal.pending;
        if (!pending.filter(s => s.required).every(s => checked[s.kind])) {
            forced.value = true;
            return false;
        }
        await legal.accept(
            pending.map(s => ({ kind: s.kind, version: s.version, accepted: !!checked[s.kind] })),
            locale.value,
        );
        remember();
        return true;
    }

    return { checks, checked, visible, email, load, settle };
}

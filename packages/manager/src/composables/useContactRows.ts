import { computed, reactive, type ComputedRef } from 'vue';
import { contactRowErrors, type ContactRowValues } from '@mivend/ui-kit';

export interface ContactRow extends ContactRowValues {
    isPrimary: boolean;
    original: ContactRowValues | null;
    touched: Record<keyof ContactRowValues, boolean>;
}

export const CONTACT_ERROR_TEXT: Record<keyof ContactRowValues, string> = {
    name: 'Enter the first and last name',
    phone: 'Enter a full phone number',
    email: 'Enter a valid e-mail address',
};

interface SourceContact {
    name: string;
    phone?: string | null;
    email?: string | null;
    isPrimary: boolean;
}

function untouched(): ContactRow['touched'] {
    return { name: false, phone: false, email: false };
}

export function useContactRows(source: SourceContact[]): {
    rows: ContactRow[];
    errors: ComputedRef<Array<Partial<Record<keyof ContactRowValues, true>>>>;
    add: () => void;
    remove: (index: number) => void;
    touchAll: () => void;
    valid: ComputedRef<boolean>;
} {
    const rows = reactive<ContactRow[]>(
        source.map(c => {
            const values = { name: c.name, phone: c.phone ?? '', email: c.email ?? '' };
            return { ...values, isPrimary: c.isPrimary, original: values, touched: untouched() };
        }),
    );
    const errors = computed(() => rows.map(r => contactRowErrors(r, r.original ?? undefined)));
    const valid = computed(() => errors.value.every(e => Object.keys(e).length === 0));
    return {
        rows,
        errors,
        valid,
        add: () =>
            rows.push({
                name: '',
                phone: '',
                email: '',
                isPrimary: false,
                original: null,
                touched: untouched(),
            }),
        remove: index => rows.splice(index, 1),
        touchAll: () =>
            rows.forEach(r => {
                r.touched = { name: true, phone: true, email: true };
            }),
    };
}

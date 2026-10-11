import { ref, type Ref } from 'vue';
import { shopApi } from '../api/client';
import { MultiplicityEnforcedDocument } from '../api/generated/graphql';

const multiplicityEnforced = ref(false);
let loaded: Promise<void> | null = null;

// One shared fetch per session; the answer depends on the logged-in customer's branch (#219).
export function useMultiplicityEnforced(): {
    multiplicityEnforced: Ref<boolean>;
    load: () => Promise<void>;
} {
    function load(): Promise<void> {
        loaded ??= shopApi(MultiplicityEnforcedDocument)
            .then(res => {
                multiplicityEnforced.value = res.multiplicityEnforced;
            })
            .catch(() => {
                loaded = null;
            });
        return loaded;
    }
    return { multiplicityEnforced, load };
}

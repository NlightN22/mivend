import { ref, type Ref } from 'vue';
import { shopApi } from '../api/client';
import { PackagesOnlySalesDocument } from '../api/generated/graphql';

const packagesOnly = ref(false);
let loaded: Promise<void> | null = null;

// One shared fetch per session; the answer depends on the logged-in customer's branch.
export function usePackagesOnly(): { packagesOnly: Ref<boolean>; load: () => Promise<void> } {
    function load(): Promise<void> {
        loaded ??= shopApi(PackagesOnlySalesDocument)
            .then(res => {
                packagesOnly.value = res.packagesOnlySales;
            })
            .catch(() => {
                loaded = null;
            });
        return loaded;
    }
    return { packagesOnly, load };
}

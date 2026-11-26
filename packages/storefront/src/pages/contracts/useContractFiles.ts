import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import { MyContractFilesDocument, type MyContractFilesQuery } from '../../api/generated/graphql';

export type ContractFileSummary = MyContractFilesQuery['myContractFiles']['items'][number];

export function useContractFiles(): {
    files: Ref<ContractFileSummary[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    load: (skip: number, take: number) => Promise<void>;
} {
    const files = ref<ContractFileSummary[]>([]);
    const totalItems = ref(0);
    const loading = ref(false);

    async function load(skip: number, take: number): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(MyContractFilesDocument, { skip, take });
            files.value = result.myContractFiles.items;
            totalItems.value = result.myContractFiles.totalItems;
        } catch (e) {
            console.error('[useContractFiles]', e);
        } finally {
            loading.value = false;
        }
    }

    return { files, totalItems, loading, load };
}

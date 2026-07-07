import { ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import type { TradingPoint } from './TradingPointCard.vue';

export interface TradingPointAddForm {
    name: string;
    address: string;
    contactName: string;
    contactPhone: string;
    workingHours: string;
    deliveryComment: string;
}

function emptyAddForm(): TradingPointAddForm {
    return {
        name: '',
        address: '',
        contactName: '',
        contactPhone: '',
        workingHours: '',
        deliveryComment: '',
    };
}

const POINT_FIELDS = `id name address workingHours deliveryComment customerStatus customerOwned
  contacts { id name phone isPrimary }`;

function gql(
    query: string,
    variables?: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown> }> {
    return fetch('/shop-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, variables }),
    }).then(r => r.json());
}

export function useTradingPoints() {
    const authStore = useAuthStore();

    const visiblePoints = ref<TradingPoint[]>([]);
    const hiddenPoints = ref<TradingPoint[]>([]);
    const showHidden = ref(false);
    const loading = ref(true);
    const addOpen = ref(false);
    const addSaving = ref(false);
    const addForm = ref<TradingPointAddForm>(emptyAddForm());

    async function loadPoints(): Promise<void> {
        loading.value = true;
        const [vis, hid] = await Promise.all([
            gql(`{ myTradingPoints { ${POINT_FIELDS} } }`),
            gql(`{ myHiddenTradingPoints { ${POINT_FIELDS} } }`),
        ]);
        visiblePoints.value = (vis.data?.myTradingPoints as TradingPoint[]) ?? [];
        hiddenPoints.value = (hid.data?.myHiddenTradingPoints as TradingPoint[]) ?? [];
        loading.value = false;
    }

    async function handleSave(
        id: string,
        data: {
            name: string;
            address: string;
            contactName: string | null;
            contactPhone: string | null;
            workingHours: string | null;
            deliveryComment: string | null;
        },
    ): Promise<void> {
        await gql(
            `mutation($id:ID! $name:String! $address:String! $contactName:String $contactPhone:String $workingHours:String $deliveryComment:String){
      customerEditTradingPoint(id:$id name:$name address:$address contactName:$contactName contactPhone:$contactPhone workingHours:$workingHours deliveryComment:$deliveryComment){ id }
    }`,
            { id, ...data },
        );
        await loadPoints();
    }

    async function handleRemove(id: string): Promise<void> {
        await gql(`mutation($id:ID!){ customerDeleteTradingPoint(id:$id) }`, { id });
        await loadPoints();
    }

    async function handleRestore(id: string): Promise<void> {
        await gql(`mutation($id:ID!){ customerRestoreTradingPoint(id:$id){ id } }`, { id });
        await loadPoints();
    }

    async function handleSetCurrent(id: string): Promise<void> {
        await gql(`mutation($id:ID!){ setPreferredTradingPoint(tradingPointId:$id) }`, { id });
        await authStore.fetchCurrentCustomer();
    }

    function openAdd(): void {
        addForm.value = emptyAddForm();
        addOpen.value = true;
    }

    async function submitAdd(): Promise<void> {
        if (!addForm.value.name || !addForm.value.address) return;
        addSaving.value = true;
        await gql(
            `mutation($name:String! $address:String! $contactName:String $contactPhone:String $workingHours:String $deliveryComment:String){
      customerAddTradingPoint(name:$name address:$address contactName:$contactName contactPhone:$contactPhone workingHours:$workingHours deliveryComment:$deliveryComment){ id }
    }`,
            {
                name: addForm.value.name,
                address: addForm.value.address,
                contactName: addForm.value.contactName || null,
                contactPhone: addForm.value.contactPhone || null,
                workingHours: addForm.value.workingHours || null,
                deliveryComment: addForm.value.deliveryComment || null,
            },
        );
        addSaving.value = false;
        addOpen.value = false;
        await loadPoints();
    }

    return {
        visiblePoints,
        hiddenPoints,
        showHidden,
        loading,
        addOpen,
        addSaving,
        addForm,
        loadPoints,
        handleSave,
        handleRemove,
        handleRestore,
        handleSetCurrent,
        openAdd,
        submitAdd,
    };
}

import { actingCredentials, actingHeaders } from '../../api/actingToken';
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { GeoPoint } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { isTradingPointValid } from './tradingPointValidation';
import type { TradingPoint } from './TradingPointCard.vue';

export interface TradingPointAddForm {
    name: string;
    address: string;
    contactName: string;
    contactPhone: string;
    workingHours: string;
    deliveryComment: string;
    latitude: number | null;
    longitude: number | null;
}

function emptyAddForm(): TradingPointAddForm {
    return {
        name: '',
        address: '',
        contactName: '',
        contactPhone: '',
        workingHours: '',
        deliveryComment: '',
        latitude: null,
        longitude: null,
    };
}

const POINT_FIELDS = `id name address latitude longitude workingHours deliveryComment customerStatus customerOwned
  contacts { id name phone isPrimary }`;

function gql(
    query: string,
    variables?: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown> }> {
    return fetch('/shop-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...actingHeaders() },
        credentials: actingCredentials(),
        body: JSON.stringify({ query, variables }),
    }).then(r => r.json());
}

export function useTradingPoints(): {
    visiblePoints: Ref<TradingPoint[]>;
    siblingPoint: ComputedRef<GeoPoint | null>;
    hiddenPoints: Ref<TradingPoint[]>;
    showHidden: Ref<boolean>;
    loading: Ref<boolean>;
    addOpen: Ref<boolean>;
    addSaving: Ref<boolean>;
    addForm: Ref<TradingPointAddForm>;
    loadPoints: () => Promise<void>;
    handleSave: (
        id: string,
        data: {
            name: string;
            address: string;
            contactName: string | null;
            contactPhone: string | null;
            workingHours: string | null;
            deliveryComment: string | null;
            latitude: number | null;
            longitude: number | null;
        },
    ) => Promise<void>;
    handleRemove: (id: string) => Promise<void>;
    handleRestore: (id: string) => Promise<void>;
    handleSetCurrent: (id: string) => Promise<void>;
    openAdd: () => void;
    submitAdd: () => Promise<void>;
} {
    const authStore = useAuthStore();

    const visiblePoints = ref<TradingPoint[]>([]);
    const hiddenPoints = ref<TradingPoint[]>([]);
    const showHidden = ref(false);
    const loading = ref(true);
    const addOpen = ref(false);
    const addSaving = ref(false);
    const addForm = ref<TradingPointAddForm>(emptyAddForm());

    const siblingPoint = computed<GeoPoint | null>(() => {
        const other = visiblePoints.value.find(p => p.latitude !== null && p.longitude !== null);
        return other ? { latitude: other.latitude!, longitude: other.longitude! } : null;
    });

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
            latitude: number | null;
            longitude: number | null;
        },
    ): Promise<void> {
        await gql(
            `mutation($id:ID! $name:String! $address:String! $contactName:String $contactPhone:String $workingHours:String $deliveryComment:String $latitude:Float $longitude:Float){
      customerEditTradingPoint(id:$id name:$name address:$address contactName:$contactName contactPhone:$contactPhone workingHours:$workingHours deliveryComment:$deliveryComment latitude:$latitude longitude:$longitude){ id }
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
        if (!isTradingPointValid(addForm.value)) return;
        addSaving.value = true;
        await gql(
            `mutation($name:String! $address:String! $contactName:String $contactPhone:String $workingHours:String $deliveryComment:String $latitude:Float $longitude:Float){
      customerAddTradingPoint(name:$name address:$address contactName:$contactName contactPhone:$contactPhone workingHours:$workingHours deliveryComment:$deliveryComment latitude:$latitude longitude:$longitude){ id }
    }`,
            {
                name: addForm.value.name,
                address: addForm.value.address,
                contactName: addForm.value.contactName || null,
                contactPhone: addForm.value.contactPhone || null,
                workingHours: addForm.value.workingHours || null,
                deliveryComment: addForm.value.deliveryComment || null,
                latitude: addForm.value.latitude,
                longitude: addForm.value.longitude,
            },
        );
        addSaving.value = false;
        addOpen.value = false;
        await loadPoints();
    }

    return {
        visiblePoints,
        siblingPoint,
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

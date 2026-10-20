import { onMounted, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from '@mivend/ui-kit';
import { shopApi } from '../../api/client';
import {
    MyTradingPointsForDeliverySelectorDocument,
    SetPreferredTradingPointForDeliverySelectorDocument,
    SettingsProfileDocument,
    UpdateCustomerForSettingsDocument,
    type MyTradingPointsForDeliverySelectorQuery,
} from '../../api/generated/graphql';
import { useAuthStore } from '../../stores/auth';
import { profileUpdateInput, type ProfileForm } from './settingsForms';
import { selectableTradingPoints } from '../checkout/selectableTradingPoints';

type PointOption = MyTradingPointsForDeliverySelectorQuery['myTradingPoints'][number];

export function useSettingsProfile(): {
    form: Ref<ProfileForm>;
    email: Ref<string>;
    pointId: Ref<string>;
    points: Ref<PointOption[]>;
    loading: Ref<boolean>;
    saving: Ref<boolean>;
    save: () => Promise<void>;
} {
    const { t } = useI18n();
    const authStore = useAuthStore();
    const form = ref<ProfileForm>({ firstName: '', lastName: '', phoneNumber: '' });
    const email = ref('');
    const pointId = ref('');
    const points = ref<PointOption[]>([]);
    const loading = ref(true);
    const saving = ref(false);

    async function load(): Promise<void> {
        try {
            const [profile, tp] = await Promise.all([
                shopApi(SettingsProfileDocument),
                shopApi(MyTradingPointsForDeliverySelectorDocument),
            ]);
            const c = profile.activeCustomer;
            form.value = {
                firstName: c?.firstName ?? '',
                lastName: c?.lastName ?? '',
                phoneNumber: c?.phoneNumber ?? '',
            };
            email.value = c?.emailAddress ?? '';
            points.value = selectableTradingPoints(tp.myTradingPoints ?? []);
            const preferred = authStore.customer?.customFields?.preferredTradingPointId ?? '';
            pointId.value = points.value.some(p => p.id === preferred) ? preferred : '';
        } catch {
            toast(t('settings.profile.loadFailed'), 'error');
        } finally {
            loading.value = false;
        }
    }

    async function save(): Promise<void> {
        saving.value = true;
        try {
            await shopApi(UpdateCustomerForSettingsDocument, {
                input: profileUpdateInput(form.value),
            });
            const current = authStore.customer?.customFields?.preferredTradingPointId ?? '';
            if (pointId.value && pointId.value !== current) {
                await shopApi(SetPreferredTradingPointForDeliverySelectorDocument, {
                    id: pointId.value,
                });
            }
            await authStore.fetchCurrentCustomer();
            toast(t('settings.profile.saved'), 'success');
        } catch {
            toast(t('settings.profile.saveFailed'), 'error');
        } finally {
            saving.value = false;
        }
    }

    onMounted(load);
    return { form, email, pointId, points, loading, saving, save };
}

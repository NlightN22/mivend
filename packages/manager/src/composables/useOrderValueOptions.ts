import { onMounted, ref, type Ref } from 'vue';
import { VALUE_FILTER_KINDS, type ValueOptions } from '../api/orderAnalyticsValueFilter';
import { fetchOrderFilterValues } from '../api/orderAnalyticsValues';

export function useOrderValueOptions(): Ref<ValueOptions> {
    const options = ref<ValueOptions>({});
    onMounted(async () => {
        const [scheme, status] = await Promise.all([
            fetchOrderFilterValues(VALUE_FILTER_KINDS.shipmentScheme),
            fetchOrderFilterValues(VALUE_FILTER_KINDS.orderStatus),
        ]);
        options.value = { shipmentScheme: scheme, orderStatus: status };
    });
    return options;
}

import { groupToken } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { adminApi } from './client';
import {
    AnalyticsFilterCapabilitiesDocument,
    OrderAnalyticsGroupSuggestDocument,
} from './generated/graphql';
import type { OrderAnalyticsGroupKind } from './generated/graphql';

// Group picks: our own ids go to the server, which expands them; the ERP id never reaches the browser.
export interface OrderAnalyticsGroupFilter {
    kind: OrderAnalyticsGroupKind;
    ids: string[];
    exclude?: boolean;
}

export function suggestAnalyticsGroups(
    kind: OrderAnalyticsGroupKind,
    prefix: string,
): Promise<string[]> {
    return adminApi(OrderAnalyticsGroupSuggestDocument, { kind, prefix }).then(r =>
        r.orderAnalyticsGroupSuggest.map(option => groupToken(option.id, option.name)),
    );
}

// The group filters the analytics service supports now; a failed answer offers none.
export function fetchAnalyticsGroupKinds(): Promise<OrderAnalyticsGroupKind[]> {
    return adminApi(AnalyticsFilterCapabilitiesDocument, {})
        .then(r => r.analyticsFilterCapabilities.groupKinds)
        .catch(() => []);
}

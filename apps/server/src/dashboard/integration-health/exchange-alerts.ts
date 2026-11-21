import { DashboardAlertDefinition, api, graphql } from '@vendure/dashboard';

import { isExchangeState } from './exchange-health-view.js';

const exchangeStateAlertDocument = graphql(`
    query ExchangeHealthForAlert {
        exchangeHealth {
            state
        }
    }
`);

function exchangeAlert(
    wanted: 'DOWN' | 'DEGRADED',
    id: string,
    severity: 'error' | 'warning',
    title: string,
    description: string,
): DashboardAlertDefinition<boolean> {
    return {
        id,
        check: async () => {
            try {
                const data = await api.query(exchangeStateAlertDocument);
                return isExchangeState(data.exchangeHealth.state, wanted);
            } catch {
                // Fail closed like the other integration checks: never crash the shell for other extensions.
                return false;
            }
        },
        shouldShow: show => show === true,
        severity,
        title: () => title,
        description: () => description,
        actions: [
            {
                label: 'View exchange health',
                onClick: ({ dismiss }) => {
                    dismiss();
                    window.location.href = '/integration-health';
                },
            },
        ],
        recheckInterval: 60_000,
    };
}

export const exchangeDownAlert = exchangeAlert(
    'DOWN',
    'erp-exchange-down',
    'error',
    'The ERP exchange is down',
    'The ERP has made no call to the Integration Service for longer than the allowed silence.',
);

export const exchangeDegradedAlert = exchangeAlert(
    'DEGRADED',
    'erp-exchange-degraded',
    'warning',
    'The ERP exchange is degraded',
    'A backlog is older than its threshold or a delivered command is still not acknowledged.',
);

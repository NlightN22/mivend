import { DashboardAlertDefinition, api, graphql } from '@vendure/dashboard';

import { isExchangeState, isExchangeUnreadable } from './exchange-health-view.js';

const exchangeStateAlertDocument = graphql(`
    query ExchangeHealthForAlert {
        exchangeHealth {
            state
            reason
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
    'The ERP is silent for too long, or entities are not reaching Kafka (dead-lettered or long unpublished).',
);

export const exchangeDegradedAlert = exchangeAlert(
    'DEGRADED',
    'erp-exchange-degraded',
    'warning',
    'The ERP exchange is degraded',
    'A backlog is older than its threshold, a command is not acknowledged, or an entity has mapping errors.',
);

export const exchangeUnknownAlert: DashboardAlertDefinition<boolean> = {
    id: 'erp-exchange-unknown',
    check: async () => {
        try {
            const { exchangeHealth } = await api.query(exchangeStateAlertDocument);
            return isExchangeUnreadable(exchangeHealth.state, exchangeHealth.reason);
        } catch {
            return false;
        }
    },
    shouldShow: show => show === true,
    severity: 'warning',
    title: () => 'The ERP exchange health cannot be read',
    description: () =>
        'The Integration Service is unreachable, rejects the ops key or the poll has stopped; the exchange state is unknown.',
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

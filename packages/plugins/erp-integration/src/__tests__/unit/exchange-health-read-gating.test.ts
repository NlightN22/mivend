import { describe, expect, it } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ExchangeHealthResolver } from '../../exchange-health.resolver';
import { IntegrationInboxEventResolver } from '../../integration-inbox-event.resolver';
import { IntegrationOutboxRecoveryResolver } from '../../integration-outbox-recovery.resolver';
import { IntegrationStreamHealthResolver } from '../../integration-stream-health.resolver';
import { KafkaLagResolver } from '../../kafka-lag.resolver';

const READ_OR_MANAGE = [
    CustomPermission.ManageErpIntegration.Permission,
    CustomPermission.ReadExchangeHealth.Permission,
];

const allowed = (target: object, method: string): unknown =>
    Reflect.getMetadata(PERMISSIONS_METADATA_KEY, (target as Record<string, object>)[method]);

describe('exchange health reads accept ReadExchangeHealth', () => {
    it.each([
        'integrationStreamHealth',
        'integrationOutboxHealth',
        'variantUnitHealth',
        'rejectedOrderCount',
    ])('%s', method => {
        expect(allowed(IntegrationStreamHealthResolver.prototype, method)).toEqual(READ_OR_MANAGE);
    });

    it('exchangeHealth and kafkaConsumerLag', () => {
        expect(allowed(ExchangeHealthResolver.prototype, 'exchangeHealth')).toEqual(READ_OR_MANAGE);
        expect(allowed(KafkaLagResolver.prototype, 'kafkaConsumerLag')).toEqual(READ_OR_MANAGE);
    });
});

describe('queries outside the five views stay on their own permission', () => {
    it('orderCheckHealth is not opened to ReadExchangeHealth', () => {
        expect(allowed(IntegrationStreamHealthResolver.prototype, 'orderCheckHealth')).toEqual([
            CustomPermission.ManageErpIntegration.Permission,
        ]);
    });
});

describe('actions never accept ReadExchangeHealth', () => {
    const recover = [CustomPermission.RecoverIntegrationEvents.Permission];

    it('dismissing an inbox row and requeueing or rebuilding outbox rows need RecoverIntegrationEvents', () => {
        expect(
            allowed(IntegrationInboxEventResolver.prototype, 'dismissFailedIntegrationInbox'),
        ).toEqual(recover);
        for (const method of [
            'requeueFailedIntegrationOutbox',
            'rebuildSkippedIntegrationOutbox',
        ]) {
            expect(allowed(IntegrationOutboxRecoveryResolver.prototype, method)).toEqual(recover);
        }
    });
});

import { LanguageCode } from '@vendure/core';
import type { CustomFieldConfig } from '@vendure/core';

const stringField = (config: { name: string }): CustomFieldConfig => ({
    ...config,
    type: 'string',
    nullable: true,
    public: false,
    label: [{ languageCode: LanguageCode.en, value: config.name }],
});

export const actingSessionCustomFields: CustomFieldConfig[] = [
    stringField({ name: 'actingAdministratorId' }),
    stringField({ name: 'actingParentSessionId' }),
    stringField({ name: 'actingTradingPointId' }),
];

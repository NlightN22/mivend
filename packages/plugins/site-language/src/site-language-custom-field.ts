import { GlobalSettingsService, LanguageCode } from '@vendure/core';
import type { CustomFieldConfig, RuntimeVendureConfig } from '@vendure/core';

import { SITE_LANGUAGES } from './types';

const en = (value: string): Array<{ languageCode: LanguageCode; value: string }> => [
    { languageCode: LanguageCode.en, value },
];

export function addDefaultLanguageField(config: RuntimeVendureConfig): void {
    const field: CustomFieldConfig = {
        name: 'defaultLanguage',
        type: 'string',
        nullable: true,
        public: false,
        options: SITE_LANGUAGES.map(value => ({ value, label: en(value) })),
        label: en('Default interface and mail language'),
        description: en(
            'Must be one of the Available Languages. Unset falls back to the server env.',
        ),
        validate: async (value, injector, ctx) => {
            if (!value) return;
            const settings = await injector.get(GlobalSettingsService).getSettings(ctx);
            if (!settings.availableLanguages.includes(value as LanguageCode)) {
                return `${value} is not one of the Available Languages`;
            }
        },
    };
    config.customFields.GlobalSettings = [...(config.customFields.GlobalSettings ?? []), field];
}

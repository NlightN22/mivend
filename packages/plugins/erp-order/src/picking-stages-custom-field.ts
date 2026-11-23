import { LanguageCode } from '@vendure/core';
import type { CustomFieldConfig, RuntimeVendureConfig } from '@vendure/core';

declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        pickingWorkStages?: string[] | null;
    }
}

const en = (value: string): Array<{ languageCode: LanguageCode; value: string }> => [
    { languageCode: LanguageCode.en, value },
];

export function addPickingWorkStagesField(config: RuntimeVendureConfig): void {
    const field: CustomFieldConfig = {
        name: 'pickingWorkStages',
        type: 'string',
        list: true,
        nullable: true,
        public: false,
        label: en('Picking stages of warehouse work results'),
        description: en(
            'Stage values (as sent by the ERP) of work results that count as picked on the order card. Empty: none.',
        ),
    };
    config.customFields.GlobalSettings = [...(config.customFields.GlobalSettings ?? []), field];
}

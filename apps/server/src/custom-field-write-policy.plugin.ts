import { VendurePlugin, type CustomFields, type RuntimeVendureConfig } from '@vendure/core';

// The only custom fields a client may set through the Shop/Admin API; every other field is service-written.
export const CLIENT_WRITABLE_CUSTOM_FIELDS: Readonly<Record<string, readonly string[]>> = {
    // Staff category settings, written by the manager portal.
    Collection: ['feedHidden', 'visibilityOverride'],
    // Staff-edited system settings.
    GlobalSettings: [
        'organizationSplitEnabled',
        'defaultBranchId',
        'settlementRetentionMonths',
        'deferredOrderMaxAgeDays',
        'autoReserveOnPlacement',
        'stockTierLowMax',
        'stockTierMediumMax',
    ],
};

export function applyCustomFieldWritePolicy(customFields: CustomFields): CustomFields {
    const guarded: CustomFields = {};
    for (const [entity, fields] of Object.entries(customFields)) {
        const writable = CLIENT_WRITABLE_CUSTOM_FIELDS[entity] ?? [];
        guarded[entity as keyof CustomFields] = fields?.map(f =>
            writable.includes(f.name) ? f : { ...f, readonly: true },
        ) as never;
    }
    return guarded;
}

// Keep it last in `plugins`: it must see the custom fields every other plugin registers.
@VendurePlugin({
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        config.customFields = applyCustomFieldWritePolicy(config.customFields);
        return config;
    },
    compatibility: '^3.0.0',
})
export class CustomFieldWritePolicyPlugin {}

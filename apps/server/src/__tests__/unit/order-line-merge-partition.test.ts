import { getConfigurationFunction } from '@vendure/core/dist/plugin/plugin-metadata';
import { defaultConfig, mergeConfig, type RuntimeVendureConfig } from '@vendure/core';
import { MERGE_PARTITION_FIELDS } from '@mivend/plugin-order-identity';
import { describe, expect, it } from 'vitest';

// Fields that deliberately do not split a merge group (none today).
const ALLOWED_NOT_IN_PARTITION: string[] = [];

describe('order_line_identity merge partition', () => {
    it('covers every OrderLine custom field or lists it as allowed', async () => {
        process.env.INSTANCE_NUMBER_CODE ??= '001';
        const { config } = await import('../../vendure-config');
        const runtime = mergeConfig(defaultConfig, config) as RuntimeVendureConfig;
        for (const plugin of config.plugins ?? []) {
            const configure = getConfigurationFunction(plugin);
            if (configure) await configure(runtime);
        }

        const names = (runtime.customFields.OrderLine ?? []).map(field => field.name);
        expect(names.length).toBeGreaterThan(0);
        const undecided = names.filter(
            name =>
                !MERGE_PARTITION_FIELDS.includes(name) && !ALLOWED_NOT_IN_PARTITION.includes(name),
        );
        expect(undecided).toEqual([]);
    }, 60_000);
});

import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { Type } from '@vendure/core';

import { NumberingService } from './numbering.service';
import { NUMBERING_PLUGIN_OPTIONS, NumberingPluginOptions } from './types';

function assertInstanceNumberCode(code: string | undefined): string {
    if (!code || !/^\d{3}$/.test(code)) {
        throw new Error(
            `NumberingPlugin: INSTANCE_NUMBER_CODE must be exactly 3 digits, got ${JSON.stringify(code)}`,
        );
    }
    return code;
}

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        NumberingService,
        {
            provide: NUMBERING_PLUGIN_OPTIONS,
            useFactory: (): NumberingPluginOptions => NumberingPlugin.options,
        },
    ],
    exports: [NumberingService],
    compatibility: '>0.0.0',
})
export class NumberingPlugin {
    static options: NumberingPluginOptions;

    static init(options: NumberingPluginOptions): Type<NumberingPlugin> {
        assertInstanceNumberCode(options.instanceNumberCode);
        this.options = options;
        return NumberingPlugin;
    }
}

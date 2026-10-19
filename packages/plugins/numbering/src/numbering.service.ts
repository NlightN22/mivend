import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { NUMBERING_PLUGIN_OPTIONS, NUMBERING_SEQUENCE_NAMES, NumberingDocumentType } from './types';
import type { NumberingPluginOptions } from './types';
import { ctxQuery } from 'shared';

@Injectable()
export class NumberingService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(NUMBERING_PLUGIN_OPTIONS) private options: NumberingPluginOptions,
    ) {}

    async next(ctx: RequestContext, documentType: NumberingDocumentType): Promise<string> {
        const sequenceName = NUMBERING_SEQUENCE_NAMES[documentType];
        const result: Array<{ nextval: string }> = await ctxQuery(
            this.connection,
            ctx,
            `SELECT nextval('${sequenceName}') as nextval`,
        );
        const seqValue = result[0].nextval;
        return `${this.options.instanceNumberCode}${String(seqValue).padStart(7, '0')}`;
    }

    formatOrderDocumentNumber(orderNumber: string, ordinal: number, version: number): string {
        return `${orderNumber}-${String(ordinal).padStart(2, '0')}-${version}`;
    }
}

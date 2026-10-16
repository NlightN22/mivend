import { Injectable, OnModuleInit } from '@nestjs/common';
import { ProductVariant, TransactionalConnection } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';

import { MULTIPLICITY_CHECK_CODE, evaluateMultiplicity } from './multiplicity.check';
import { PackagingPolicyService } from './packaging-policy.service';

interface MultiplicitySubject {
    customerId: string | null;
    branchId: string | null;
    lines: { lineId: string; productVariantId: string; sku: string; quantity: number }[];
}

// Off by default on every stage, as the old per-branch flag was; `cart` is the block that refuses a quantity.
@Injectable()
export class MultiplicityCheckRegistrar implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private connection: TransactionalConnection,
        private packaging: PackagingPolicyService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<MultiplicitySubject>({
            code: MULTIPLICITY_CHECK_CODE,
            subjectType: 'order',
            stages: ['cart', 'pre-reserve', 'on-edit'],
            description:
                'A line quantity must be a multiple of the variant pack size (cart: refuses the quantity).',
            stageDefaults: { cart: 'block', 'pre-reserve': 'hold', 'on-edit': 'warn' },
            defaultEnabled: { cart: false, 'pre-reserve': false, 'on-edit': false },
            evaluate: async (subject, { ctx }) => {
                const variants = subject.lines.length
                    ? await this.connection
                          .getRepository(ctx, ProductVariant)
                          .findByIds(subject.lines.map(l => l.productVariantId))
                    : [];
                const byId = new Map(variants.map(v => [String(v.id), v]));
                const lines = [];
                for (const line of subject.lines) {
                    const variant = byId.get(line.productVariantId);
                    lines.push({
                        ...line,
                        requiredMultiple: variant
                            ? await this.packaging.requiredMultiple(
                                  ctx,
                                  variant,
                                  subject.customerId,
                                  subject.branchId,
                                  true,
                              )
                            : 1,
                    });
                }
                return evaluateMultiplicity(lines);
            },
        });
    }
}

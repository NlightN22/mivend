import {
    EntityHydrator,
    Injector,
    Order,
    OrderInterceptor,
    ProductVariant,
    RequestContext,
    TranslatorService,
    WillAddItemToOrderInput,
    WillAdjustOrderLineInput,
} from '@vendure/core';
import { PackagingPolicyService } from './packaging-policy.service';

const MAX_PACKS_FOR_WHOLE_QUANTITY = 1000;

// Smallest whole base quantity that is a whole number of packages (ratio 0.9 -> 9, 2.5 -> 5, 6 -> 6).
function wholePackagesQuantity(ratio: number): number {
    for (let packs = 1; packs <= MAX_PACKS_FOR_WHOLE_QUANTITY; packs++) {
        const base = packs * ratio;
        if (Math.abs(base - Math.round(base)) < 1e-9) return Math.round(base);
    }
    return ratio;
}

// Server-side pack-size (MOQ) + branch-conditional packaging enforcement — see
// docs/order-flow.md's "Pack-size / MOQ" and mivend#103 sections.
export class MultiplicityOrderInterceptor implements OrderInterceptor {
    private entityHydrator!: EntityHydrator;
    private translatorService!: TranslatorService;
    private packagingPolicyService!: PackagingPolicyService;

    init(injector: Injector): void {
        this.entityHydrator = injector.get(EntityHydrator);
        this.translatorService = injector.get(TranslatorService);
        this.packagingPolicyService = injector.get(PackagingPolicyService);
    }

    async willAddItemToOrder(
        ctx: RequestContext,
        order: Order,
        input: WillAddItemToOrderInput,
    ): Promise<void | string> {
        return this.checkMultiplicity(ctx, order, input.productVariant, input.quantity);
    }

    async willAdjustOrderLine(
        ctx: RequestContext,
        order: Order,
        input: WillAdjustOrderLineInput,
    ): Promise<void | string> {
        return this.checkMultiplicity(ctx, order, input.orderLine.productVariant, input.quantity);
    }

    // Normalizes per docs/order-flow.md's decided rule: null/0/negative multiplicity is a data
    // error, treated as "no constraint" (same as 1), not a rejection — don't block orders over
    // bad ERP data. Same normalization applies to the branch-conditional packaging multiple.
    private async checkMultiplicity(
        ctx: RequestContext,
        order: Order,
        variant: ProductVariant,
        quantity: number,
    ): Promise<void | string> {
        const multiplicity = variant.customFields?.multiplicity ?? 1;
        let effective = multiplicity > 1 ? multiplicity : 1;

        const unitRatioToBase = variant.customFields?.unitRatioToBase ?? null;
        if (unitRatioToBase && unitRatioToBase > 0 && unitRatioToBase !== 1) {
            const packagesOnly = await this.packagingPolicyService.isPackagesOnly(
                ctx,
                order.customerId,
                order.customFields?.branchId ?? null,
            );
            if (packagesOnly) {
                effective = wholePackagesQuantity(unitRatioToBase);
            }
        }

        if (quantity % effective === 0) {
            return;
        }

        const variantName = await this.getTranslatedVariantName(ctx, variant);
        return `"${variantName}" must be ordered in multiples of ${effective}`;
    }

    private async getTranslatedVariantName(
        ctx: RequestContext,
        variant: ProductVariant,
    ): Promise<string> {
        await this.entityHydrator.hydrate(ctx, variant, { relations: ['translations'] });
        const translated = this.translatorService.translate(variant, ctx);
        return translated.name;
    }
}

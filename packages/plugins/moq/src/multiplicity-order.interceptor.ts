import {
    EntityHydrator,
    Injector,
    OrderInterceptor,
    ProductVariant,
    RequestContext,
    TranslatorService,
    WillAddItemToOrderInput,
    WillAdjustOrderLineInput,
} from '@vendure/core';

// Server-side pack-size (MOQ) enforcement — see docs/order-flow.md "Pack-size / MOQ".
// Covers addItemToOrder/adjustOrderLine/removeItemFromOrder (shop API) and the OrderService
// methods the admin draft-order flow calls, via Vendure's own OrderInterceptor extension point
// (its docs use exactly this "min/max order quantity via a ProductVariant custom field"
// use-case as the canonical example) — no per-mutation-site plumbing needed.
export class MultiplicityOrderInterceptor implements OrderInterceptor {
    private entityHydrator!: EntityHydrator;
    private translatorService!: TranslatorService;

    init(injector: Injector): void {
        this.entityHydrator = injector.get(EntityHydrator);
        this.translatorService = injector.get(TranslatorService);
    }

    async willAddItemToOrder(
        ctx: RequestContext,
        _order: unknown,
        input: WillAddItemToOrderInput,
    ): Promise<void | string> {
        return this.checkMultiplicity(ctx, input.productVariant, input.quantity);
    }

    async willAdjustOrderLine(
        ctx: RequestContext,
        _order: unknown,
        input: WillAdjustOrderLineInput,
    ): Promise<void | string> {
        return this.checkMultiplicity(ctx, input.orderLine.productVariant, input.quantity);
    }

    // Normalizes per docs/order-flow.md's decided rule: null/0/negative multiplicity is a data
    // error, treated as "no constraint" (same as 1), not a rejection — don't block orders over
    // bad ERP data.
    private async checkMultiplicity(
        ctx: RequestContext,
        variant: ProductVariant,
        quantity: number,
    ): Promise<void | string> {
        const multiplicity = variant.customFields?.multiplicity ?? 1;
        const effective = multiplicity > 1 ? multiplicity : 1;
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

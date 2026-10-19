import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
    ProductCardLabels,
    ProductMainCardsLabels,
    ProductRowLabels,
    QtyStepperLabels,
    StockBadgeLabels,
} from '@mivend/ui-kit';

export interface ProductLabels {
    card: ProductCardLabels;
    mainCards: ProductMainCardsLabels;
    row: ProductRowLabels;
    stepper: QtyStepperLabels;
    stock: StockBadgeLabels;
}

export function useProductLabels(): ComputedRef<ProductLabels> {
    const { t } = useI18n();
    return computed(() => {
        const pieces = (n: number): string => t('units.pieces', { n });
        return {
            card: {
                previousPhoto: t('productCard.previousPhoto'),
                nextPhoto: t('productCard.nextPhoto'),
                addToCart: t('productCard.addToCart'),
                viewAnalogs: t('productCard.viewAnalogs'),
                logInForPrices: t('productCard.logInForPrices'),
                favorite: t('productCard.favorite'),
            },
            mainCards: {
                sku: t('productList.sku'),
                brand: t('product.brand'),
                category: t('product.category'),
                fullName: t('product.fullName'),
                description: t('product.description'),
                units: t('product.units'),
                unit: t('productList.unit'),
                multiplicity: t('productList.multiplicity'),
                packaging: t('product.packaging'),
                pieces: t('units.pc'),
                specifications: t('product.specifications'),
                analogs: t('product.analogs'),
                analogsSub: t('product.analogsSub'),
                addToCart: t('productCard.addToCart'),
            },
            row: {
                sku: t('productList.sku'),
                stock: t('productList.stock'),
                unit: t('productList.unit'),
                defaultUnit: t('units.pc'),
                multiplicity: t('productList.multiplicity'),
                multiplicityPieces: pieces,
                pack: t('productList.pack'),
                price: t('productList.price'),
                logIn: t('productCard.logIn'),
                floorPrice: t('productCard.floorPrice'),
                add: t('productCard.add'),
                analogs: t('productCard.analogs'),
                favorite: t('productCard.favorite'),
            },
            stepper: {
                cancel: t('common.cancel'),
                decrease: t('stepper.decrease'),
                quantity: t('stepper.quantity'),
                confirm: t('stepper.confirm'),
                increase: t('stepper.increase'),
            },
            stock: {
                high: t('stock.high'),
                medium: t('stock.medium'),
                low: t('stock.low'),
                out: t('stock.out'),
                pieces,
            },
        };
    });
}

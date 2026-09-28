import { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline1790567453660 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "collection_asset" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "assetId" integer NOT NULL, "position" integer NOT NULL, "collectionId" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_a2adab6fd086adfb7858f1f110c" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_51da53b26522dc0525762d2de8" ON "collection_asset" ("assetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_1ed9e48dfbf74b5fcbb35d3d68" ON "collection_asset" ("collectionId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "collection_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "description" text NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_bb49cfcde50401eb5f463a84dac" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9f9da7d94b0278ea0f7831e1fc" ON "collection_translation" ("slug") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e329f9036210d75caa1d8f2154" ON "collection_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "collection" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isRoot" boolean NOT NULL DEFAULT false, "position" integer NOT NULL, "isPrivate" boolean NOT NULL DEFAULT false, "filters" text NOT NULL, "inheritFilters" boolean NOT NULL DEFAULT true, "id" SERIAL NOT NULL, "parentId" integer, "featuredAssetId" integer, "customFieldsVisibilityoverride" character varying(255), CONSTRAINT "PK_ad3f485bbc99d875491f44d7c85" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7256fef1bb42f1b38156b7449f" ON "collection" ("featuredAssetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "facet_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_a6902cc1dcbb5e52a980f0189ad" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_eaea53f44bf9e97790d38a3d68" ON "facet_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "facet" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isPrivate" boolean NOT NULL DEFAULT false, "code" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "UQ_0c9a5d053fdf4ebb5f0490b40fd" UNIQUE ("code"), CONSTRAINT "PK_a0ebfe3c68076820c6886aa9ff3" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "facet_value_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_a09fdeb788deff7a9ed827a6160" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_3d6e45823b65de808a66cb1423" ON "facet_value_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "facet_value" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying NOT NULL, "id" SERIAL NOT NULL, "facetId" integer NOT NULL, CONSTRAINT "PK_d231e8eecc7e1a6059e1da7d325" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d101dc2265a7341be3d94968c5" ON "facet_value" ("facetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_option_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_69c79a84baabcad3c7328576ac0" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a79a443c1f7841f3851767faa6" ON "product_option_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_option" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "code" character varying NOT NULL, "id" SERIAL NOT NULL, "groupId" integer NOT NULL, CONSTRAINT "PK_4cf3c467e9bc764bdd32c4cd938" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a6debf9198e2fbfa006aa10d71" ON "product_option" ("groupId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_option_group_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_44ab19f118175288dff147c4a00" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_93751abc1451972c02e033b766" ON "product_option_group_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_option_group" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "code" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_d76e92fdbbb5a2e6752ffd4a2c1" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_asset" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "assetId" integer NOT NULL, "position" integer NOT NULL, "productId" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_c56a83efd14ec4175532e1867fc" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_5888ac17b317b93378494a1062" ON "product_asset" ("assetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0d1294f5c22a56da7845ebab72" ON "product_asset" ("productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "description" text NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_62d00fbc92e7a495701d6fee9d5" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_f4a2ec16ba86d277b6faa0b67b" ON "product_translation" ("slug") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7dbc75cb4e8b002620c4dbfdac" ON "product_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "enabled" boolean NOT NULL DEFAULT true, "id" SERIAL NOT NULL, "featuredAssetId" integer, "customFieldsManufacturerid" integer, "customFieldsExternalid" character varying(255), "customFieldsOnsale" boolean DEFAULT false, "customFieldsFullname" character varying(255), CONSTRAINT "UQ_ef6dd675fe74b3aa5625caf93c8" UNIQUE ("customFieldsExternalid"), CONSTRAINT "PK_bebc9158e480b949565b4dc7a82" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_91a19e6613534949a4ce6e76ff" ON "product" ("featuredAssetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "tag" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "value" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_8e4052373c579afc1471f526760" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "asset_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_2f22e63eefeef14d245bdb956b6" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_4eed4464adef51f53e1c7d8021" ON "asset_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "asset" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "type" character varying NOT NULL, "mimeType" character varying NOT NULL, "width" integer NOT NULL DEFAULT '0', "height" integer NOT NULL DEFAULT '0', "fileSize" integer NOT NULL, "source" character varying NOT NULL, "preview" character varying NOT NULL, "focalPoint" text, "id" SERIAL NOT NULL, CONSTRAINT "PK_1209d107fe21482beaea51b745e" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "order_line_reference" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "quantity" integer NOT NULL, "id" SERIAL NOT NULL, "fulfillmentId" integer, "modificationId" integer, "orderLineId" integer NOT NULL, "refundId" integer, "discriminator" character varying NOT NULL, CONSTRAINT "PK_21891d07accb8fa87e11165bca2" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7d57857922dfc7303604697dbe" ON "order_line_reference" ("orderLineId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_06b02fb482b188823e419d37bd" ON "order_line_reference" ("fulfillmentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_22b818af8722746fb9f206068c" ON "order_line_reference" ("modificationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_30019aa65b17fe9ee962893199" ON "order_line_reference" ("refundId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_49a8632be8cef48b076446b8b9" ON "order_line_reference" ("discriminator") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "fulfillment" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "state" character varying NOT NULL, "trackingCode" character varying NOT NULL DEFAULT '', "method" character varying NOT NULL, "handlerCode" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_50c102da132afffae660585981f" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "refund" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "method" character varying NOT NULL, "reason" character varying, "state" character varying NOT NULL, "transactionId" character varying, "metadata" text NOT NULL, "id" SERIAL NOT NULL, "paymentId" integer NOT NULL, "items" integer NOT NULL, "shipping" integer NOT NULL, "adjustment" integer NOT NULL, "total" integer NOT NULL, CONSTRAINT "PK_f1cefa2e60d99b206c46c1116e5" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_1c6932a756108788a361e7d440" ON "refund" ("paymentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "payment" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "method" character varying NOT NULL, "state" character varying NOT NULL, "errorMessage" character varying, "transactionId" character varying, "metadata" text NOT NULL, "id" SERIAL NOT NULL, "amount" integer NOT NULL, "orderId" integer, CONSTRAINT "PK_fcaec7df5adf9cac408c686b2ab" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d09d285fe1645cd2f0db811e29" ON "payment" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "surcharge" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "description" character varying NOT NULL, "listPriceIncludesTax" boolean NOT NULL, "sku" character varying NOT NULL, "taxLines" text NOT NULL, "id" SERIAL NOT NULL, "listPrice" integer NOT NULL, "orderId" integer, "orderModificationId" integer, CONSTRAINT "PK_a62b89257bcc802b5d77346f432" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_154eb685f9b629033bd266df7f" ON "surcharge" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a49c5271c39cc8174a0535c808" ON "surcharge" ("orderModificationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "order_modification" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "note" character varying NOT NULL, "shippingAddressChange" text, "billingAddressChange" text, "id" SERIAL NOT NULL, "priceChange" integer NOT NULL, "orderId" integer, "paymentId" integer, "refundId" integer, CONSTRAINT "PK_cccf2e1612694eeb1e5b6760ffa" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_1df5bc14a47ef24d2e681f4559" ON "order_modification" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "promotion_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "description" text NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_0b4fd34d2fc7abc06189494a178" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_1cc009e9ab2263a35544064561" ON "promotion_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "promotion" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "startsAt" TIMESTAMP, "endsAt" TIMESTAMP, "couponCode" character varying, "perCustomerUsageLimit" integer, "usageLimit" integer, "enabled" boolean NOT NULL, "conditions" text NOT NULL, "actions" text NOT NULL, "priorityScore" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_fab3630e0789a2002f1cadb7d38" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "shipping_method_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL DEFAULT '', "description" character varying NOT NULL DEFAULT '', "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_b862a1fac1c6e1fd201eadadbcb" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_85ec26c71067ebc84adcd98d1a" ON "shipping_method_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "shipping_method" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "code" character varying NOT NULL, "checker" text NOT NULL, "calculator" text NOT NULL, "fulfillmentHandlerCode" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_b9b0adfad3c6b99229c1e7d4865" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "shipping_line" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "listPriceIncludesTax" boolean NOT NULL, "adjustments" text NOT NULL, "taxLines" text NOT NULL, "id" SERIAL NOT NULL, "shippingMethodId" integer NOT NULL, "listPrice" integer NOT NULL, "orderId" integer, CONSTRAINT "PK_890522bfc44a4b6eb7cb1e52609" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e2e7642e1e88167c1dfc827fdf" ON "shipping_line" ("shippingMethodId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_c9f34a440d490d1b66f6829b86" ON "shipping_line" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "order" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "type" character varying NOT NULL DEFAULT 'Regular', "code" character varying NOT NULL, "state" character varying NOT NULL, "active" boolean NOT NULL DEFAULT true, "orderPlacedAt" TIMESTAMP, "couponCodes" text NOT NULL, "shippingAddress" text NOT NULL, "billingAddress" text NOT NULL, "currencyCode" character varying NOT NULL, "id" SERIAL NOT NULL, "aggregateOrderId" integer, "customerId" integer, "taxZoneId" integer, "subTotal" integer NOT NULL, "subTotalWithTax" integer NOT NULL, "shipping" integer NOT NULL DEFAULT '0', "shippingWithTax" integer NOT NULL DEFAULT '0', "customFieldsErporderid" character varying(255), "customFieldsErpstatus" character varying(255) DEFAULT 'PENDING', "customFieldsErpstatusat" TIMESTAMP(6), "customFieldsTradingpointid" character varying(255), "customFieldsBranchid" character varying(255), "customFieldsSourceorderid" character varying(255), "customFieldsPaymentstatus" character varying(255), "customFieldsLatestfulfillmentstate" character varying(255), "customFieldsPlacedbyadministratorid" character varying(255), "customFieldsErpregistrationdocumentnumber" character varying(255), "customFieldsErpregistrationstatus" character varying(255), "customFieldsErporderstatus" character varying(255), "customFieldsErpcontractid" character varying(255), "customFieldsReservationdays" integer DEFAULT '7', "customFieldsReservationstate" character varying(255) NOT NULL DEFAULT 'NOT_REQUIRED', CONSTRAINT "PK_1031171c13130102495201e3e20" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_73a78d7df09541ac5eba620d18" ON "order" ("aggregateOrderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_729b3eea7ce540930dbb706949" ON "order" ("code") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_af13739f4962eab899bdff34be" ON "order" ("orderPlacedAt") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_124456e637cca7a415897dce65" ON "order" ("customerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "stock_location" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "description" character varying NOT NULL, "id" SERIAL NOT NULL, "customFieldsWarehouseerpid" character varying(255), CONSTRAINT "UQ_20f0bcd49229f8ea4c89e736c53" UNIQUE ("customFieldsWarehouseerpid"), CONSTRAINT "PK_adf770067d0df1421f525fa25cc" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "stock_movement" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "type" character varying NOT NULL, "quantity" integer NOT NULL, "id" SERIAL NOT NULL, "stockLocationId" integer NOT NULL, "discriminator" character varying NOT NULL, "productVariantId" integer, "orderLineId" integer, CONSTRAINT "PK_9fe1232f916686ae8cf00294749" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e65ba3882557cab4febb54809b" ON "stock_movement" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a2fe7172eeae9f1cca86f8f573" ON "stock_movement" ("stockLocationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d2c8d5fca981cc820131f81aa8" ON "stock_movement" ("orderLineId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "order_line" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "quantity" integer NOT NULL, "orderPlacedQuantity" integer NOT NULL DEFAULT '0', "listPriceIncludesTax" boolean NOT NULL, "adjustments" text NOT NULL, "taxLines" text NOT NULL, "id" SERIAL NOT NULL, "sellerChannelId" integer, "shippingLineId" integer, "productVariantId" integer NOT NULL, "taxCategoryId" integer, "initialListPrice" integer, "listPrice" integer NOT NULL, "featuredAssetId" integer, "orderId" integer, "customFieldsManualunitprice" integer, "customFieldsManualpricereason" character varying(255), CONSTRAINT "PK_01a7c973d9f30479647e44f9892" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_6901d8715f5ebadd764466f7bd" ON "order_line" ("sellerChannelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_dc9ac68b47da7b62249886affb" ON "order_line" ("shippingLineId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cbcd22193eda94668e84d33f18" ON "order_line" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_77be94ce9ec650446617946227" ON "order_line" ("taxCategoryId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9f065453910ea77d4be8e92618" ON "order_line" ("featuredAssetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_239cfca2a55b98b90b6bef2e44" ON "order_line" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "stock_level" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "stockOnHand" integer NOT NULL, "stockAllocated" integer NOT NULL, "id" SERIAL NOT NULL, "productVariantId" integer NOT NULL, "stockLocationId" integer NOT NULL, "customFieldsErpavailablequantity" integer, CONSTRAINT "PK_88ff7d9dfb57dc9d435e365eb69" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9950eae3180f39c71978748bd0" ON "stock_level" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_984c48572468c69661a0b7b049" ON "stock_level" ("stockLocationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_7fc20486b8cfd33dc84c96e168" ON "stock_level" ("productVariantId", "stockLocationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant_asset" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "assetId" integer NOT NULL, "position" integer NOT NULL, "productVariantId" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_cb1e33ae13779da176f8b03a5d3" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_10b5a2e3dee0e30b1e26c32f5c" ON "product_variant_asset" ("assetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_fa21412afac15a2304f3eb35fe" ON "product_variant_asset" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant_price" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "currencyCode" character varying NOT NULL, "id" SERIAL NOT NULL, "channelId" integer, "price" integer NOT NULL, "variantId" integer, CONSTRAINT "PK_ba659ff2940702124e799c5c854" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e6126cd268aea6e9b31d89af9a" ON "product_variant_price" ("variantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_4b7f882e2b669800bed7ed065f0" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_420f4d6fb75d38b9dca79bc43b" ON "product_variant_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "enabled" boolean NOT NULL DEFAULT true, "sku" character varying NOT NULL, "outOfStockThreshold" integer NOT NULL DEFAULT '0', "useGlobalOutOfStockThreshold" boolean NOT NULL DEFAULT true, "trackInventory" character varying NOT NULL DEFAULT 'INHERIT', "id" SERIAL NOT NULL, "featuredAssetId" integer, "taxCategoryId" integer, "productId" integer, "customFieldsWeight" double precision, "customFieldsOrganizationid" integer, "customFieldsOrganizationpriority" integer, "customFieldsOrganizationsourceentityid" character varying(255), "customFieldsMultiplicity" integer, CONSTRAINT "PK_1ab69c9935c61f7c70791ae0a9f" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0e6f516053cf982b537836e21c" ON "product_variant" ("featuredAssetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e38dca0d82fd64c7cf8aac8b8e" ON "product_variant" ("taxCategoryId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_6e420052844edf3a5506d863ce" ON "product_variant" ("productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "tax_category" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "isDefault" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, "customFieldsErpvatcode" character varying(255), CONSTRAINT "UQ_6dcbb80913f495dd97a543ad242" UNIQUE ("customFieldsErpvatcode"), CONSTRAINT "PK_2432988f825c336d5584a96cded" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "region_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_3e0c9619cafbe579eeecfd88abc" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_1afd722b943c81310705fc3e61" ON "region_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "region" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying NOT NULL, "type" character varying NOT NULL, "enabled" boolean NOT NULL, "id" SERIAL NOT NULL, "parentId" integer, "discriminator" character varying NOT NULL, CONSTRAINT "PK_5f48ffc3af96bc486f5f3f3a6da" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_ed0c8098ce6809925a437f42ae" ON "region" ("parentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "zone" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_bd3989e5a3c3fb5ed546dfaf832" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "tax_rate" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "enabled" boolean NOT NULL, "value" numeric(5,2) NOT NULL, "id" SERIAL NOT NULL, "categoryId" integer, "zoneId" integer, "customerGroupId" integer, CONSTRAINT "PK_23b71b53f650c0b39e99ccef4fd" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7ee3306d7638aa85ca90d67219" ON "tax_rate" ("categoryId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9872fc7de2f4e532fd3230d191" ON "tax_rate" ("zoneId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_8b5ab52fc8887c1a769b9276ca" ON "tax_rate" ("customerGroupId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_group" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_88e7da3ff7262d9e0a35aa3664e" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "authentication_method" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "identifier" character varying, "passwordHash" character varying, "verificationToken" character varying, "passwordResetToken" character varying, "identifierChangeToken" character varying, "pendingIdentifier" character varying, "strategy" character varying, "externalIdentifier" character varying, "metadata" text, "id" SERIAL NOT NULL, "type" character varying NOT NULL, "userId" integer, CONSTRAINT "PK_e204686018c3c60f6164e385081" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_00cbe87bc0d4e36758d61bd31d" ON "authentication_method" ("userId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a23445b2c942d8dfcae15b8de2" ON "authentication_method" ("type") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "role" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying NOT NULL, "description" character varying NOT NULL, "permissions" text NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_b36bcfe02fc8de3c57a8b2391c2" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "session" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "token" character varying NOT NULL, "expires" TIMESTAMP NOT NULL, "invalidated" boolean NOT NULL, "authenticationStrategy" character varying, "id" SERIAL NOT NULL, "activeOrderId" integer, "activeChannelId" integer, "type" character varying NOT NULL, "userId" integer, "customFieldsUseragent" character varying(255), CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_232f8e85d7633bd6ddfad42169" ON "session" ("token") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7a75399a4f4ffa48ee02e98c05" ON "session" ("activeOrderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_eb87ef1e234444728138302263" ON "session" ("activeChannelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session" ("userId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "user" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "identifier" character varying NOT NULL, "verified" boolean NOT NULL DEFAULT false, "lastLogin" TIMESTAMP, "id" SERIAL NOT NULL, CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "customer" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "title" character varying, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "phoneNumber" character varying, "emailAddress" character varying NOT NULL, "id" SERIAL NOT NULL, "userId" integer, "customFieldsCounterpartyid" character varying(255), "customFieldsPortalrole" character varying(255) DEFAULT 'buyer', "customFieldsPreferredtradingpointid" character varying(255), CONSTRAINT "REL_3f62b42ed23958b120c235f74d" UNIQUE ("userId"), CONSTRAINT "PK_a7a13f4cacb744524e44dfdad32" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "address" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "fullName" character varying NOT NULL DEFAULT '', "company" character varying NOT NULL DEFAULT '', "streetLine1" character varying NOT NULL, "streetLine2" character varying NOT NULL DEFAULT '', "city" character varying NOT NULL DEFAULT '', "province" character varying NOT NULL DEFAULT '', "postalCode" character varying NOT NULL DEFAULT '', "phoneNumber" character varying NOT NULL DEFAULT '', "defaultShippingAddress" boolean NOT NULL DEFAULT false, "defaultBillingAddress" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, "customerId" integer, "countryId" integer, CONSTRAINT "PK_d92de1f82754668b5f5f5dd4fd5" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_dc34d382b493ade1f70e834c4d" ON "address" ("customerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d87215343c3a3a67e6a0b7f3ea" ON "address" ("countryId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "administrator" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "emailAddress" character varying NOT NULL, "id" SERIAL NOT NULL, "userId" integer, "customFieldsDepartmentid" character varying(255), "customFieldsBranchid" character varying(255), "customFieldsPosition" character varying(255), "customFieldsSourceadministratorid" character varying(255), "customFieldsErpid" character varying(255), CONSTRAINT "REL_1966e18ce6a39a82b19204704d" UNIQUE ("userId"), CONSTRAINT "UQ_23930d3521a41626a910681e3c6" UNIQUE ("customFieldsErpid"), CONSTRAINT "PK_ee58e71b3b4008b20ddc7b3092b" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "global_settings" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "availableLanguages" text NOT NULL, "trackInventory" boolean NOT NULL DEFAULT true, "outOfStockThreshold" integer NOT NULL DEFAULT '0', "id" SERIAL NOT NULL, "customFieldsOrganizationsplitenabled" boolean DEFAULT true, "customFieldsDefaultbranchid" character varying(255), CONSTRAINT "PK_fec5e2c0bf238e30b25d4a82976" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "payment_method_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "description" text NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_ae5ae0af71ae8d15da9eb75768b" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_66187f782a3e71b9e0f5b50b68" ON "payment_method_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "payment_method" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying NOT NULL DEFAULT '', "enabled" boolean NOT NULL, "checker" text, "handler" text NOT NULL, "id" SERIAL NOT NULL, "customFieldsPaymentclassification" character varying(255), "customFieldsReservationttldays" integer, CONSTRAINT "PK_7744c2b2dd932c9cf42f2b9bc3a" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "seller" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "name" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_36445a9c6e794945a4a4a8d3c9d" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "settings_store_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "key" character varying NOT NULL, "value" json, "scope" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_3a905b358c0b454f6fc6637d6db" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_ab560f7983976aec91b91c26a4" ON "settings_store_entry" ("key") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_8d8ddb95a0fbd11ffb5606ef0c" ON "settings_store_entry" ("scope") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "settings_store_key_scope_unique" ON "settings_store_entry" ("key", "scope") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "api_key_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_b703f4951cec9da71354120bd8a" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_bf45bd67c7b3278d7e1f2f9517" ON "api_key_translation" ("baseId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "api_key" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "lookupId" character varying NOT NULL, "apiKeyHash" character varying NOT NULL, "lastUsedAt" TIMESTAMP, "deletedAt" TIMESTAMP, "id" SERIAL NOT NULL, "ownerId" integer NOT NULL, "userId" integer NOT NULL, CONSTRAINT "UQ_ade30668b991772489bf875be5f" UNIQUE ("lookupId"), CONSTRAINT "UQ_3c254ac4ce1a6d4a26da30c5575" UNIQUE ("apiKeyHash"), CONSTRAINT "PK_b1bd840641b8acbaad89c3d8d11" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "channel" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying NOT NULL, "token" character varying NOT NULL, "description" character varying DEFAULT '', "defaultLanguageCode" character varying NOT NULL, "availableLanguageCodes" text, "defaultCurrencyCode" character varying NOT NULL, "availableCurrencyCodes" text, "trackInventory" boolean NOT NULL DEFAULT true, "outOfStockThreshold" integer NOT NULL DEFAULT '0', "pricesIncludeTax" boolean NOT NULL, "id" SERIAL NOT NULL, "sellerId" integer, "defaultTaxZoneId" integer, "defaultShippingZoneId" integer, CONSTRAINT "UQ_06127ac6c6d913f4320759971db" UNIQUE ("code"), CONSTRAINT "UQ_842699fce4f3470a7d06d89de88" UNIQUE ("token"), CONSTRAINT "PK_590f33ee6ee7d76437acf362e39" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_af2116c7e176b6b88dceceeb74" ON "channel" ("sellerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_afe9f917a1c82b9e9e69f7c612" ON "channel" ("defaultTaxZoneId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_c9ca2f58d4517460435cbd8b4c" ON "channel" ("defaultShippingZoneId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "history_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "type" character varying NOT NULL, "isPublic" boolean NOT NULL, "data" text NOT NULL, "id" SERIAL NOT NULL, "discriminator" character varying NOT NULL, "administratorId" integer, "customerId" integer, "orderId" integer, CONSTRAINT "PK_b65bd95b0d2929668589d57b97a" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_92f8c334ef06275f9586fd0183" ON "history_entry" ("administratorId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_43ac602f839847fdb91101f30e" ON "history_entry" ("customerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_3a05127e67435b4d2332ded7c9" ON "history_entry" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "job_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "queueName" character varying NOT NULL, "data" text, "state" character varying NOT NULL, "progress" integer NOT NULL, "result" text, "error" character varying, "startedAt" TIMESTAMP(6), "settledAt" TIMESTAMP(6), "isSettled" boolean NOT NULL, "retries" integer NOT NULL, "attempts" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_88ce3ea0c9dca8b571450b457a7" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_86bc376c56af8cefd41a847a95" ON "job_record" ("createdAt") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "scheduled_task_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "taskId" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "lockedAt" TIMESTAMP(3), "lastExecutedAt" TIMESTAMP(3), "manuallyTriggeredAt" TIMESTAMP(3), "lastResult" json, "id" SERIAL NOT NULL, CONSTRAINT "UQ_661876d97056cad9fd37eaa8774" UNIQUE ("taskId"), CONSTRAINT "PK_efd4b61a3b227f3eba94de32e4c" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "erp_user" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "fullName" character varying, "email" character varying, "departmentId" character varying, "firstSeenAt" TIMESTAMP NOT NULL, "lastSeenAt" TIMESTAMP NOT NULL, "status" character varying NOT NULL DEFAULT 'unlinked', "administratorId" character varying, "active" boolean, "id" SERIAL NOT NULL, CONSTRAINT "PK_b53a1765b7b9b056657ba4c8ef8" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_434605d30bf0ded81dd8184264" ON "erp_user" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "role_access_scope" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "roleCode" character varying NOT NULL, "accessScopeConfig" text NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_75bc0b64595f20ff1fe03127c22" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_0085f89152c53427285572dc51" ON "role_access_scope" ("roleCode") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "branch" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "name" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_2e39f426e2faefdaa93c5961976" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_70e3600cb8f5450ffc38496fd5" ON "branch" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "branch_settings" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "branchId" character varying NOT NULL, "defaultPriceTypeId" character varying NOT NULL, "visiblePriceTypeIds" text, "defaultWarehouseId" character varying NOT NULL, "visibleWarehouseIds" text, "id" SERIAL NOT NULL, CONSTRAINT "PK_c0c3c76aa795f051b1290c7c8c6" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8babe9dc79216a196636937e19" ON "branch_settings" ("branchId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "credit_term_limit" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "roleCode" character varying NOT NULL, "maxExtraDays" integer NOT NULL, "maxAmount" bigint, "id" SERIAL NOT NULL, CONSTRAINT "PK_9de97b57cb5bd1f0a9fbbdb2854" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_fe3856b4044d184e2727cc4f5c" ON "credit_term_limit" ("roleCode") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "department" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "name" character varying NOT NULL, "parentErpId" character varying, "isActive" boolean NOT NULL DEFAULT true, "id" SERIAL NOT NULL, CONSTRAINT "PK_9a2213262c1593bffb581e382f5" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_2c6d4388f253a0bf3317eea5f1" ON "department" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "warehouse" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "name" character varying NOT NULL, "branchId" character varying, "isActive" boolean NOT NULL DEFAULT true, "includedInBranchAtp" boolean NOT NULL DEFAULT true, "id" SERIAL NOT NULL, CONSTRAINT "PK_965abf9f99ae8c5983ae74ebde8" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_a6ff8ca6e090ac6c68af88c243" ON "warehouse" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "approval_request" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "requestType" character varying NOT NULL, "payload" text NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "currentStepIndex" integer NOT NULL DEFAULT '0', "requestedByAdministratorId" character varying, "xstateSnapshot" text, "decidedAt" TIMESTAMP, "version" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_7ec7f6581285148e265d3415327" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_f8268063f06b79a99660250f2a" ON "approval_request" ("requestType") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "approval_step" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "approvalRequestId" character varying NOT NULL, "stepIndex" integer NOT NULL, "requiredRole" character varying NOT NULL, "approverAdministratorId" character varying, "wasEscalated" boolean NOT NULL DEFAULT false, "escalatedByAdministratorId" character varying, "escalatedToAdministratorId" character varying, "decision" character varying, "comment" text, "decidedAt" TIMESTAMP, "id" SERIAL NOT NULL, CONSTRAINT "PK_ce4e7284448d965d64c1b89ee39" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_e4edf66154be106f182678e2d4" ON "approval_step" ("approvalRequestId", "stepIndex") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "workflow_definition" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "requestType" character varying NOT NULL, "displayName" character varying NOT NULL, "stepsJson" text NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_85af8b533afa5d71f1ea9663ad3" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_fdb4fbde8137a7166e1b16633a" ON "workflow_definition" ("requestType") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "price_type" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying NOT NULL, "name" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "externalId" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_c6dc725decde1602146929619d7" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_3edf1fe2b3aecfa2d035cc35ae" ON "price_type" ("code") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_41dbe54e4ccc599d028bbc0d22" ON "price_type" ("externalId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_price_type" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "customerId" character varying NOT NULL, "id" SERIAL NOT NULL, "priceTypeId" integer NOT NULL, CONSTRAINT "PK_be953f7222ae490bb21357ff4ca" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_7ad95dbc3f8b45555cf35b20ea" ON "customer_price_type" ("customerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "entity_version" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityName" character varying NOT NULL, "entityId" character varying NOT NULL, "action" character varying NOT NULL, "changedFields" text, "administratorId" character varying, "comment" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_9a5edfa14178784445ee2d9f8ab" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_bd34db8e79f95601b3929a338b" ON "entity_version" ("entityName") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_435428677e9c15da12c1658ad2" ON "entity_version" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "counterparty" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "legalName" character varying NOT NULL, "shortName" character varying NOT NULL, "inn" character varying, "creditLimit" bigint NOT NULL DEFAULT '0', "creditBalance" bigint NOT NULL DEFAULT '0', "paymentDelayDays" integer NOT NULL DEFAULT '0', "priceType" character varying NOT NULL DEFAULT 'retail', "isActive" boolean NOT NULL DEFAULT true, "assignedManagerId" character varying, "managerErpId" character varying, "departmentId" character varying, "branchId" character varying, "erpGroupLabel" character varying, "creditTermOverrideExtraDays" integer, "legalAddress" character varying, "factualAddress" character varying, "phone" character varying, "officialEmail" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_7c8af5f1b9f320f986d2a5a43ae" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_40e5fc5c838b0e5e2e9059aa41" ON "counterparty" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_5390407a260ef711d6153f9246" ON "counterparty" ("managerErpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "trading_point" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "counterpartyId" integer NOT NULL, "name" character varying NOT NULL, "address" character varying NOT NULL, "latitude" double precision, "longitude" double precision, "workingHours" character varying, "deliveryComment" character varying, "isActive" boolean NOT NULL DEFAULT true, "customerStatus" character varying NOT NULL DEFAULT 'active', "customerOwned" boolean NOT NULL DEFAULT false, "servicingBranchId" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_05479e863fff010cf70d58f7399" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_e984c290905c13ce36b05a8774" ON "trading_point" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "contact_person" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "phone" character varying, "email" character varying, "isPrimary" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, "tradingPointId" integer NOT NULL, CONSTRAINT "PK_12d9c34f76290c4e2ad2aa5e33f" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "counterparty_team_member" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "counterpartyId" character varying NOT NULL, "administratorId" character varying NOT NULL, "role" character varying NOT NULL, "phone" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_18600874ce72332302ca3b3b172" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_69659bd4eb021c8ec50c33afe1" ON "counterparty_team_member" ("counterpartyId", "administratorId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant_price_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "variantId" character varying NOT NULL, "priceTypeCode" character varying NOT NULL, "price" bigint NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_df59042fb6655b0a344f485854e" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_94d191d8ddc46b70764a3ab283" ON "product_variant_price_entry" ("variantId", "priceTypeCode") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "discount_rule" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "priceTypeCode" character varying, "facetCode" character varying, "facetValueCode" character varying, "percent" integer NOT NULL, "validFrom" TIMESTAMP NOT NULL, "validTo" TIMESTAMP NOT NULL, "minWeightKg" double precision, "minAmount" bigint, "triggerProductErpId" character varying, "triggerQuantity" double precision, "giftProductErpId" character varying, "giftQuantity" double precision, "operationKind" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_ac2c280de3701b2d66f6817f760" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8394fcc3ceb570184a246416fb" ON "discount_rule" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "discount_grant" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "number" character varying NOT NULL, "discountRuleId" character varying NOT NULL, "scopeType" character varying NOT NULL, "validTo" TIMESTAMP NOT NULL, "sourceApprovalRequestId" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_0adecfb7386b723eeed0f93d283" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_bce2482501d1de61b878578765" ON "discount_grant" ("number") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "discount_registry_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "approvalRequestId" character varying, "discountRuleId" character varying, "status" character varying NOT NULL, "priceTypeCode" character varying NOT NULL, "facetCode" character varying, "facetValueCode" character varying, "percent" integer NOT NULL, "validFrom" TIMESTAMP NOT NULL, "validTo" TIMESTAMP NOT NULL, "justification" character varying, "counterpartyIds" text, "customerNamesForSearch" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_0d81f0f4c4108f76c0a86a56e2e" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a90a6bc75195e6cf6d9b310d92" ON "discount_registry_entry" ("approvalRequestId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_011d840c7306663a3a105dc3d4" ON "discount_registry_entry" ("discountRuleId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "notification" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "recipientType" character varying NOT NULL, "recipientId" character varying, "kind" character varying NOT NULL, "sourceType" character varying NOT NULL, "sourceId" character varying, "title" character varying NOT NULL, "message" text NOT NULL, "status" character varying NOT NULL DEFAULT 'unread', "readAt" TIMESTAMP, "resolvedAt" TIMESTAMP, "resolution" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_6739de972b5240cf3d6d17f308" ON "notification" ("sourceType", "sourceId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "dispute" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paymentId" integer NOT NULL, "type" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'opened', "amount" integer NOT NULL, "openedAt" TIMESTAMP NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_e2f1f4741f2094ce789b0a7c5b3" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_b51bd583c5b118a7c41d2f5e1c" ON "dispute" ("paymentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "fiscal_receipt" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paymentId" integer NOT NULL, "fiscalDocumentNumber" character varying, "fiscalSign" character varying, "fiscalDriveNumber" character varying, "registrationNumber" character varying, "receiptType" character varying NOT NULL, "fiscalizedAt" TIMESTAMP, "fiscalizationStatus" character varying NOT NULL DEFAULT 'notRequired', "id" SERIAL NOT NULL, CONSTRAINT "PK_1939ec69d60efcc0be78e2ab705" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a5c0d043023c44840a3b0cba4a" ON "fiscal_receipt" ("paymentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "idempotency_key" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "callerId" character varying NOT NULL, "idempotencyKey" character varying NOT NULL, "requestHash" character varying NOT NULL, "response" text, "status" character varying NOT NULL DEFAULT 'inProgress', "id" SERIAL NOT NULL, CONSTRAINT "PK_213f125e14469be304f9ff1d452" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_6b398b47f3b0784bd1ab4ec72a" ON "idempotency_key" ("callerId", "idempotencyKey") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "incoming_payment_event" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "provider" character varying NOT NULL, "providerEventId" character varying NOT NULL, "payloadHash" character varying NOT NULL, "payload" text NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "lastError" text, "processedAt" TIMESTAMP, "id" SERIAL NOT NULL, CONSTRAINT "PK_f63f4bc1117606615782982b888" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ffe685c2c912a1c18fb042860b" ON "incoming_payment_event" ("provider", "providerEventId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "invoice" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "orderId" integer NOT NULL, "number" character varying NOT NULL, "organizationId" integer NOT NULL, "counterpartyId" integer NOT NULL, "amount" integer NOT NULL, "currencyCode" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "branchId" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_15d25c200d9bcd8a33f698daf18" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_f494ce6746b91e9ec9562af485" ON "invoice" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_60284980bc8b9c624459948f4a" ON "invoice" ("number") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_058ef835f99e28fc6717cd7c80" ON "invoice" ("organizationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_55c734c8f77040ed61ad02c6cd" ON "invoice" ("counterpartyId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_f6757552bd0776859af91c222c" ON "invoice" ("branchId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7465d595c3d205a1d09b71cb82" ON "invoice" ("counterpartyId", "organizationId", "status") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "payment_attempt" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "number" character varying NOT NULL, "channel" character varying NOT NULL, "invoiceId" integer, "orderId" integer, "amount" integer NOT NULL, "currencyCode" character varying NOT NULL, "providerPaymentId" character varying NOT NULL, "paymentStatus" character varying NOT NULL DEFAULT 'pending', "erpPostingStatus" character varying NOT NULL DEFAULT 'notRequired', "id" SERIAL NOT NULL, CONSTRAINT "PK_a5ce3945d1d61956161e7f84d42" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_58cc3fdfc7e8d39ea8a576a283" ON "payment_attempt" ("number") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_c553baf9e321b2a8129d0a4fde" ON "payment_attempt" ("invoiceId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_4d06e28910804514701004944e" ON "payment_attempt" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_b66aaefe45793b1cf702ea31e1" ON "payment_attempt" ("providerPaymentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_300309a716d3d1ab40eb9b61ec" ON "payment_attempt" ("channel", "providerPaymentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "payment_reconciliation_issue" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "issueType" character varying NOT NULL, "paymentId" integer, "invoiceId" integer, "organizationId" integer, "providerPaymentId" character varying, "erpDocumentId" character varying, "expectedAmount" integer, "actualAmount" integer, "expectedCurrency" character varying, "actualCurrency" character varying, "detectedAt" TIMESTAMP NOT NULL, "status" character varying NOT NULL DEFAULT 'open', "resolution" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_ddaa87b2dae94fd5b61ad400461" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9593bc26747d3059b39597a7d7" ON "payment_reconciliation_issue" ("paymentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "payment_refund" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paymentId" integer NOT NULL, "amount" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "providerRefundId" character varying, "reason" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_9bcd6c17fe1fce78631fdb79633" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cf02cdf12f516041802504ac86" ON "payment_refund" ("paymentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "settlement_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "counterpartyId" integer NOT NULL, "invoiceId" integer, "organizationId" integer, "sourceType" character varying NOT NULL, "sourcePaymentId" integer, "sourceRefundId" integer, "amount" integer NOT NULL, "currencyCode" character varying NOT NULL, "reconciled" boolean NOT NULL DEFAULT false, "allocatedOrderId" integer, "allocationAmount" integer, "id" SERIAL NOT NULL, CONSTRAINT "PK_f42097143d64f0d7e40a4408a32" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_8d6b1f1f88c4b3910cb201d3e8" ON "settlement_entry" ("counterpartyId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_419e874af262dc90425c07aeee" ON "settlement_entry" ("invoiceId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_bd22c1fe7db443df3e4a8272cc" ON "settlement_entry" ("organizationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_392b527621f804b4f61b88dd11" ON "settlement_entry" ("allocatedOrderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "reservation_extension_limit" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "roleCode" character varying NOT NULL, "maxExtraDays" integer NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_5631ff32db1423d7b5a68d1d46e" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_e79794830d54ab5b018c385ce1" ON "reservation_extension_limit" ("roleCode") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "reservation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "orderId" character varying NOT NULL, "orderLineId" character varying NOT NULL, "productVariantId" character varying NOT NULL, "quantity" integer NOT NULL, "status" character varying NOT NULL, "reservedAt" TIMESTAMP NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "releasedAt" TIMESTAMP, "stockLocationId" character varying NOT NULL, "branchId" character varying, "reservationGeneration" integer NOT NULL DEFAULT '1', "creationMethod" character varying NOT NULL, "confirmedByAdministratorId" character varying, "interventionFlaggedAt" TIMESTAMP, "erpOperationId" character varying NOT NULL, "erpReleaseOperationId" character varying, "erpConfirmedAt" TIMESTAMP, "id" SERIAL NOT NULL, CONSTRAINT "PK_48b1f9922368359ab88e8bfa525" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7301aff02b1010e190ca2dda0c" ON "reservation" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_eaaf97faa1d5dd3b70e58fecf5" ON "reservation" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_29be1e5ad1e641d6966b30aa9b" ON "reservation" ("status") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9ca5d72dc47227b20cd1868553" ON "reservation" ("stockLocationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "idx_reservation_active_line_location" ON "reservation" ("orderLineId", "stockLocationId") WHERE "status" = 'active'`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "reservation_reconciliation_issue" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "issueType" character varying NOT NULL, "orderId" character varying NOT NULL, "productVariantId" character varying, "localQuantity" integer, "erpQuantity" integer, "externalProductId" character varying, "orderEntityId" character varying NOT NULL, "detectedAt" TIMESTAMP NOT NULL, "status" character varying NOT NULL DEFAULT 'open', "resolution" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_c359237b40132652c5e83eb2ce3" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0c23377cf5171a1fa487e30dfb" ON "reservation_reconciliation_issue" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "sync_outbox" ("id" BIGSERIAL NOT NULL, "event_id" uuid NOT NULL, "event_type" character varying NOT NULL, "payload" jsonb NOT NULL, "target" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "delivered_at" TIMESTAMP WITH TIME ZONE, "retry_count" integer NOT NULL DEFAULT '0', "last_error" text, "last_error_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_68c2c881108310bbe2d6cd3ed43" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8827448df21d550524d5a0e7cd" ON "sync_outbox" ("event_id") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "sync_outbox_pending" ON "sync_outbox" ("created_at") WHERE "status" = 'pending'`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "sync_processed_event" ("id" BIGSERIAL NOT NULL, "event_id" uuid NOT NULL, "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), CONSTRAINT "PK_834d3189d918f36c8269713d518" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_86b551dfd69492126648006bd7" ON "sync_processed_event" ("event_id") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_cross_reference" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "productId" integer NOT NULL, "oemCode" character varying NOT NULL, "oemBrand" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_f7d042b4fbe4b0933b82e1a3be4" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_fd5f59d4ed9b5ebe4b7d9ed3b9" ON "product_cross_reference" ("productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d2407c76a14f2f23245c146a3b" ON "product_cross_reference" ("oemCode", "oemBrand") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "document" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "type" character varying NOT NULL, "counterpartyId" character varying NOT NULL, "orderId" character varying, "invoiceId" character varying, "number" character varying NOT NULL, "issueDate" TIMESTAMP NOT NULL, "amount" bigint, "currencyCode" character varying, "status" character varying NOT NULL DEFAULT 'pending', "source" character varying NOT NULL, "assetId" character varying, "fileUrl" character varying, "erpId" character varying, "metadata" text, "id" SERIAL NOT NULL, CONSTRAINT "PK_e57d3357f83f3cdc0acffc3d777" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_document_erp_id" ON "document" ("erpId") WHERE "erpId" IS NOT NULL`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_3b5978e0e869f923200e2e3239" ON "document" ("counterpartyId", "issueDate") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "organization_requisites" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "legalName" character varying NOT NULL, "inn" character varying, "kpp" character varying, "ogrn" character varying, "legalAddress" character varying, "bankName" character varying, "bankAccount" character varying, "bankBik" character varying, "correspondentAccount" character varying, "signatoryName" character varying, "signatoryTitle" character varying, "isActive" boolean NOT NULL DEFAULT true, "logoAssetId" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_7925f916ab0eba9a0ef38565743" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_e25a21121eeca43d77fd25166e" ON "organization_requisites" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "erp_import_run_error" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "recordIndex" integer NOT NULL, "message" text NOT NULL, "runId" uuid, CONSTRAINT "PK_dd7bbf4af39c2019bb7b283d3b0" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "erp_import_run" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "exchangeId" character varying NOT NULL, "status" character varying NOT NULL, "total" integer NOT NULL DEFAULT '0', "processed" integer NOT NULL DEFAULT '0', "failed" integer NOT NULL DEFAULT '0', "payload" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "finishedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_0514bb50f3b08719eba2ce79c0a" UNIQUE ("exchangeId"), CONSTRAINT "PK_5368c02b7b726161b318a7de53c" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "integration_outbox" ("id" BIGSERIAL NOT NULL, "event_id" uuid NOT NULL, "event_type" character varying NOT NULL, "payload" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, "retry_count" integer NOT NULL DEFAULT '0', "last_error" text, "last_error_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_0807cd3d14577a948b136b138b3" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_d82bcc0a416ff41297dd733d5b" ON "integration_outbox" ("event_id") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "integration_outbox_pending" ON "integration_outbox" ("created_at") WHERE "status" = 'pending'`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "integration_inbox_event" ("id" BIGSERIAL NOT NULL, "stream" character varying NOT NULL, "entity_id" character varying NOT NULL, "version" character varying NOT NULL, "source_event_id" character varying NOT NULL, "payload" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "last_error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "processed_at" TIMESTAMP WITH TIME ZONE, "next_retry_at" TIMESTAMP WITH TIME ZONE, "first_failed_at" TIMESTAMP WITH TIME ZONE, "eligible_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7fa1e320e4bef76e6ace49c8e81" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "integration_inbox_event_entity" ON "integration_inbox_event" ("stream", "entity_id", "status") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "integration_inbox_event_claim" ON "integration_inbox_event" ("stream", "status", "eligible_at") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "integration_inbox_event_dedup" ON "integration_inbox_event" ("stream", "source_event_id") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "kafka_consumer_status" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "key" character varying NOT NULL, "connected" boolean NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "UQ_f10d9f94dc410d2d73f9fa38db3" UNIQUE ("key"), CONSTRAINT "PK_3cd744dadd3f27b9296cf00d78a" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "kafka_consumer_lag_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "topic" character varying NOT NULL, "stream" character varying NOT NULL, "partition" integer NOT NULL, "committedOffset" character varying, "endOffset" character varying NOT NULL, "lag" character varying, "polledAt" TIMESTAMP NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_37c1590027c664dc5a37f7496e5" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_b77b09d9ba8d6b1c7cedf6af59" ON "kafka_consumer_lag_entry" ("topic", "partition") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_tax_code_flag" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "externalProductId" character varying NOT NULL, "rawVatCode" character varying NOT NULL, "reason" character varying NOT NULL, "detail" character varying NOT NULL, "detectedAt" TIMESTAMP NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_cc87fee0c01572eb7f4af5cad2e" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e7f6cd4c5af730654c7010a023" ON "product_tax_code_flag" ("externalProductId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_category_flag" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "externalProductId" character varying NOT NULL, "rawCategoryId" character varying, "reason" character varying NOT NULL, "detail" character varying NOT NULL, "detectedAt" TIMESTAMP NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_7d59333b28408dfd33d0b23655b" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a2e6f4ad6793ab42b559f79b80" ON "product_category_flag" ("externalProductId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "manufacturer" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "externalId" character varying NOT NULL, "name" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_81fc5abca8ed2f6edc79b375eeb" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_e94aa5412093808617fdc1725c" ON "manufacturer" ("externalId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant_barcode" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "productVariantId" character varying NOT NULL, "code" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_743212fdee4b70d4020de76941b" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_3c164e99bc87f98c3e48802416" ON "product_variant_barcode" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_7f760d3491a3950fb56f4510f0" ON "product_variant_barcode" ("productVariantId", "code") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_characteristic" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "productId" character varying NOT NULL, "group" character varying NOT NULL, "key" character varying NOT NULL, "rawValue" character varying, "normalizedValue" text, "structuredJson" text, "id" SERIAL NOT NULL, CONSTRAINT "PK_c04dc21acc7e299b94b08b5ebcf" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0c1dd92856c04a6d29628fb42e" ON "product_characteristic" ("productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_868946c079cbd1eab658832114" ON "product_characteristic" ("productId", "group", "key") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_manufacturer_code" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "productId" character varying NOT NULL, "lineNumber" integer NOT NULL, "code" character varying NOT NULL, "manufacturer" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_ebc11a5a41a58b985c9f898cb86" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_8d2d4f305d32e0c4c11171a7fe" ON "product_manufacturer_code" ("productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "erp_reconciliation_issue" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "issueType" character varying NOT NULL, "aggregateType" character varying NOT NULL, "ourCount" integer NOT NULL, "theirActiveCount" integer NOT NULL, "detectedAt" TIMESTAMP NOT NULL, "status" character varying NOT NULL DEFAULT 'open', "resolution" character varying, "triggeredBy" character varying NOT NULL, "triggeredByAdministratorId" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_0ae9bdde2fa1c3e312bcab31e2d" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_21380e4e80fdbc7ef4451e0a09" ON "erp_reconciliation_issue" ("aggregateType") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "saved_table_view" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "administratorId" character varying NOT NULL, "pageKey" character varying NOT NULL, "name" character varying NOT NULL, "filters" text NOT NULL, "visibleColumns" text NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_7099c048193d8a70b2c2c5d39df" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0453022485bc85ad49fc616be0" ON "saved_table_view" ("administratorId", "pageKey") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "collection_product_variants_product_variant" ("collectionId" integer NOT NULL, "productVariantId" integer NOT NULL, CONSTRAINT "PK_50c5ed0504ded53967be811f633" PRIMARY KEY ("collectionId", "productVariantId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_6faa7b72422d9c4679e2f186ad" ON "collection_product_variants_product_variant" ("collectionId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_fb05887e2867365f236d7dd95e" ON "collection_product_variants_product_variant" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "collection_channels_channel" ("collectionId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_0e292d80228c9b4a114d2b09476" PRIMARY KEY ("collectionId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cdbf33ffb5d451916125152008" ON "collection_channels_channel" ("collectionId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7216ab24077cf5cbece7857dbb" ON "collection_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "facet_channels_channel" ("facetId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_df0579886093b2f830c159adfde" PRIMARY KEY ("facetId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_ca796020c6d097e251e5d6d2b0" ON "facet_channels_channel" ("facetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_2a8ea404d05bf682516184db7d" ON "facet_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "facet_value_channels_channel" ("facetValueId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_653fb72a256f100f52c573e419f" PRIMARY KEY ("facetValueId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_ad690c1b05596d7f52e52ffeed" ON "facet_value_channels_channel" ("facetValueId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e1d54c0b9db3e2eb17faaf5919" ON "facet_value_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_option_channels_channel" ("productOptionId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_be681a3bd2f92f17d084fa4375a" PRIMARY KEY ("productOptionId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_8dbe001861ca34ae8b687e6bae" ON "product_option_channels_channel" ("productOptionId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_717e7792b8f31c319b6c7b8135" ON "product_option_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_option_group_channels_channel" ("productOptionGroupId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_ddad9696c49ebbc8032caf76fe3" PRIMARY KEY ("productOptionGroupId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_4fbe6303db2827370c0ec2d027" ON "product_option_group_channels_channel" ("productOptionGroupId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d689965b8c58ebf316fce60fab" ON "product_option_group_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_option_groups_product_option_group" ("productId" integer NOT NULL, "productOptionGroupId" integer NOT NULL, CONSTRAINT "PK_6a7a0291e226fbb0d4df828a483" PRIMARY KEY ("productId", "productOptionGroupId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9148fe2c2fd83f5b59d391088c" ON "product_option_groups_product_option_group" ("productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9b03a92219b0684dbd4403e624" ON "product_option_groups_product_option_group" ("productOptionGroupId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_facet_values_facet_value" ("productId" integer NOT NULL, "facetValueId" integer NOT NULL, CONSTRAINT "PK_d57f06b38805181019d75662aa6" PRIMARY KEY ("productId", "facetValueId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_6a0558e650d75ae639ff38e413" ON "product_facet_values_facet_value" ("productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_06e7d73673ee630e8ec50d0b29" ON "product_facet_values_facet_value" ("facetValueId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_channels_channel" ("productId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_722acbcc06403e693b518d2c345" PRIMARY KEY ("productId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_26d12be3b5fec6c4adb1d79284" ON "product_channels_channel" ("productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a51dfbd87c330c075c39832b6e" ON "product_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "asset_tags_tag" ("assetId" integer NOT NULL, "tagId" integer NOT NULL, CONSTRAINT "PK_c4113b84381e953901fa5553654" PRIMARY KEY ("assetId", "tagId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9e412b00d4c6cee1a4b3d92071" ON "asset_tags_tag" ("assetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_fb5e800171ffbe9823f2cc727f" ON "asset_tags_tag" ("tagId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "asset_channels_channel" ("assetId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_d943908a39e32952e8425d2f1ba" PRIMARY KEY ("assetId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_dc4e7435f9f5e9e6436bebd33b" ON "asset_channels_channel" ("assetId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_16ca9151a5153f1169da5b7b7e" ON "asset_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "promotion_channels_channel" ("promotionId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_4b34f9b7bf95a8d3dc7f7f6dd23" PRIMARY KEY ("promotionId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_6d9e2c39ab12391aaa374bcdaa" ON "promotion_channels_channel" ("promotionId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0eaaf0f4b6c69afde1e88ffb52" ON "promotion_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "shipping_method_channels_channel" ("shippingMethodId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_c92b2b226a6ee87888d8dcd8bd6" PRIMARY KEY ("shippingMethodId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_f0a17b94aa5a162f0d422920eb" ON "shipping_method_channels_channel" ("shippingMethodId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_f2b98dfb56685147bed509acc3" ON "shipping_method_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "order_promotions_promotion" ("orderId" integer NOT NULL, "promotionId" integer NOT NULL, CONSTRAINT "PK_001dfe7435f3946fbc2d66a4e92" PRIMARY KEY ("orderId", "promotionId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_67be0e40122ab30a62a9817efe" ON "order_promotions_promotion" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_2c26b988769c0e3b0120bdef31" ON "order_promotions_promotion" ("promotionId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "order_fulfillments_fulfillment" ("orderId" integer NOT NULL, "fulfillmentId" integer NOT NULL, CONSTRAINT "PK_414600087d71aee1583bc517590" PRIMARY KEY ("orderId", "fulfillmentId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_f80d84d525af2ffe974e7e8ca2" ON "order_fulfillments_fulfillment" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_4add5a5796e1582dec2877b289" ON "order_fulfillments_fulfillment" ("fulfillmentId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "order_channels_channel" ("orderId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_39853134b20afe9dfb25de18292" PRIMARY KEY ("orderId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0d8e5c204480204a60e151e485" ON "order_channels_channel" ("orderId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d0d16db872499e83b15999f8c7" ON "order_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "stock_location_channels_channel" ("stockLocationId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_e6f8b2d61ff58c51505c38da8a0" PRIMARY KEY ("stockLocationId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_39513fd02a573c848d23bee587" ON "stock_location_channels_channel" ("stockLocationId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_ff8150fe54e56a900d5712671a" ON "stock_location_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant_options_product_option" ("productVariantId" integer NOT NULL, "productOptionId" integer NOT NULL, CONSTRAINT "PK_c57de5cb6bb74504180604a00c0" PRIMARY KEY ("productVariantId", "productOptionId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_526f0131260eec308a3bd2b61b" ON "product_variant_options_product_option" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e96a71affe63c97f7fa2f076da" ON "product_variant_options_product_option" ("productOptionId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant_facet_values_facet_value" ("productVariantId" integer NOT NULL, "facetValueId" integer NOT NULL, CONSTRAINT "PK_a28474836b2feeffcef98c806e1" PRIMARY KEY ("productVariantId", "facetValueId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_69567bc225b6bbbd732d6c5455" ON "product_variant_facet_values_facet_value" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0d641b761ed1dce4ef3cd33d55" ON "product_variant_facet_values_facet_value" ("facetValueId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "product_variant_channels_channel" ("productVariantId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_1a10ca648c3d73c0f2b455ae191" PRIMARY KEY ("productVariantId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_beeb2b3cd800e589f2213ae99d" ON "product_variant_channels_channel" ("productVariantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d194bff171b62357688a5d0f55" ON "product_variant_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "zone_members_region" ("zoneId" integer NOT NULL, "regionId" integer NOT NULL, CONSTRAINT "PK_fc4eaa2236c4d4f61db0ae3826f" PRIMARY KEY ("zoneId", "regionId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_433f45158e4e2b2a2f344714b2" ON "zone_members_region" ("zoneId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_b45b65256486a15a104e17d495" ON "zone_members_region" ("regionId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "role_channels_channel" ("roleId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_6fb9277e9f11bb8a63445c36242" PRIMARY KEY ("roleId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_bfd2a03e9988eda6a9d1176011" ON "role_channels_channel" ("roleId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e09dfee62b158307404202b43a" ON "role_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "user_roles_role" ("userId" integer NOT NULL, "roleId" integer NOT NULL, CONSTRAINT "PK_b47cd6c84ee205ac5a713718292" PRIMARY KEY ("userId", "roleId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_5f9286e6c25594c6b88c108db7" ON "user_roles_role" ("userId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_4be2f7adf862634f5f803d246b" ON "user_roles_role" ("roleId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_groups_customer_group" ("customerId" integer NOT NULL, "customerGroupId" integer NOT NULL, CONSTRAINT "PK_0f902789cba691ce7ebbc9fcaa6" PRIMARY KEY ("customerId", "customerGroupId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_b823a3c8bf3b78d3ed68736485" ON "customer_groups_customer_group" ("customerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_85feea3f0e5e82133605f78db0" ON "customer_groups_customer_group" ("customerGroupId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_channels_channel" ("customerId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_27e2fa538c020889d32a0a784e8" PRIMARY KEY ("customerId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a842c9fe8cd4c8ff31402d172d" ON "customer_channels_channel" ("customerId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_dc9f69207a8867f83b0fd257e3" ON "customer_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "payment_method_channels_channel" ("paymentMethodId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_c83e4a201c0402ce5cdb170a9a2" PRIMARY KEY ("paymentMethodId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_5bcb569635ce5407eb3f264487" ON "payment_method_channels_channel" ("paymentMethodId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_c00e36f667d35031087b382e61" ON "payment_method_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "api_key_channels_channel" ("apiKeyId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_acb0650ccd9b2df593d1b4f1c52" PRIMARY KEY ("apiKeyId", "channelId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_460b1afc096014ca2dc5a5f5aa" ON "api_key_channels_channel" ("apiKeyId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d37be6b22047f56ea87bea795b" ON "api_key_channels_channel" ("channelId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "discount_grant_counterparty" ("discountGrantId" integer NOT NULL, "counterpartyId" integer NOT NULL, CONSTRAINT "PK_623bcd61070385e8d9bc698a01e" PRIMARY KEY ("discountGrantId", "counterpartyId"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_116107eff433410efbb956ef00" ON "discount_grant_counterparty" ("discountGrantId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_379c4d0d80ea629b39161f1784" ON "discount_grant_counterparty" ("counterpartyId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "collection_closure" ("id_ancestor" integer NOT NULL, "id_descendant" integer NOT NULL, CONSTRAINT "PK_9dda38e2273a7744b8f655782a5" PRIMARY KEY ("id_ancestor", "id_descendant"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_c309f8cd152bbeaea08491e0c6" ON "collection_closure" ("id_ancestor") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_457784c710f8ac9396010441f6" ON "collection_closure" ("id_descendant") `,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_asset" ADD CONSTRAINT "FK_51da53b26522dc0525762d2de8e" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_asset" ADD CONSTRAINT "FK_1ed9e48dfbf74b5fcbb35d3d686" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_translation" ADD CONSTRAINT "FK_e329f9036210d75caa1d8f2154a" FOREIGN KEY ("baseId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection" ADD CONSTRAINT "FK_7256fef1bb42f1b38156b7449f5" FOREIGN KEY ("featuredAssetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection" ADD CONSTRAINT "FK_4257b61275144db89fa0f5dc059" FOREIGN KEY ("parentId") REFERENCES "collection"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_translation" ADD CONSTRAINT "FK_eaea53f44bf9e97790d38a3d68f" FOREIGN KEY ("baseId") REFERENCES "facet"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_value_translation" ADD CONSTRAINT "FK_3d6e45823b65de808a66cb1423b" FOREIGN KEY ("baseId") REFERENCES "facet_value"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_value" ADD CONSTRAINT "FK_d101dc2265a7341be3d94968c5b" FOREIGN KEY ("facetId") REFERENCES "facet"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_translation" ADD CONSTRAINT "FK_a79a443c1f7841f3851767faa6d" FOREIGN KEY ("baseId") REFERENCES "product_option"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option" ADD CONSTRAINT "FK_a6debf9198e2fbfa006aa10d710" FOREIGN KEY ("groupId") REFERENCES "product_option_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_group_translation" ADD CONSTRAINT "FK_93751abc1451972c02e033b766c" FOREIGN KEY ("baseId") REFERENCES "product_option_group"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_asset" ADD CONSTRAINT "FK_5888ac17b317b93378494a10620" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_asset" ADD CONSTRAINT "FK_0d1294f5c22a56da7845ebab72c" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_translation" ADD CONSTRAINT "FK_7dbc75cb4e8b002620c4dbfdac5" FOREIGN KEY ("baseId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product" ADD CONSTRAINT "FK_91a19e6613534949a4ce6e76ff8" FOREIGN KEY ("featuredAssetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product" ADD CONSTRAINT "FK_cf03de89fb00523966cd77b7099" FOREIGN KEY ("customFieldsManufacturerid") REFERENCES "manufacturer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_translation" ADD CONSTRAINT "FK_4eed4464adef51f53e1c7d80212" FOREIGN KEY ("baseId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line_reference" ADD CONSTRAINT "FK_7d57857922dfc7303604697dbe9" FOREIGN KEY ("orderLineId") REFERENCES "order_line"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line_reference" ADD CONSTRAINT "FK_06b02fb482b188823e419d37bd4" FOREIGN KEY ("fulfillmentId") REFERENCES "fulfillment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line_reference" ADD CONSTRAINT "FK_22b818af8722746fb9f206068c2" FOREIGN KEY ("modificationId") REFERENCES "order_modification"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line_reference" ADD CONSTRAINT "FK_30019aa65b17fe9ee9628931991" FOREIGN KEY ("refundId") REFERENCES "refund"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "refund" ADD CONSTRAINT "FK_1c6932a756108788a361e7d4404" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment" ADD CONSTRAINT "FK_d09d285fe1645cd2f0db811e293" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "surcharge" ADD CONSTRAINT "FK_154eb685f9b629033bd266df7fa" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "surcharge" ADD CONSTRAINT "FK_a49c5271c39cc8174a0535c8088" FOREIGN KEY ("orderModificationId") REFERENCES "order_modification"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_modification" ADD CONSTRAINT "FK_1df5bc14a47ef24d2e681f45598" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_modification" ADD CONSTRAINT "FK_ad2991fa2933ed8b7f86a716338" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_modification" ADD CONSTRAINT "FK_cb66b63b6e97613013795eadbd5" FOREIGN KEY ("refundId") REFERENCES "refund"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "promotion_translation" ADD CONSTRAINT "FK_1cc009e9ab2263a35544064561b" FOREIGN KEY ("baseId") REFERENCES "promotion"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_method_translation" ADD CONSTRAINT "FK_85ec26c71067ebc84adcd98d1a5" FOREIGN KEY ("baseId") REFERENCES "shipping_method"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_line" ADD CONSTRAINT "FK_e2e7642e1e88167c1dfc827fdf3" FOREIGN KEY ("shippingMethodId") REFERENCES "shipping_method"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_line" ADD CONSTRAINT "FK_c9f34a440d490d1b66f6829b86c" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" ADD CONSTRAINT "FK_73a78d7df09541ac5eba620d181" FOREIGN KEY ("aggregateOrderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" ADD CONSTRAINT "FK_124456e637cca7a415897dce659" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_movement" ADD CONSTRAINT "FK_e65ba3882557cab4febb54809bb" FOREIGN KEY ("productVariantId") REFERENCES "product_variant"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_movement" ADD CONSTRAINT "FK_a2fe7172eeae9f1cca86f8f573a" FOREIGN KEY ("stockLocationId") REFERENCES "stock_location"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_movement" ADD CONSTRAINT "FK_d2c8d5fca981cc820131f81aa83" FOREIGN KEY ("orderLineId") REFERENCES "order_line"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD CONSTRAINT "FK_6901d8715f5ebadd764466f7bde" FOREIGN KEY ("sellerChannelId") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD CONSTRAINT "FK_dc9ac68b47da7b62249886affba" FOREIGN KEY ("shippingLineId") REFERENCES "shipping_line"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD CONSTRAINT "FK_cbcd22193eda94668e84d33f185" FOREIGN KEY ("productVariantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD CONSTRAINT "FK_77be94ce9ec6504466179462275" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD CONSTRAINT "FK_9f065453910ea77d4be8e92618f" FOREIGN KEY ("featuredAssetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD CONSTRAINT "FK_239cfca2a55b98b90b6bef2e44f" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_level" ADD CONSTRAINT "FK_9950eae3180f39c71978748bd08" FOREIGN KEY ("productVariantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_level" ADD CONSTRAINT "FK_984c48572468c69661a0b7b0494" FOREIGN KEY ("stockLocationId") REFERENCES "stock_location"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_asset" ADD CONSTRAINT "FK_10b5a2e3dee0e30b1e26c32f5c7" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_asset" ADD CONSTRAINT "FK_fa21412afac15a2304f3eb35feb" FOREIGN KEY ("productVariantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_price" ADD CONSTRAINT "FK_e6126cd268aea6e9b31d89af9ab" FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_translation" ADD CONSTRAINT "FK_420f4d6fb75d38b9dca79bc43b4" FOREIGN KEY ("baseId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" ADD CONSTRAINT "FK_0e6f516053cf982b537836e21cf" FOREIGN KEY ("featuredAssetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" ADD CONSTRAINT "FK_e38dca0d82fd64c7cf8aac8b8ef" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" ADD CONSTRAINT "FK_6e420052844edf3a5506d863ce6" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "region_translation" ADD CONSTRAINT "FK_1afd722b943c81310705fc3e612" FOREIGN KEY ("baseId") REFERENCES "region"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "region" ADD CONSTRAINT "FK_ed0c8098ce6809925a437f42aec" FOREIGN KEY ("parentId") REFERENCES "region"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "tax_rate" ADD CONSTRAINT "FK_7ee3306d7638aa85ca90d672198" FOREIGN KEY ("categoryId") REFERENCES "tax_category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "tax_rate" ADD CONSTRAINT "FK_9872fc7de2f4e532fd3230d1915" FOREIGN KEY ("zoneId") REFERENCES "zone"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "tax_rate" ADD CONSTRAINT "FK_8b5ab52fc8887c1a769b9276caf" FOREIGN KEY ("customerGroupId") REFERENCES "customer_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "authentication_method" ADD CONSTRAINT "FK_00cbe87bc0d4e36758d61bd31d6" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "session" ADD CONSTRAINT "FK_7a75399a4f4ffa48ee02e98c059" FOREIGN KEY ("activeOrderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "session" ADD CONSTRAINT "FK_eb87ef1e234444728138302263b" FOREIGN KEY ("activeChannelId") REFERENCES "channel"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "session" ADD CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer" ADD CONSTRAINT "FK_3f62b42ed23958b120c235f74df" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "address" ADD CONSTRAINT "FK_dc34d382b493ade1f70e834c4d3" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "address" ADD CONSTRAINT "FK_d87215343c3a3a67e6a0b7f3ea9" FOREIGN KEY ("countryId") REFERENCES "region"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "administrator" ADD CONSTRAINT "FK_1966e18ce6a39a82b19204704d7" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method_translation" ADD CONSTRAINT "FK_66187f782a3e71b9e0f5b50b68b" FOREIGN KEY ("baseId") REFERENCES "payment_method"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key_translation" ADD CONSTRAINT "FK_bf45bd67c7b3278d7e1f2f95170" FOREIGN KEY ("baseId") REFERENCES "api_key"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key" ADD CONSTRAINT "FK_74d2236b1de818d00bd3fd01602" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key" ADD CONSTRAINT "FK_277972f4944205eb29127f9bb6c" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "channel" ADD CONSTRAINT "FK_af2116c7e176b6b88dceceeb74b" FOREIGN KEY ("sellerId") REFERENCES "seller"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "channel" ADD CONSTRAINT "FK_afe9f917a1c82b9e9e69f7c6129" FOREIGN KEY ("defaultTaxZoneId") REFERENCES "zone"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "channel" ADD CONSTRAINT "FK_c9ca2f58d4517460435cbd8b4c9" FOREIGN KEY ("defaultShippingZoneId") REFERENCES "zone"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "history_entry" ADD CONSTRAINT "FK_92f8c334ef06275f9586fd01832" FOREIGN KEY ("administratorId") REFERENCES "administrator"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "history_entry" ADD CONSTRAINT "FK_43ac602f839847fdb91101f30ec" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "history_entry" ADD CONSTRAINT "FK_3a05127e67435b4d2332ded7c9e" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_price_type" ADD CONSTRAINT "FK_6f28ae2e918b5c2ca6296da3ee2" FOREIGN KEY ("priceTypeId") REFERENCES "price_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point" ADD CONSTRAINT "FK_6eb39882e4aa74e99fd38a56664" FOREIGN KEY ("counterpartyId") REFERENCES "counterparty"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "contact_person" ADD CONSTRAINT "FK_27a8a7c699f212f1138dc87d44b" FOREIGN KEY ("tradingPointId") REFERENCES "trading_point"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "erp_import_run_error" ADD CONSTRAINT "FK_1a619e26050fcdf6ac12ea8eb05" FOREIGN KEY ("runId") REFERENCES "erp_import_run"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_product_variants_product_variant" ADD CONSTRAINT "FK_6faa7b72422d9c4679e2f186ad1" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_product_variants_product_variant" ADD CONSTRAINT "FK_fb05887e2867365f236d7dd95ee" FOREIGN KEY ("productVariantId") REFERENCES "product_variant"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_channels_channel" ADD CONSTRAINT "FK_cdbf33ffb5d4519161251520083" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_channels_channel" ADD CONSTRAINT "FK_7216ab24077cf5cbece7857dbbd" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_channels_channel" ADD CONSTRAINT "FK_ca796020c6d097e251e5d6d2b02" FOREIGN KEY ("facetId") REFERENCES "facet"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_channels_channel" ADD CONSTRAINT "FK_2a8ea404d05bf682516184db7d3" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_value_channels_channel" ADD CONSTRAINT "FK_ad690c1b05596d7f52e52ffeedd" FOREIGN KEY ("facetValueId") REFERENCES "facet_value"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_value_channels_channel" ADD CONSTRAINT "FK_e1d54c0b9db3e2eb17faaf5919c" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_channels_channel" ADD CONSTRAINT "FK_8dbe001861ca34ae8b687e6baef" FOREIGN KEY ("productOptionId") REFERENCES "product_option"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_channels_channel" ADD CONSTRAINT "FK_717e7792b8f31c319b6c7b81352" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_group_channels_channel" ADD CONSTRAINT "FK_4fbe6303db2827370c0ec2d0276" FOREIGN KEY ("productOptionGroupId") REFERENCES "product_option_group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_group_channels_channel" ADD CONSTRAINT "FK_d689965b8c58ebf316fce60fab2" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_groups_product_option_group" ADD CONSTRAINT "FK_9148fe2c2fd83f5b59d391088c5" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_groups_product_option_group" ADD CONSTRAINT "FK_9b03a92219b0684dbd4403e6246" FOREIGN KEY ("productOptionGroupId") REFERENCES "product_option_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_facet_values_facet_value" ADD CONSTRAINT "FK_6a0558e650d75ae639ff38e413a" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_facet_values_facet_value" ADD CONSTRAINT "FK_06e7d73673ee630e8ec50d0b29f" FOREIGN KEY ("facetValueId") REFERENCES "facet_value"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_channels_channel" ADD CONSTRAINT "FK_26d12be3b5fec6c4adb1d792844" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_channels_channel" ADD CONSTRAINT "FK_a51dfbd87c330c075c39832b6e7" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_tags_tag" ADD CONSTRAINT "FK_9e412b00d4c6cee1a4b3d920716" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_tags_tag" ADD CONSTRAINT "FK_fb5e800171ffbe9823f2cc727fd" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_channels_channel" ADD CONSTRAINT "FK_dc4e7435f9f5e9e6436bebd33bb" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_channels_channel" ADD CONSTRAINT "FK_16ca9151a5153f1169da5b7b7e3" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "promotion_channels_channel" ADD CONSTRAINT "FK_6d9e2c39ab12391aaa374bcdaa4" FOREIGN KEY ("promotionId") REFERENCES "promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "promotion_channels_channel" ADD CONSTRAINT "FK_0eaaf0f4b6c69afde1e88ffb52d" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_method_channels_channel" ADD CONSTRAINT "FK_f0a17b94aa5a162f0d422920eb2" FOREIGN KEY ("shippingMethodId") REFERENCES "shipping_method"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_method_channels_channel" ADD CONSTRAINT "FK_f2b98dfb56685147bed509acc3d" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_promotions_promotion" ADD CONSTRAINT "FK_67be0e40122ab30a62a9817efe0" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_promotions_promotion" ADD CONSTRAINT "FK_2c26b988769c0e3b0120bdef31b" FOREIGN KEY ("promotionId") REFERENCES "promotion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_fulfillments_fulfillment" ADD CONSTRAINT "FK_f80d84d525af2ffe974e7e8ca29" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_fulfillments_fulfillment" ADD CONSTRAINT "FK_4add5a5796e1582dec2877b2898" FOREIGN KEY ("fulfillmentId") REFERENCES "fulfillment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_channels_channel" ADD CONSTRAINT "FK_0d8e5c204480204a60e151e4853" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_channels_channel" ADD CONSTRAINT "FK_d0d16db872499e83b15999f8c7a" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_location_channels_channel" ADD CONSTRAINT "FK_39513fd02a573c848d23bee587d" FOREIGN KEY ("stockLocationId") REFERENCES "stock_location"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_location_channels_channel" ADD CONSTRAINT "FK_ff8150fe54e56a900d5712671a0" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_options_product_option" ADD CONSTRAINT "FK_526f0131260eec308a3bd2b61b6" FOREIGN KEY ("productVariantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_options_product_option" ADD CONSTRAINT "FK_e96a71affe63c97f7fa2f076dac" FOREIGN KEY ("productOptionId") REFERENCES "product_option"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_facet_values_facet_value" ADD CONSTRAINT "FK_69567bc225b6bbbd732d6c5455b" FOREIGN KEY ("productVariantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_facet_values_facet_value" ADD CONSTRAINT "FK_0d641b761ed1dce4ef3cd33d559" FOREIGN KEY ("facetValueId") REFERENCES "facet_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_channels_channel" ADD CONSTRAINT "FK_beeb2b3cd800e589f2213ae99d6" FOREIGN KEY ("productVariantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_channels_channel" ADD CONSTRAINT "FK_d194bff171b62357688a5d0f559" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "zone_members_region" ADD CONSTRAINT "FK_433f45158e4e2b2a2f344714b22" FOREIGN KEY ("zoneId") REFERENCES "zone"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "zone_members_region" ADD CONSTRAINT "FK_b45b65256486a15a104e17d495c" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "role_channels_channel" ADD CONSTRAINT "FK_bfd2a03e9988eda6a9d11760119" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "role_channels_channel" ADD CONSTRAINT "FK_e09dfee62b158307404202b43a5" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "user_roles_role" ADD CONSTRAINT "FK_5f9286e6c25594c6b88c108db77" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "user_roles_role" ADD CONSTRAINT "FK_4be2f7adf862634f5f803d246b8" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_groups_customer_group" ADD CONSTRAINT "FK_b823a3c8bf3b78d3ed68736485c" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_groups_customer_group" ADD CONSTRAINT "FK_85feea3f0e5e82133605f78db02" FOREIGN KEY ("customerGroupId") REFERENCES "customer_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_channels_channel" ADD CONSTRAINT "FK_a842c9fe8cd4c8ff31402d172d7" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_channels_channel" ADD CONSTRAINT "FK_dc9f69207a8867f83b0fd257e30" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method_channels_channel" ADD CONSTRAINT "FK_5bcb569635ce5407eb3f264487d" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_method"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method_channels_channel" ADD CONSTRAINT "FK_c00e36f667d35031087b382e61b" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key_channels_channel" ADD CONSTRAINT "FK_460b1afc096014ca2dc5a5f5aa9" FOREIGN KEY ("apiKeyId") REFERENCES "api_key"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key_channels_channel" ADD CONSTRAINT "FK_d37be6b22047f56ea87bea795b6" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_grant_counterparty" ADD CONSTRAINT "FK_116107eff433410efbb956ef004" FOREIGN KEY ("discountGrantId") REFERENCES "discount_grant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_grant_counterparty" ADD CONSTRAINT "FK_379c4d0d80ea629b39161f1784b" FOREIGN KEY ("counterpartyId") REFERENCES "counterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_closure" ADD CONSTRAINT "FK_c309f8cd152bbeaea08491e0c66" FOREIGN KEY ("id_ancestor") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_closure" ADD CONSTRAINT "FK_457784c710f8ac9396010441f6c" FOREIGN KEY ("id_descendant") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "collection_closure" DROP CONSTRAINT "FK_457784c710f8ac9396010441f6c"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_closure" DROP CONSTRAINT "FK_c309f8cd152bbeaea08491e0c66"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_grant_counterparty" DROP CONSTRAINT "FK_379c4d0d80ea629b39161f1784b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "discount_grant_counterparty" DROP CONSTRAINT "FK_116107eff433410efbb956ef004"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key_channels_channel" DROP CONSTRAINT "FK_d37be6b22047f56ea87bea795b6"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key_channels_channel" DROP CONSTRAINT "FK_460b1afc096014ca2dc5a5f5aa9"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method_channels_channel" DROP CONSTRAINT "FK_c00e36f667d35031087b382e61b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method_channels_channel" DROP CONSTRAINT "FK_5bcb569635ce5407eb3f264487d"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_channels_channel" DROP CONSTRAINT "FK_dc9f69207a8867f83b0fd257e30"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_channels_channel" DROP CONSTRAINT "FK_a842c9fe8cd4c8ff31402d172d7"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_groups_customer_group" DROP CONSTRAINT "FK_85feea3f0e5e82133605f78db02"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_groups_customer_group" DROP CONSTRAINT "FK_b823a3c8bf3b78d3ed68736485c"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "user_roles_role" DROP CONSTRAINT "FK_4be2f7adf862634f5f803d246b8"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "user_roles_role" DROP CONSTRAINT "FK_5f9286e6c25594c6b88c108db77"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "role_channels_channel" DROP CONSTRAINT "FK_e09dfee62b158307404202b43a5"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "role_channels_channel" DROP CONSTRAINT "FK_bfd2a03e9988eda6a9d11760119"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "zone_members_region" DROP CONSTRAINT "FK_b45b65256486a15a104e17d495c"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "zone_members_region" DROP CONSTRAINT "FK_433f45158e4e2b2a2f344714b22"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_channels_channel" DROP CONSTRAINT "FK_d194bff171b62357688a5d0f559"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_channels_channel" DROP CONSTRAINT "FK_beeb2b3cd800e589f2213ae99d6"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_facet_values_facet_value" DROP CONSTRAINT "FK_0d641b761ed1dce4ef3cd33d559"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_facet_values_facet_value" DROP CONSTRAINT "FK_69567bc225b6bbbd732d6c5455b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_options_product_option" DROP CONSTRAINT "FK_e96a71affe63c97f7fa2f076dac"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_options_product_option" DROP CONSTRAINT "FK_526f0131260eec308a3bd2b61b6"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_location_channels_channel" DROP CONSTRAINT "FK_ff8150fe54e56a900d5712671a0"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_location_channels_channel" DROP CONSTRAINT "FK_39513fd02a573c848d23bee587d"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_channels_channel" DROP CONSTRAINT "FK_d0d16db872499e83b15999f8c7a"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_channels_channel" DROP CONSTRAINT "FK_0d8e5c204480204a60e151e4853"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_fulfillments_fulfillment" DROP CONSTRAINT "FK_4add5a5796e1582dec2877b2898"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_fulfillments_fulfillment" DROP CONSTRAINT "FK_f80d84d525af2ffe974e7e8ca29"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_promotions_promotion" DROP CONSTRAINT "FK_2c26b988769c0e3b0120bdef31b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_promotions_promotion" DROP CONSTRAINT "FK_67be0e40122ab30a62a9817efe0"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_method_channels_channel" DROP CONSTRAINT "FK_f2b98dfb56685147bed509acc3d"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_method_channels_channel" DROP CONSTRAINT "FK_f0a17b94aa5a162f0d422920eb2"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "promotion_channels_channel" DROP CONSTRAINT "FK_0eaaf0f4b6c69afde1e88ffb52d"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "promotion_channels_channel" DROP CONSTRAINT "FK_6d9e2c39ab12391aaa374bcdaa4"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_channels_channel" DROP CONSTRAINT "FK_16ca9151a5153f1169da5b7b7e3"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_channels_channel" DROP CONSTRAINT "FK_dc4e7435f9f5e9e6436bebd33bb"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_tags_tag" DROP CONSTRAINT "FK_fb5e800171ffbe9823f2cc727fd"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_tags_tag" DROP CONSTRAINT "FK_9e412b00d4c6cee1a4b3d920716"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_channels_channel" DROP CONSTRAINT "FK_a51dfbd87c330c075c39832b6e7"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_channels_channel" DROP CONSTRAINT "FK_26d12be3b5fec6c4adb1d792844"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_facet_values_facet_value" DROP CONSTRAINT "FK_06e7d73673ee630e8ec50d0b29f"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_facet_values_facet_value" DROP CONSTRAINT "FK_6a0558e650d75ae639ff38e413a"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_groups_product_option_group" DROP CONSTRAINT "FK_9b03a92219b0684dbd4403e6246"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_groups_product_option_group" DROP CONSTRAINT "FK_9148fe2c2fd83f5b59d391088c5"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_group_channels_channel" DROP CONSTRAINT "FK_d689965b8c58ebf316fce60fab2"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_group_channels_channel" DROP CONSTRAINT "FK_4fbe6303db2827370c0ec2d0276"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_channels_channel" DROP CONSTRAINT "FK_717e7792b8f31c319b6c7b81352"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_channels_channel" DROP CONSTRAINT "FK_8dbe001861ca34ae8b687e6baef"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_value_channels_channel" DROP CONSTRAINT "FK_e1d54c0b9db3e2eb17faaf5919c"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_value_channels_channel" DROP CONSTRAINT "FK_ad690c1b05596d7f52e52ffeedd"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_channels_channel" DROP CONSTRAINT "FK_2a8ea404d05bf682516184db7d3"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_channels_channel" DROP CONSTRAINT "FK_ca796020c6d097e251e5d6d2b02"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_channels_channel" DROP CONSTRAINT "FK_7216ab24077cf5cbece7857dbbd"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_channels_channel" DROP CONSTRAINT "FK_cdbf33ffb5d4519161251520083"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_product_variants_product_variant" DROP CONSTRAINT "FK_fb05887e2867365f236d7dd95ee"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_product_variants_product_variant" DROP CONSTRAINT "FK_6faa7b72422d9c4679e2f186ad1"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "erp_import_run_error" DROP CONSTRAINT "FK_1a619e26050fcdf6ac12ea8eb05"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "contact_person" DROP CONSTRAINT "FK_27a8a7c699f212f1138dc87d44b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "trading_point" DROP CONSTRAINT "FK_6eb39882e4aa74e99fd38a56664"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_price_type" DROP CONSTRAINT "FK_6f28ae2e918b5c2ca6296da3ee2"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "history_entry" DROP CONSTRAINT "FK_3a05127e67435b4d2332ded7c9e"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "history_entry" DROP CONSTRAINT "FK_43ac602f839847fdb91101f30ec"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "history_entry" DROP CONSTRAINT "FK_92f8c334ef06275f9586fd01832"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "channel" DROP CONSTRAINT "FK_c9ca2f58d4517460435cbd8b4c9"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "channel" DROP CONSTRAINT "FK_afe9f917a1c82b9e9e69f7c6129"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "channel" DROP CONSTRAINT "FK_af2116c7e176b6b88dceceeb74b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key" DROP CONSTRAINT "FK_277972f4944205eb29127f9bb6c"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key" DROP CONSTRAINT "FK_74d2236b1de818d00bd3fd01602"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "api_key_translation" DROP CONSTRAINT "FK_bf45bd67c7b3278d7e1f2f95170"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment_method_translation" DROP CONSTRAINT "FK_66187f782a3e71b9e0f5b50b68b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "administrator" DROP CONSTRAINT "FK_1966e18ce6a39a82b19204704d7"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "address" DROP CONSTRAINT "FK_d87215343c3a3a67e6a0b7f3ea9"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "address" DROP CONSTRAINT "FK_dc34d382b493ade1f70e834c4d3"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "customer" DROP CONSTRAINT "FK_3f62b42ed23958b120c235f74df"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "session" DROP CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "session" DROP CONSTRAINT "FK_eb87ef1e234444728138302263b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "session" DROP CONSTRAINT "FK_7a75399a4f4ffa48ee02e98c059"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "authentication_method" DROP CONSTRAINT "FK_00cbe87bc0d4e36758d61bd31d6"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "tax_rate" DROP CONSTRAINT "FK_8b5ab52fc8887c1a769b9276caf"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "tax_rate" DROP CONSTRAINT "FK_9872fc7de2f4e532fd3230d1915"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "tax_rate" DROP CONSTRAINT "FK_7ee3306d7638aa85ca90d672198"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "region" DROP CONSTRAINT "FK_ed0c8098ce6809925a437f42aec"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "region_translation" DROP CONSTRAINT "FK_1afd722b943c81310705fc3e612"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" DROP CONSTRAINT "FK_6e420052844edf3a5506d863ce6"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" DROP CONSTRAINT "FK_e38dca0d82fd64c7cf8aac8b8ef"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant" DROP CONSTRAINT "FK_0e6f516053cf982b537836e21cf"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_translation" DROP CONSTRAINT "FK_420f4d6fb75d38b9dca79bc43b4"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_price" DROP CONSTRAINT "FK_e6126cd268aea6e9b31d89af9ab"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_asset" DROP CONSTRAINT "FK_fa21412afac15a2304f3eb35feb"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_variant_asset" DROP CONSTRAINT "FK_10b5a2e3dee0e30b1e26c32f5c7"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_level" DROP CONSTRAINT "FK_984c48572468c69661a0b7b0494"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_level" DROP CONSTRAINT "FK_9950eae3180f39c71978748bd08"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" DROP CONSTRAINT "FK_239cfca2a55b98b90b6bef2e44f"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" DROP CONSTRAINT "FK_9f065453910ea77d4be8e92618f"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" DROP CONSTRAINT "FK_77be94ce9ec6504466179462275"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" DROP CONSTRAINT "FK_cbcd22193eda94668e84d33f185"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" DROP CONSTRAINT "FK_dc9ac68b47da7b62249886affba"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" DROP CONSTRAINT "FK_6901d8715f5ebadd764466f7bde"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_movement" DROP CONSTRAINT "FK_d2c8d5fca981cc820131f81aa83"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_movement" DROP CONSTRAINT "FK_a2fe7172eeae9f1cca86f8f573a"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "stock_movement" DROP CONSTRAINT "FK_e65ba3882557cab4febb54809bb"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP CONSTRAINT "FK_124456e637cca7a415897dce659"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP CONSTRAINT "FK_73a78d7df09541ac5eba620d181"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_line" DROP CONSTRAINT "FK_c9f34a440d490d1b66f6829b86c"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_line" DROP CONSTRAINT "FK_e2e7642e1e88167c1dfc827fdf3"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "shipping_method_translation" DROP CONSTRAINT "FK_85ec26c71067ebc84adcd98d1a5"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "promotion_translation" DROP CONSTRAINT "FK_1cc009e9ab2263a35544064561b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_modification" DROP CONSTRAINT "FK_cb66b63b6e97613013795eadbd5"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_modification" DROP CONSTRAINT "FK_ad2991fa2933ed8b7f86a716338"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_modification" DROP CONSTRAINT "FK_1df5bc14a47ef24d2e681f45598"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "surcharge" DROP CONSTRAINT "FK_a49c5271c39cc8174a0535c8088"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "surcharge" DROP CONSTRAINT "FK_154eb685f9b629033bd266df7fa"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "payment" DROP CONSTRAINT "FK_d09d285fe1645cd2f0db811e293"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "refund" DROP CONSTRAINT "FK_1c6932a756108788a361e7d4404"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line_reference" DROP CONSTRAINT "FK_30019aa65b17fe9ee9628931991"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line_reference" DROP CONSTRAINT "FK_22b818af8722746fb9f206068c2"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line_reference" DROP CONSTRAINT "FK_06b02fb482b188823e419d37bd4"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line_reference" DROP CONSTRAINT "FK_7d57857922dfc7303604697dbe9"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "asset_translation" DROP CONSTRAINT "FK_4eed4464adef51f53e1c7d80212"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product" DROP CONSTRAINT "FK_cf03de89fb00523966cd77b7099"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product" DROP CONSTRAINT "FK_91a19e6613534949a4ce6e76ff8"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_translation" DROP CONSTRAINT "FK_7dbc75cb4e8b002620c4dbfdac5"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_asset" DROP CONSTRAINT "FK_0d1294f5c22a56da7845ebab72c"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_asset" DROP CONSTRAINT "FK_5888ac17b317b93378494a10620"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_group_translation" DROP CONSTRAINT "FK_93751abc1451972c02e033b766c"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option" DROP CONSTRAINT "FK_a6debf9198e2fbfa006aa10d710"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "product_option_translation" DROP CONSTRAINT "FK_a79a443c1f7841f3851767faa6d"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_value" DROP CONSTRAINT "FK_d101dc2265a7341be3d94968c5b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_value_translation" DROP CONSTRAINT "FK_3d6e45823b65de808a66cb1423b"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "facet_translation" DROP CONSTRAINT "FK_eaea53f44bf9e97790d38a3d68f"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection" DROP CONSTRAINT "FK_4257b61275144db89fa0f5dc059"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection" DROP CONSTRAINT "FK_7256fef1bb42f1b38156b7449f5"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_translation" DROP CONSTRAINT "FK_e329f9036210d75caa1d8f2154a"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_asset" DROP CONSTRAINT "FK_1ed9e48dfbf74b5fcbb35d3d686"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "collection_asset" DROP CONSTRAINT "FK_51da53b26522dc0525762d2de8e"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_457784c710f8ac9396010441f6"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_c309f8cd152bbeaea08491e0c6"`, undefined);
        await queryRunner.query(`DROP TABLE "collection_closure"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_379c4d0d80ea629b39161f1784"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_116107eff433410efbb956ef00"`, undefined);
        await queryRunner.query(`DROP TABLE "discount_grant_counterparty"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d37be6b22047f56ea87bea795b"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_460b1afc096014ca2dc5a5f5aa"`, undefined);
        await queryRunner.query(`DROP TABLE "api_key_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_c00e36f667d35031087b382e61"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_5bcb569635ce5407eb3f264487"`, undefined);
        await queryRunner.query(`DROP TABLE "payment_method_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc9f69207a8867f83b0fd257e3"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a842c9fe8cd4c8ff31402d172d"`, undefined);
        await queryRunner.query(`DROP TABLE "customer_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_85feea3f0e5e82133605f78db0"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_b823a3c8bf3b78d3ed68736485"`, undefined);
        await queryRunner.query(`DROP TABLE "customer_groups_customer_group"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4be2f7adf862634f5f803d246b"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_5f9286e6c25594c6b88c108db7"`, undefined);
        await queryRunner.query(`DROP TABLE "user_roles_role"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e09dfee62b158307404202b43a"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_bfd2a03e9988eda6a9d1176011"`, undefined);
        await queryRunner.query(`DROP TABLE "role_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_b45b65256486a15a104e17d495"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_433f45158e4e2b2a2f344714b2"`, undefined);
        await queryRunner.query(`DROP TABLE "zone_members_region"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d194bff171b62357688a5d0f55"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_beeb2b3cd800e589f2213ae99d"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0d641b761ed1dce4ef3cd33d55"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_69567bc225b6bbbd732d6c5455"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant_facet_values_facet_value"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e96a71affe63c97f7fa2f076da"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_526f0131260eec308a3bd2b61b"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant_options_product_option"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff8150fe54e56a900d5712671a"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_39513fd02a573c848d23bee587"`, undefined);
        await queryRunner.query(`DROP TABLE "stock_location_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d0d16db872499e83b15999f8c7"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0d8e5c204480204a60e151e485"`, undefined);
        await queryRunner.query(`DROP TABLE "order_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4add5a5796e1582dec2877b289"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f80d84d525af2ffe974e7e8ca2"`, undefined);
        await queryRunner.query(`DROP TABLE "order_fulfillments_fulfillment"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_2c26b988769c0e3b0120bdef31"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_67be0e40122ab30a62a9817efe"`, undefined);
        await queryRunner.query(`DROP TABLE "order_promotions_promotion"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f2b98dfb56685147bed509acc3"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0a17b94aa5a162f0d422920eb"`, undefined);
        await queryRunner.query(`DROP TABLE "shipping_method_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0eaaf0f4b6c69afde1e88ffb52"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_6d9e2c39ab12391aaa374bcdaa"`, undefined);
        await queryRunner.query(`DROP TABLE "promotion_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_16ca9151a5153f1169da5b7b7e"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc4e7435f9f5e9e6436bebd33b"`, undefined);
        await queryRunner.query(`DROP TABLE "asset_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_fb5e800171ffbe9823f2cc727f"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9e412b00d4c6cee1a4b3d92071"`, undefined);
        await queryRunner.query(`DROP TABLE "asset_tags_tag"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a51dfbd87c330c075c39832b6e"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_26d12be3b5fec6c4adb1d79284"`, undefined);
        await queryRunner.query(`DROP TABLE "product_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_06e7d73673ee630e8ec50d0b29"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_6a0558e650d75ae639ff38e413"`, undefined);
        await queryRunner.query(`DROP TABLE "product_facet_values_facet_value"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9b03a92219b0684dbd4403e624"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9148fe2c2fd83f5b59d391088c"`, undefined);
        await queryRunner.query(
            `DROP TABLE "product_option_groups_product_option_group"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_d689965b8c58ebf316fce60fab"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4fbe6303db2827370c0ec2d027"`, undefined);
        await queryRunner.query(`DROP TABLE "product_option_group_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_717e7792b8f31c319b6c7b8135"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8dbe001861ca34ae8b687e6bae"`, undefined);
        await queryRunner.query(`DROP TABLE "product_option_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e1d54c0b9db3e2eb17faaf5919"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_ad690c1b05596d7f52e52ffeed"`, undefined);
        await queryRunner.query(`DROP TABLE "facet_value_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_2a8ea404d05bf682516184db7d"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_ca796020c6d097e251e5d6d2b0"`, undefined);
        await queryRunner.query(`DROP TABLE "facet_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7216ab24077cf5cbece7857dbb"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_cdbf33ffb5d451916125152008"`, undefined);
        await queryRunner.query(`DROP TABLE "collection_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_fb05887e2867365f236d7dd95e"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_6faa7b72422d9c4679e2f186ad"`, undefined);
        await queryRunner.query(
            `DROP TABLE "collection_product_variants_product_variant"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_0453022485bc85ad49fc616be0"`, undefined);
        await queryRunner.query(`DROP TABLE "saved_table_view"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_21380e4e80fdbc7ef4451e0a09"`, undefined);
        await queryRunner.query(`DROP TABLE "erp_reconciliation_issue"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d2d4f305d32e0c4c11171a7fe"`, undefined);
        await queryRunner.query(`DROP TABLE "product_manufacturer_code"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_868946c079cbd1eab658832114"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0c1dd92856c04a6d29628fb42e"`, undefined);
        await queryRunner.query(`DROP TABLE "product_characteristic"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7f760d3491a3950fb56f4510f0"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3c164e99bc87f98c3e48802416"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant_barcode"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e94aa5412093808617fdc1725c"`, undefined);
        await queryRunner.query(`DROP TABLE "manufacturer"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a2e6f4ad6793ab42b559f79b80"`, undefined);
        await queryRunner.query(`DROP TABLE "product_category_flag"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e7f6cd4c5af730654c7010a023"`, undefined);
        await queryRunner.query(`DROP TABLE "product_tax_code_flag"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_b77b09d9ba8d6b1c7cedf6af59"`, undefined);
        await queryRunner.query(`DROP TABLE "kafka_consumer_lag_entry"`, undefined);
        await queryRunner.query(`DROP TABLE "kafka_consumer_status"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."integration_inbox_event_dedup"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."integration_inbox_event_claim"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."integration_inbox_event_entity"`, undefined);
        await queryRunner.query(`DROP TABLE "integration_inbox_event"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."integration_outbox_pending"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d82bcc0a416ff41297dd733d5b"`, undefined);
        await queryRunner.query(`DROP TABLE "integration_outbox"`, undefined);
        await queryRunner.query(`DROP TABLE "erp_import_run"`, undefined);
        await queryRunner.query(`DROP TABLE "erp_import_run_error"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e25a21121eeca43d77fd25166e"`, undefined);
        await queryRunner.query(`DROP TABLE "organization_requisites"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3b5978e0e869f923200e2e3239"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_document_erp_id"`, undefined);
        await queryRunner.query(`DROP TABLE "document"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d2407c76a14f2f23245c146a3b"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd5f59d4ed9b5ebe4b7d9ed3b9"`, undefined);
        await queryRunner.query(`DROP TABLE "product_cross_reference"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_86b551dfd69492126648006bd7"`, undefined);
        await queryRunner.query(`DROP TABLE "sync_processed_event"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."sync_outbox_pending"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8827448df21d550524d5a0e7cd"`, undefined);
        await queryRunner.query(`DROP TABLE "sync_outbox"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0c23377cf5171a1fa487e30dfb"`, undefined);
        await queryRunner.query(`DROP TABLE "reservation_reconciliation_issue"`, undefined);
        await queryRunner.query(
            `DROP INDEX "public"."idx_reservation_active_line_location"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_9ca5d72dc47227b20cd1868553"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_29be1e5ad1e641d6966b30aa9b"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_eaaf97faa1d5dd3b70e58fecf5"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7301aff02b1010e190ca2dda0c"`, undefined);
        await queryRunner.query(`DROP TABLE "reservation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e79794830d54ab5b018c385ce1"`, undefined);
        await queryRunner.query(`DROP TABLE "reservation_extension_limit"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_392b527621f804b4f61b88dd11"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_bd22c1fe7db443df3e4a8272cc"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_419e874af262dc90425c07aeee"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d6b1f1f88c4b3910cb201d3e8"`, undefined);
        await queryRunner.query(`DROP TABLE "settlement_entry"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_cf02cdf12f516041802504ac86"`, undefined);
        await queryRunner.query(`DROP TABLE "payment_refund"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9593bc26747d3059b39597a7d7"`, undefined);
        await queryRunner.query(`DROP TABLE "payment_reconciliation_issue"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_300309a716d3d1ab40eb9b61ec"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_b66aaefe45793b1cf702ea31e1"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4d06e28910804514701004944e"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_c553baf9e321b2a8129d0a4fde"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_58cc3fdfc7e8d39ea8a576a283"`, undefined);
        await queryRunner.query(`DROP TABLE "payment_attempt"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7465d595c3d205a1d09b71cb82"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f6757552bd0776859af91c222c"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_55c734c8f77040ed61ad02c6cd"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_058ef835f99e28fc6717cd7c80"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_60284980bc8b9c624459948f4a"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f494ce6746b91e9ec9562af485"`, undefined);
        await queryRunner.query(`DROP TABLE "invoice"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_ffe685c2c912a1c18fb042860b"`, undefined);
        await queryRunner.query(`DROP TABLE "incoming_payment_event"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_6b398b47f3b0784bd1ab4ec72a"`, undefined);
        await queryRunner.query(`DROP TABLE "idempotency_key"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a5c0d043023c44840a3b0cba4a"`, undefined);
        await queryRunner.query(`DROP TABLE "fiscal_receipt"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_b51bd583c5b118a7c41d2f5e1c"`, undefined);
        await queryRunner.query(`DROP TABLE "dispute"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_6739de972b5240cf3d6d17f308"`, undefined);
        await queryRunner.query(`DROP TABLE "notification"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_011d840c7306663a3a105dc3d4"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a90a6bc75195e6cf6d9b310d92"`, undefined);
        await queryRunner.query(`DROP TABLE "discount_registry_entry"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_bce2482501d1de61b878578765"`, undefined);
        await queryRunner.query(`DROP TABLE "discount_grant"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8394fcc3ceb570184a246416fb"`, undefined);
        await queryRunner.query(`DROP TABLE "discount_rule"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_94d191d8ddc46b70764a3ab283"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant_price_entry"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_69659bd4eb021c8ec50c33afe1"`, undefined);
        await queryRunner.query(`DROP TABLE "counterparty_team_member"`, undefined);
        await queryRunner.query(`DROP TABLE "contact_person"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e984c290905c13ce36b05a8774"`, undefined);
        await queryRunner.query(`DROP TABLE "trading_point"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_5390407a260ef711d6153f9246"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_40e5fc5c838b0e5e2e9059aa41"`, undefined);
        await queryRunner.query(`DROP TABLE "counterparty"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_435428677e9c15da12c1658ad2"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_bd34db8e79f95601b3929a338b"`, undefined);
        await queryRunner.query(`DROP TABLE "entity_version"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7ad95dbc3f8b45555cf35b20ea"`, undefined);
        await queryRunner.query(`DROP TABLE "customer_price_type"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_41dbe54e4ccc599d028bbc0d22"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3edf1fe2b3aecfa2d035cc35ae"`, undefined);
        await queryRunner.query(`DROP TABLE "price_type"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_fdb4fbde8137a7166e1b16633a"`, undefined);
        await queryRunner.query(`DROP TABLE "workflow_definition"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4edf66154be106f182678e2d4"`, undefined);
        await queryRunner.query(`DROP TABLE "approval_step"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f8268063f06b79a99660250f2a"`, undefined);
        await queryRunner.query(`DROP TABLE "approval_request"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a6ff8ca6e090ac6c68af88c243"`, undefined);
        await queryRunner.query(`DROP TABLE "warehouse"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_2c6d4388f253a0bf3317eea5f1"`, undefined);
        await queryRunner.query(`DROP TABLE "department"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe3856b4044d184e2727cc4f5c"`, undefined);
        await queryRunner.query(`DROP TABLE "credit_term_limit"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8babe9dc79216a196636937e19"`, undefined);
        await queryRunner.query(`DROP TABLE "branch_settings"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_70e3600cb8f5450ffc38496fd5"`, undefined);
        await queryRunner.query(`DROP TABLE "branch"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0085f89152c53427285572dc51"`, undefined);
        await queryRunner.query(`DROP TABLE "role_access_scope"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_434605d30bf0ded81dd8184264"`, undefined);
        await queryRunner.query(`DROP TABLE "erp_user"`, undefined);
        await queryRunner.query(`DROP TABLE "scheduled_task_record"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_86bc376c56af8cefd41a847a95"`, undefined);
        await queryRunner.query(`DROP TABLE "job_record"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3a05127e67435b4d2332ded7c9"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_43ac602f839847fdb91101f30e"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_92f8c334ef06275f9586fd0183"`, undefined);
        await queryRunner.query(`DROP TABLE "history_entry"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_c9ca2f58d4517460435cbd8b4c"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_afe9f917a1c82b9e9e69f7c612"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_af2116c7e176b6b88dceceeb74"`, undefined);
        await queryRunner.query(`DROP TABLE "channel"`, undefined);
        await queryRunner.query(`DROP TABLE "api_key"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_bf45bd67c7b3278d7e1f2f9517"`, undefined);
        await queryRunner.query(`DROP TABLE "api_key_translation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."settings_store_key_scope_unique"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d8ddb95a0fbd11ffb5606ef0c"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_ab560f7983976aec91b91c26a4"`, undefined);
        await queryRunner.query(`DROP TABLE "settings_store_entry"`, undefined);
        await queryRunner.query(`DROP TABLE "seller"`, undefined);
        await queryRunner.query(`DROP TABLE "payment_method"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_66187f782a3e71b9e0f5b50b68"`, undefined);
        await queryRunner.query(`DROP TABLE "payment_method_translation"`, undefined);
        await queryRunner.query(`DROP TABLE "global_settings"`, undefined);
        await queryRunner.query(`DROP TABLE "administrator"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d87215343c3a3a67e6a0b7f3ea"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc34d382b493ade1f70e834c4d"`, undefined);
        await queryRunner.query(`DROP TABLE "address"`, undefined);
        await queryRunner.query(`DROP TABLE "customer"`, undefined);
        await queryRunner.query(`DROP TABLE "user"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3d2f174ef04fb312fdebd0ddc5"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_eb87ef1e234444728138302263"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7a75399a4f4ffa48ee02e98c05"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_232f8e85d7633bd6ddfad42169"`, undefined);
        await queryRunner.query(`DROP TABLE "session"`, undefined);
        await queryRunner.query(`DROP TABLE "role"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a23445b2c942d8dfcae15b8de2"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_00cbe87bc0d4e36758d61bd31d"`, undefined);
        await queryRunner.query(`DROP TABLE "authentication_method"`, undefined);
        await queryRunner.query(`DROP TABLE "customer_group"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8b5ab52fc8887c1a769b9276ca"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9872fc7de2f4e532fd3230d191"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7ee3306d7638aa85ca90d67219"`, undefined);
        await queryRunner.query(`DROP TABLE "tax_rate"`, undefined);
        await queryRunner.query(`DROP TABLE "zone"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_ed0c8098ce6809925a437f42ae"`, undefined);
        await queryRunner.query(`DROP TABLE "region"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_1afd722b943c81310705fc3e61"`, undefined);
        await queryRunner.query(`DROP TABLE "region_translation"`, undefined);
        await queryRunner.query(`DROP TABLE "tax_category"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_6e420052844edf3a5506d863ce"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e38dca0d82fd64c7cf8aac8b8e"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0e6f516053cf982b537836e21c"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_420f4d6fb75d38b9dca79bc43b"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant_translation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e6126cd268aea6e9b31d89af9a"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant_price"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_fa21412afac15a2304f3eb35fe"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_10b5a2e3dee0e30b1e26c32f5c"`, undefined);
        await queryRunner.query(`DROP TABLE "product_variant_asset"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7fc20486b8cfd33dc84c96e168"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_984c48572468c69661a0b7b049"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9950eae3180f39c71978748bd0"`, undefined);
        await queryRunner.query(`DROP TABLE "stock_level"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_239cfca2a55b98b90b6bef2e44"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9f065453910ea77d4be8e92618"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_77be94ce9ec650446617946227"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_cbcd22193eda94668e84d33f18"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc9ac68b47da7b62249886affb"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_6901d8715f5ebadd764466f7bd"`, undefined);
        await queryRunner.query(`DROP TABLE "order_line"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d2c8d5fca981cc820131f81aa8"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a2fe7172eeae9f1cca86f8f573"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e65ba3882557cab4febb54809b"`, undefined);
        await queryRunner.query(`DROP TABLE "stock_movement"`, undefined);
        await queryRunner.query(`DROP TABLE "stock_location"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_124456e637cca7a415897dce65"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_af13739f4962eab899bdff34be"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_729b3eea7ce540930dbb706949"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_73a78d7df09541ac5eba620d18"`, undefined);
        await queryRunner.query(`DROP TABLE "order"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_c9f34a440d490d1b66f6829b86"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e2e7642e1e88167c1dfc827fdf"`, undefined);
        await queryRunner.query(`DROP TABLE "shipping_line"`, undefined);
        await queryRunner.query(`DROP TABLE "shipping_method"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_85ec26c71067ebc84adcd98d1a"`, undefined);
        await queryRunner.query(`DROP TABLE "shipping_method_translation"`, undefined);
        await queryRunner.query(`DROP TABLE "promotion"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_1cc009e9ab2263a35544064561"`, undefined);
        await queryRunner.query(`DROP TABLE "promotion_translation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_1df5bc14a47ef24d2e681f4559"`, undefined);
        await queryRunner.query(`DROP TABLE "order_modification"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a49c5271c39cc8174a0535c808"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_154eb685f9b629033bd266df7f"`, undefined);
        await queryRunner.query(`DROP TABLE "surcharge"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d09d285fe1645cd2f0db811e29"`, undefined);
        await queryRunner.query(`DROP TABLE "payment"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_1c6932a756108788a361e7d440"`, undefined);
        await queryRunner.query(`DROP TABLE "refund"`, undefined);
        await queryRunner.query(`DROP TABLE "fulfillment"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_49a8632be8cef48b076446b8b9"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_30019aa65b17fe9ee962893199"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_22b818af8722746fb9f206068c"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_06b02fb482b188823e419d37bd"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7d57857922dfc7303604697dbe"`, undefined);
        await queryRunner.query(`DROP TABLE "order_line_reference"`, undefined);
        await queryRunner.query(`DROP TABLE "asset"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4eed4464adef51f53e1c7d8021"`, undefined);
        await queryRunner.query(`DROP TABLE "asset_translation"`, undefined);
        await queryRunner.query(`DROP TABLE "tag"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_91a19e6613534949a4ce6e76ff"`, undefined);
        await queryRunner.query(`DROP TABLE "product"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7dbc75cb4e8b002620c4dbfdac"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f4a2ec16ba86d277b6faa0b67b"`, undefined);
        await queryRunner.query(`DROP TABLE "product_translation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0d1294f5c22a56da7845ebab72"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_5888ac17b317b93378494a1062"`, undefined);
        await queryRunner.query(`DROP TABLE "product_asset"`, undefined);
        await queryRunner.query(`DROP TABLE "product_option_group"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_93751abc1451972c02e033b766"`, undefined);
        await queryRunner.query(`DROP TABLE "product_option_group_translation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a6debf9198e2fbfa006aa10d71"`, undefined);
        await queryRunner.query(`DROP TABLE "product_option"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a79a443c1f7841f3851767faa6"`, undefined);
        await queryRunner.query(`DROP TABLE "product_option_translation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_d101dc2265a7341be3d94968c5"`, undefined);
        await queryRunner.query(`DROP TABLE "facet_value"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3d6e45823b65de808a66cb1423"`, undefined);
        await queryRunner.query(`DROP TABLE "facet_value_translation"`, undefined);
        await queryRunner.query(`DROP TABLE "facet"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_eaea53f44bf9e97790d38a3d68"`, undefined);
        await queryRunner.query(`DROP TABLE "facet_translation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7256fef1bb42f1b38156b7449f"`, undefined);
        await queryRunner.query(`DROP TABLE "collection"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e329f9036210d75caa1d8f2154"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9f9da7d94b0278ea0f7831e1fc"`, undefined);
        await queryRunner.query(`DROP TABLE "collection_translation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_1ed9e48dfbf74b5fcbb35d3d68"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_51da53b26522dc0525762d2de8"`, undefined);
        await queryRunner.query(`DROP TABLE "collection_asset"`, undefined);
    }
}

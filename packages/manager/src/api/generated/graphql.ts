import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
    [_ in K]?: never;
};
export type Incremental<T> =
    | T
    | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
    ID: { input: string; output: string };
    String: { input: string; output: string };
    Boolean: { input: boolean; output: boolean };
    Int: { input: number; output: number };
    Float: { input: number; output: number };
    DateTime: { input: any; output: any };
    JSON: { input: any; output: any };
    Money: { input: any; output: any };
    Upload: { input: any; output: any };
};

export type AddFulfillmentToOrderResult =
    | CreateFulfillmentError
    | EmptyOrderLineSelectionError
    | Fulfillment
    | FulfillmentStateTransitionError
    | InsufficientStockOnHandError
    | InvalidFulfillmentHandlerError
    | ItemsAlreadyFulfilledError;

export type AddItemInput = {
    customFields?: InputMaybe<OrderLineCustomFieldsInput>;
    productVariantId: Scalars['ID']['input'];
    quantity: Scalars['Int']['input'];
};

export type AddItemToDraftOrderInput = {
    customFields?: InputMaybe<OrderLineCustomFieldsInput>;
    productVariantId: Scalars['ID']['input'];
    quantity: Scalars['Int']['input'];
};

export type AddManualPaymentToOrderResult = ManualPaymentStateError | Order;

export type AddNoteToCustomerInput = {
    id: Scalars['ID']['input'];
    isPublic: Scalars['Boolean']['input'];
    note: Scalars['String']['input'];
};

export type AddNoteToOrderInput = {
    id: Scalars['ID']['input'];
    isPublic: Scalars['Boolean']['input'];
    note: Scalars['String']['input'];
};

export type Address = Node & {
    city: Maybe<Scalars['String']['output']>;
    company: Maybe<Scalars['String']['output']>;
    country: Country;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    defaultBillingAddress: Maybe<Scalars['Boolean']['output']>;
    defaultShippingAddress: Maybe<Scalars['Boolean']['output']>;
    fullName: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    phoneNumber: Maybe<Scalars['String']['output']>;
    postalCode: Maybe<Scalars['String']['output']>;
    province: Maybe<Scalars['String']['output']>;
    streetLine1: Scalars['String']['output'];
    streetLine2: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

export type AdjustDraftOrderLineInput = {
    customFields?: InputMaybe<OrderLineCustomFieldsInput>;
    orderLineId: Scalars['ID']['input'];
    quantity: Scalars['Int']['input'];
};

export type Adjustment = {
    adjustmentSource: Scalars['String']['output'];
    amount: Scalars['Money']['output'];
    data: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    type: AdjustmentType;
};

export enum AdjustmentType {
    DistributedOrderPromotion = 'DISTRIBUTED_ORDER_PROMOTION',
    Other = 'OTHER',
    Promotion = 'PROMOTION',
}

export type Administrator = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<AdministratorCustomFields>;
    emailAddress: Scalars['String']['output'];
    firstName: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    lastName: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
    user: User;
};

export type AdministratorCustomFields = {
    branchId: Maybe<Scalars['String']['output']>;
    departmentId: Maybe<Scalars['String']['output']>;
    position: Maybe<Scalars['String']['output']>;
    sourceAdministratorId: Maybe<Scalars['String']['output']>;
};

export type AdministratorFilterParameter = {
    _and?: InputMaybe<Array<AdministratorFilterParameter>>;
    _or?: InputMaybe<Array<AdministratorFilterParameter>>;
    branchId?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    departmentId?: InputMaybe<StringOperators>;
    emailAddress?: InputMaybe<StringOperators>;
    firstName?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    lastName?: InputMaybe<StringOperators>;
    position?: InputMaybe<StringOperators>;
    sourceAdministratorId?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type AdministratorList = PaginatedList & {
    items: Array<Administrator>;
    totalItems: Scalars['Int']['output'];
};

export type AdministratorListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<AdministratorFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<AdministratorSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type AdministratorPaymentInput = {
    metadata?: InputMaybe<Scalars['JSON']['input']>;
    paymentMethod?: InputMaybe<Scalars['String']['input']>;
};

export type AdministratorRefundInput = {
    /**
     * The amount to be refunded to this particular Payment. This was introduced in
     * v2.2.0 as the preferred way to specify the refund amount. The `lines`, `shipping` and `adjustment`
     * fields will be removed in a future version.
     */
    amount?: InputMaybe<Scalars['Money']['input']>;
    paymentId: Scalars['ID']['input'];
    reason?: InputMaybe<Scalars['String']['input']>;
};

export type AdministratorSortParameter = {
    branchId?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    departmentId?: InputMaybe<SortOrder>;
    emailAddress?: InputMaybe<SortOrder>;
    firstName?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    lastName?: InputMaybe<SortOrder>;
    position?: InputMaybe<SortOrder>;
    sourceAdministratorId?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type Allocation = Node &
    StockMovement & {
        createdAt: Scalars['DateTime']['output'];
        customFields: Maybe<Scalars['JSON']['output']>;
        id: Scalars['ID']['output'];
        orderLine: OrderLine;
        productVariant: ProductVariant;
        quantity: Scalars['Int']['output'];
        type: StockMovementType;
        updatedAt: Scalars['DateTime']['output'];
    };

/** Returned if an attempting to refund an OrderItem which has already been refunded */
export type AlreadyRefundedError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    refundId: Scalars['ID']['output'];
};

export type ApiKey = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    /** Helps you identify unused keys */
    lastUsedAt: Maybe<Scalars['DateTime']['output']>;
    /**
     * ID by which we can look up the API-Key.
     * Also helps you identify keys without leaking the underlying secret API-Key.
     */
    lookupId: Scalars['String']['output'];
    /** A descriptive name so you can remind yourself where the API-Key gets used */
    name: Scalars['String']['output'];
    /**
     * Usually the user who created the ApiKey but could also be used as the basis for
     * restricting resolvers to `Permission.Owner` queries for customers for example.
     */
    owner: User;
    translations: Array<ApiKeyTranslation>;
    updatedAt: Scalars['DateTime']['output'];
    /** This is the underlying User which determines the kind of permissions for this API-Key. */
    user: User;
};

export type ApiKeyFilterParameter = {
    _and?: InputMaybe<Array<ApiKeyFilterParameter>>;
    _or?: InputMaybe<Array<ApiKeyFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    /** Helps you identify unused keys */
    lastUsedAt?: InputMaybe<DateOperators>;
    /**
     * ID by which we can look up the API-Key.
     * Also helps you identify keys without leaking the underlying secret API-Key.
     */
    lookupId?: InputMaybe<StringOperators>;
    /** A descriptive name so you can remind yourself where the API-Key gets used */
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type ApiKeyList = PaginatedList & {
    items: Array<ApiKey>;
    totalItems: Scalars['Int']['output'];
};

export type ApiKeyListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ApiKeyFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ApiKeySortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ApiKeySortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    /** Helps you identify unused keys */
    lastUsedAt?: InputMaybe<SortOrder>;
    /**
     * ID by which we can look up the API-Key.
     * Also helps you identify keys without leaking the underlying secret API-Key.
     */
    lookupId?: InputMaybe<SortOrder>;
    /** A descriptive name so you can remind yourself where the API-Key gets used */
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type ApiKeyTranslation = Node & {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    /** A descriptive name so you can remind yourself where the API-Key gets used */
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ApplyCouponCodeResult =
    | CouponCodeExpiredError
    | CouponCodeInvalidError
    | CouponCodeLimitError
    | Order;

export type ApprovalListOptions = {
    requestType?: InputMaybe<Scalars['String']['input']>;
    search?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    status?: InputMaybe<Scalars['String']['input']>;
    statuses?: InputMaybe<Array<Scalars['String']['input']>>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ApprovalRequest = {
    createdAt: Scalars['DateTime']['output'];
    currentStepIndex: Scalars['Int']['output'];
    currentStepRole: Maybe<Scalars['String']['output']>;
    decidedAt: Maybe<Scalars['DateTime']['output']>;
    escalatesTo: Array<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    payload: Scalars['String']['output'];
    requestType: Scalars['String']['output'];
    requestedByAdministratorId: Maybe<Scalars['String']['output']>;
    status: Scalars['String']['output'];
    stepRoles: Array<Scalars['String']['output']>;
    steps: Array<ApprovalStep>;
    totalSteps: Scalars['Int']['output'];
};

export type ApprovalRequestList = {
    items: Array<ApprovalRequest>;
    totalItems: Scalars['Int']['output'];
};

export type ApprovalRequestsSummary = {
    pendingCount: Scalars['Int']['output'];
    recent: Array<ApprovalRequest>;
};

export type ApprovalStep = {
    approverAdministratorId: Maybe<Scalars['String']['output']>;
    comment: Maybe<Scalars['String']['output']>;
    decidedAt: Maybe<Scalars['DateTime']['output']>;
    decision: Maybe<Scalars['String']['output']>;
    escalatedByAdministratorId: Maybe<Scalars['String']['output']>;
    escalatedToAdministratorId: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    requiredRole: Scalars['String']['output'];
    stepIndex: Scalars['Int']['output'];
    wasEscalated: Scalars['Boolean']['output'];
};

export type ApprovalsInbox = {
    allInvolved: ApprovalRequestList;
    awaitingMyDecision: ApprovalRequestList;
};

export type Asset = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    fileSize: Scalars['Int']['output'];
    focalPoint: Maybe<Coordinate>;
    height: Scalars['Int']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    mimeType: Scalars['String']['output'];
    name: Scalars['String']['output'];
    preview: Scalars['String']['output'];
    source: Scalars['String']['output'];
    tags: Array<Tag>;
    translations: Array<AssetTranslation>;
    type: AssetType;
    updatedAt: Scalars['DateTime']['output'];
    width: Scalars['Int']['output'];
};

export type AssetFilterParameter = {
    _and?: InputMaybe<Array<AssetFilterParameter>>;
    _or?: InputMaybe<Array<AssetFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    fileSize?: InputMaybe<NumberOperators>;
    height?: InputMaybe<NumberOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    mimeType?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    preview?: InputMaybe<StringOperators>;
    source?: InputMaybe<StringOperators>;
    type?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
    width?: InputMaybe<NumberOperators>;
};

export type AssetList = PaginatedList & {
    items: Array<Asset>;
    totalItems: Scalars['Int']['output'];
};

export type AssetListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<AssetFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<AssetSortParameter>;
    tags?: InputMaybe<Array<Scalars['String']['input']>>;
    tagsOperator?: InputMaybe<LogicalOperator>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type AssetSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    fileSize?: InputMaybe<SortOrder>;
    height?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    mimeType?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    preview?: InputMaybe<SortOrder>;
    source?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
    width?: InputMaybe<SortOrder>;
};

export type AssetTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type AssetTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

export enum AssetType {
    Binary = 'BINARY',
    Image = 'IMAGE',
    Video = 'VIDEO',
}

export type AssignAssetsToChannelInput = {
    assetIds: Array<Scalars['ID']['input']>;
    channelId: Scalars['ID']['input'];
};

export type AssignCollectionsToChannelInput = {
    channelId: Scalars['ID']['input'];
    collectionIds: Array<Scalars['ID']['input']>;
};

export type AssignFacetsToChannelInput = {
    channelId: Scalars['ID']['input'];
    facetIds: Array<Scalars['ID']['input']>;
};

export type AssignPaymentMethodsToChannelInput = {
    channelId: Scalars['ID']['input'];
    paymentMethodIds: Array<Scalars['ID']['input']>;
};

export type AssignProductOptionGroupsToChannelInput = {
    channelId: Scalars['ID']['input'];
    productOptionGroupIds: Array<Scalars['ID']['input']>;
};

export type AssignProductVariantsToChannelInput = {
    channelId: Scalars['ID']['input'];
    priceFactor?: InputMaybe<Scalars['Float']['input']>;
    productVariantIds: Array<Scalars['ID']['input']>;
};

export type AssignProductsToChannelInput = {
    channelId: Scalars['ID']['input'];
    priceFactor?: InputMaybe<Scalars['Float']['input']>;
    productIds: Array<Scalars['ID']['input']>;
};

export type AssignPromotionsToChannelInput = {
    channelId: Scalars['ID']['input'];
    promotionIds: Array<Scalars['ID']['input']>;
};

export type AssignShippingMethodsToChannelInput = {
    channelId: Scalars['ID']['input'];
    shippingMethodIds: Array<Scalars['ID']['input']>;
};

export type AssignStockLocationsToChannelInput = {
    channelId: Scalars['ID']['input'];
    stockLocationIds: Array<Scalars['ID']['input']>;
};

export type AuthenticationInput = {
    native?: InputMaybe<NativeAuthInput>;
};

export type AuthenticationMethod = Node & {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    strategy: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type AuthenticationResult = CurrentUser | InvalidCredentialsError;

export type BooleanCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

/** Operators for filtering on a list of Boolean fields */
export type BooleanListOperators = {
    inList: Scalars['Boolean']['input'];
};

/** Operators for filtering on a Boolean field */
export type BooleanOperators = {
    eq?: InputMaybe<Scalars['Boolean']['input']>;
    isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type BooleanStructFieldConfig = StructField & {
    description: Maybe<Array<LocalizedString>>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type Branch = {
    erpId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
};

export type BranchSettings = {
    branchId: Scalars['String']['output'];
    defaultPriceTypeId: Scalars['String']['output'];
    defaultWarehouseId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    visiblePriceTypeIds: Maybe<Array<Scalars['String']['output']>>;
    visibleWarehouseIds: Maybe<Array<Scalars['String']['output']>>;
};

/** Returned if an attempting to cancel lines from an Order which is still active */
export type CancelActiveOrderError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    orderState: Scalars['String']['output'];
};

export type CancelOrderInput = {
    /** Specify whether the shipping charges should also be cancelled. Defaults to false */
    cancelShipping?: InputMaybe<Scalars['Boolean']['input']>;
    /** Optionally specify which OrderLines to cancel. If not provided, all OrderLines will be cancelled */
    lines?: InputMaybe<Array<OrderLineInput>>;
    /** The id of the order to be cancelled */
    orderId: Scalars['ID']['input'];
    reason?: InputMaybe<Scalars['String']['input']>;
};

export type CancelOrderResult =
    | CancelActiveOrderError
    | EmptyOrderLineSelectionError
    | MultipleOrderError
    | Order
    | OrderStateTransitionError
    | QuantityTooGreatError;

/** Returned if the Payment cancellation fails */
export type CancelPaymentError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    paymentErrorMessage: Scalars['String']['output'];
};

export type CancelPaymentResult = CancelPaymentError | Payment | PaymentStateTransitionError;

export type Cancellation = Node &
    StockMovement & {
        createdAt: Scalars['DateTime']['output'];
        customFields: Maybe<Scalars['JSON']['output']>;
        id: Scalars['ID']['output'];
        orderLine: OrderLine;
        productVariant: ProductVariant;
        quantity: Scalars['Int']['output'];
        type: StockMovementType;
        updatedAt: Scalars['DateTime']['output'];
    };

export type Channel = Node & {
    availableCurrencyCodes: Array<CurrencyCode>;
    availableLanguageCodes: Maybe<Array<LanguageCode>>;
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    /** @deprecated Use defaultCurrencyCode instead */
    currencyCode: CurrencyCode;
    customFields: Maybe<Scalars['JSON']['output']>;
    defaultCurrencyCode: CurrencyCode;
    defaultLanguageCode: LanguageCode;
    defaultShippingZone: Maybe<Zone>;
    defaultTaxZone: Maybe<Zone>;
    id: Scalars['ID']['output'];
    /** Not yet used - will be implemented in a future release. */
    outOfStockThreshold: Maybe<Scalars['Int']['output']>;
    pricesIncludeTax: Scalars['Boolean']['output'];
    seller: Maybe<Seller>;
    token: Scalars['String']['output'];
    /** Not yet used - will be implemented in a future release. */
    trackInventory: Maybe<Scalars['Boolean']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

/**
 * Returned when the default LanguageCode of a Channel is no longer found in the `availableLanguages`
 * of the GlobalSettings
 */
export type ChannelDefaultLanguageError = ErrorResult & {
    channelCode: Scalars['String']['output'];
    errorCode: ErrorCode;
    language: Scalars['String']['output'];
    message: Scalars['String']['output'];
};

export type ChannelFilterParameter = {
    _and?: InputMaybe<Array<ChannelFilterParameter>>;
    _or?: InputMaybe<Array<ChannelFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    currencyCode?: InputMaybe<StringOperators>;
    defaultCurrencyCode?: InputMaybe<StringOperators>;
    defaultLanguageCode?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    /** Not yet used - will be implemented in a future release. */
    outOfStockThreshold?: InputMaybe<NumberOperators>;
    pricesIncludeTax?: InputMaybe<BooleanOperators>;
    token?: InputMaybe<StringOperators>;
    /** Not yet used - will be implemented in a future release. */
    trackInventory?: InputMaybe<BooleanOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type ChannelList = PaginatedList & {
    items: Array<Channel>;
    totalItems: Scalars['Int']['output'];
};

export type ChannelListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ChannelFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ChannelSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ChannelSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    /** Not yet used - will be implemented in a future release. */
    outOfStockThreshold?: InputMaybe<SortOrder>;
    token?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type Collection = Node & {
    assets: Array<Asset>;
    breadcrumbs: Array<CollectionBreadcrumb>;
    children: Maybe<Array<Collection>>;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    featuredAsset: Maybe<Asset>;
    filters: Array<ConfigurableOperation>;
    id: Scalars['ID']['output'];
    inheritFilters: Scalars['Boolean']['output'];
    isPrivate: Scalars['Boolean']['output'];
    languageCode: Maybe<LanguageCode>;
    name: Scalars['String']['output'];
    parent: Maybe<Collection>;
    parentId: Scalars['ID']['output'];
    position: Scalars['Int']['output'];
    productVariantCount: Scalars['Int']['output'];
    productVariants: ProductVariantList;
    slug: Scalars['String']['output'];
    translations: Array<CollectionTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type CollectionProductVariantsArgs = {
    options?: InputMaybe<ProductVariantListOptions>;
};

export type CollectionBreadcrumb = {
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    slug: Scalars['String']['output'];
};

export type CollectionFilterParameter = {
    _and?: InputMaybe<Array<CollectionFilterParameter>>;
    _or?: InputMaybe<Array<CollectionFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    description?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    inheritFilters?: InputMaybe<BooleanOperators>;
    isPrivate?: InputMaybe<BooleanOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    parentId?: InputMaybe<IdOperators>;
    position?: InputMaybe<NumberOperators>;
    productVariantCount?: InputMaybe<NumberOperators>;
    slug?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type CollectionList = PaginatedList & {
    items: Array<Collection>;
    totalItems: Scalars['Int']['output'];
};

export type CollectionListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<CollectionFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<CollectionSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
    topLevelOnly?: InputMaybe<Scalars['Boolean']['input']>;
};

/**
 * Which Collections are present in the products returned
 * by the search, and in what quantity.
 */
export type CollectionResult = {
    collection: Collection;
    count: Scalars['Int']['output'];
};

export type CollectionSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    description?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    parentId?: InputMaybe<SortOrder>;
    position?: InputMaybe<SortOrder>;
    productVariantCount?: InputMaybe<SortOrder>;
    slug?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type CollectionTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    slug: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ConfigArg = {
    name: Scalars['String']['output'];
    value: Scalars['String']['output'];
};

export type ConfigArgDefinition = {
    defaultValue: Maybe<Scalars['JSON']['output']>;
    description: Maybe<Scalars['String']['output']>;
    label: Maybe<Scalars['String']['output']>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    required: Scalars['Boolean']['output'];
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type ConfigArgInput = {
    name: Scalars['String']['input'];
    /** A JSON stringified representation of the actual value */
    value: Scalars['String']['input'];
};

export type ConfigurableOperation = {
    args: Array<ConfigArg>;
    code: Scalars['String']['output'];
};

export type ConfigurableOperationDefinition = {
    args: Array<ConfigArgDefinition>;
    code: Scalars['String']['output'];
    description: Scalars['String']['output'];
};

export type ConfigurableOperationInput = {
    arguments: Array<ConfigArgInput>;
    code: Scalars['String']['input'];
};

export type ContactPerson = {
    email: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    isPrimary: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    phone: Maybe<Scalars['String']['output']>;
};

export type ContactPersonInput = {
    email?: InputMaybe<Scalars['String']['input']>;
    isPrimary?: InputMaybe<Scalars['Boolean']['input']>;
    name: Scalars['String']['input'];
    phone?: InputMaybe<Scalars['String']['input']>;
};

export type Coordinate = {
    x: Scalars['Float']['output'];
    y: Scalars['Float']['output'];
};

export type CoordinateInput = {
    x: Scalars['Float']['input'];
    y: Scalars['Float']['input'];
};

export type Counterparty = {
    assignedManagerId: Maybe<Scalars['String']['output']>;
    branchId: Maybe<Scalars['String']['output']>;
    /** Null for a caller without ReadCounterpartyCredit — see CounterpartyCreditResolver */
    creditBalance: Maybe<Scalars['Int']['output']>;
    /** Null for a caller without ReadCounterpartyCredit — see CounterpartyCreditResolver */
    creditLimit: Maybe<Scalars['Int']['output']>;
    creditTermOverrideExtraDays: Maybe<Scalars['Int']['output']>;
    departmentId: Maybe<Scalars['String']['output']>;
    /** Free-text group/segment label from the ERP — display and filtering only. */
    erpGroupLabel: Maybe<Scalars['String']['output']>;
    erpId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    inn: Maybe<Scalars['String']['output']>;
    isActive: Scalars['Boolean']['output'];
    legalName: Scalars['String']['output'];
    paymentDelayDays: Scalars['Int']['output'];
    priceType: Scalars['String']['output'];
    shortName: Scalars['String']['output'];
    /** Additional managers beyond the Owner (assignedManagerId) — see CounterpartyTeamMember. */
    teamMembers: Array<CounterpartyTeamMember>;
    tradingPoints: Array<TradingPoint>;
};

export type CounterpartyList = {
    items: Array<Counterparty>;
    totalItems: Scalars['Int']['output'];
};

export type CounterpartyListOptions = {
    branchId?: InputMaybe<Scalars['String']['input']>;
    /** Exact match against Counterparty.erpGroupLabel */
    groupLabel?: InputMaybe<Scalars['String']['input']>;
    managerId?: InputMaybe<Scalars['ID']['input']>;
    search?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** active | inactive */
    status?: InputMaybe<Scalars['String']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
    /** When true, overrides managerId and filters to counterparties with no assigned manager */
    unassignedOnly?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CounterpartySummary = {
    activeCount: Scalars['Int']['output'];
    /** Null for a caller without ReadCounterpartyCredit — see CounterpartyResolver.counterpartySummary */
    highUsageCount: Maybe<Scalars['Int']['output']>;
    totalCount: Scalars['Int']['output'];
    /** Null for a caller without ReadCounterpartyCredit — see CounterpartyResolver.counterpartySummary */
    totalCreditBalance: Maybe<Scalars['Int']['output']>;
};

/** backup | observer | accounting-contact — a small fixed technical RBAC role set, not ERP-sourced business data */
export type CounterpartyTeamMember = {
    administratorId: Scalars['String']['output'];
    counterpartyId: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    phone: Maybe<Scalars['String']['output']>;
    role: Scalars['String']['output'];
};

/**
 * A Country of the world which your shop operates in.
 *
 * The `code` field is typically a 2-character ISO code such as "GB", "US", "DE" etc. This code is used in certain inputs such as
 * `UpdateAddressInput` and `CreateAddressInput` to specify the country.
 */
export type Country = Node &
    Region & {
        code: Scalars['String']['output'];
        createdAt: Scalars['DateTime']['output'];
        customFields: Maybe<Scalars['JSON']['output']>;
        enabled: Scalars['Boolean']['output'];
        id: Scalars['ID']['output'];
        languageCode: LanguageCode;
        name: Scalars['String']['output'];
        parent: Maybe<Region>;
        parentId: Maybe<Scalars['ID']['output']>;
        translations: Array<RegionTranslation>;
        type: Scalars['String']['output'];
        updatedAt: Scalars['DateTime']['output'];
    };

export type CountryFilterParameter = {
    _and?: InputMaybe<Array<CountryFilterParameter>>;
    _or?: InputMaybe<Array<CountryFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    enabled?: InputMaybe<BooleanOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    parentId?: InputMaybe<IdOperators>;
    type?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type CountryList = PaginatedList & {
    items: Array<Country>;
    totalItems: Scalars['Int']['output'];
};

export type CountryListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<CountryFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<CountrySortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type CountrySortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    parentId?: InputMaybe<SortOrder>;
    type?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type CountryTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeExpiredError = ErrorResult & {
    couponCode: Scalars['String']['output'];
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeInvalidError = ErrorResult & {
    couponCode: Scalars['String']['output'];
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeLimitError = ErrorResult & {
    couponCode: Scalars['String']['output'];
    errorCode: ErrorCode;
    limit: Scalars['Int']['output'];
    message: Scalars['String']['output'];
};

/**
 * Input used to create an Address.
 *
 * The countryCode must correspond to a `code` property of a Country that has been defined in the
 * Vendure server. The `code` property is typically a 2-character ISO code such as "GB", "US", "DE" etc.
 * If an invalid code is passed, the mutation will fail.
 */
export type CreateAddressInput = {
    city?: InputMaybe<Scalars['String']['input']>;
    company?: InputMaybe<Scalars['String']['input']>;
    countryCode: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    defaultBillingAddress?: InputMaybe<Scalars['Boolean']['input']>;
    defaultShippingAddress?: InputMaybe<Scalars['Boolean']['input']>;
    fullName?: InputMaybe<Scalars['String']['input']>;
    phoneNumber?: InputMaybe<Scalars['String']['input']>;
    postalCode?: InputMaybe<Scalars['String']['input']>;
    province?: InputMaybe<Scalars['String']['input']>;
    streetLine1: Scalars['String']['input'];
    streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type CreateAdministratorCustomFieldsInput = {
    branchId?: InputMaybe<Scalars['String']['input']>;
    departmentId?: InputMaybe<Scalars['String']['input']>;
    position?: InputMaybe<Scalars['String']['input']>;
    sourceAdministratorId?: InputMaybe<Scalars['String']['input']>;
};

export type CreateAdministratorInput = {
    customFields?: InputMaybe<CreateAdministratorCustomFieldsInput>;
    emailAddress: Scalars['String']['input'];
    firstName: Scalars['String']['input'];
    lastName: Scalars['String']['input'];
    password: Scalars['String']['input'];
    roleIds: Array<Scalars['ID']['input']>;
};

/**
 * There is no User ID because you can only create API-Keys for yourself,
 * which gets determined by the User who does the request.
 */
export type CreateApiKeyInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    /**
     * Which roles to attach to this ApiKey.
     * You may only grant roles which you, yourself have.
     */
    roleIds: Array<Scalars['ID']['input']>;
    translations: Array<CreateApiKeyTranslationInput>;
};

export type CreateApiKeyResult = {
    /** The generated API-Key. API-Keys cannot be viewed again after creation! */
    apiKey: Scalars['String']['output'];
    /** ID of the created ApiKey-Entity */
    entityId: Scalars['ID']['output'];
};

export type CreateApiKeyTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    languageCode: LanguageCode;
    /** A descriptive name so you can remind yourself where the API-Key gets used */
    name: Scalars['String']['input'];
};

export type CreateAssetInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    file: Scalars['Upload']['input'];
    tags?: InputMaybe<Array<Scalars['String']['input']>>;
    translations?: InputMaybe<Array<AssetTranslationInput>>;
};

export type CreateAssetResult = Asset | MimeTypeError;

export type CreateChannelInput = {
    availableCurrencyCodes?: InputMaybe<Array<CurrencyCode>>;
    availableLanguageCodes?: InputMaybe<Array<LanguageCode>>;
    code: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    defaultCurrencyCode?: InputMaybe<CurrencyCode>;
    defaultLanguageCode: LanguageCode;
    defaultShippingZoneId: Scalars['ID']['input'];
    defaultTaxZoneId: Scalars['ID']['input'];
    outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
    pricesIncludeTax: Scalars['Boolean']['input'];
    sellerId?: InputMaybe<Scalars['ID']['input']>;
    token: Scalars['String']['input'];
    trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateChannelResult = Channel | LanguageNotAvailableError;

export type CreateCollectionInput = {
    assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
    filters: Array<ConfigurableOperationInput>;
    inheritFilters?: InputMaybe<Scalars['Boolean']['input']>;
    isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
    parentId?: InputMaybe<Scalars['ID']['input']>;
    translations: Array<CreateCollectionTranslationInput>;
};

export type CreateCollectionTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    description: Scalars['String']['input'];
    languageCode: LanguageCode;
    name: Scalars['String']['input'];
    slug: Scalars['String']['input'];
};

export type CreateCountryInput = {
    code: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    enabled: Scalars['Boolean']['input'];
    translations: Array<CountryTranslationInput>;
};

export type CreateCustomerCustomFieldsInput = {
    counterpartyId?: InputMaybe<Scalars['String']['input']>;
    portalRole?: InputMaybe<Scalars['String']['input']>;
    preferredTradingPointId?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCustomerGroupInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    customerIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    name: Scalars['String']['input'];
};

export type CreateCustomerInput = {
    customFields?: InputMaybe<CreateCustomerCustomFieldsInput>;
    emailAddress: Scalars['String']['input'];
    firstName: Scalars['String']['input'];
    lastName: Scalars['String']['input'];
    phoneNumber?: InputMaybe<Scalars['String']['input']>;
    title?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCustomerResult = Customer | EmailAddressConflictError;

export type CreateFacetInput = {
    code: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    isPrivate: Scalars['Boolean']['input'];
    translations: Array<FacetTranslationInput>;
    values?: InputMaybe<Array<CreateFacetValueWithFacetInput>>;
};

export type CreateFacetValueInput = {
    code: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    facetId: Scalars['ID']['input'];
    translations: Array<FacetValueTranslationInput>;
};

export type CreateFacetValueWithFacetInput = {
    code: Scalars['String']['input'];
    translations: Array<FacetValueTranslationInput>;
};

/** Returned if an error is thrown in a FulfillmentHandler's createFulfillment method */
export type CreateFulfillmentError = ErrorResult & {
    errorCode: ErrorCode;
    fulfillmentHandlerError: Scalars['String']['output'];
    message: Scalars['String']['output'];
};

export type CreateGroupOptionInput = {
    code: Scalars['String']['input'];
    translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreatePaymentMethodCustomFieldsInput = {
    paymentClassification?: InputMaybe<Scalars['String']['input']>;
    reservationTtlDays?: InputMaybe<Scalars['Int']['input']>;
};

export type CreatePaymentMethodInput = {
    checker?: InputMaybe<ConfigurableOperationInput>;
    code: Scalars['String']['input'];
    customFields?: InputMaybe<CreatePaymentMethodCustomFieldsInput>;
    enabled: Scalars['Boolean']['input'];
    handler: ConfigurableOperationInput;
    translations: Array<PaymentMethodTranslationInput>;
};

export type CreateProductCustomFieldsInput = {
    externalId?: InputMaybe<Scalars['String']['input']>;
    fullName?: InputMaybe<Scalars['String']['input']>;
    onSale?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateProductInput = {
    assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    customFields?: InputMaybe<CreateProductCustomFieldsInput>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
    translations: Array<ProductTranslationInput>;
};

export type CreateProductOptionGroupInput = {
    code: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    options?: InputMaybe<Array<CreateGroupOptionInput>>;
    translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreateProductOptionInput = {
    code: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    productOptionGroupId: Scalars['ID']['input'];
    translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreateProductVariantCustomFieldsInput = {
    multiplicity?: InputMaybe<Scalars['Int']['input']>;
    organizationId?: InputMaybe<Scalars['Int']['input']>;
    organizationPriority?: InputMaybe<Scalars['Int']['input']>;
    organizationSourceEntityId?: InputMaybe<Scalars['String']['input']>;
    weight?: InputMaybe<Scalars['Float']['input']>;
};

export type CreateProductVariantInput = {
    assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    customFields?: InputMaybe<CreateProductVariantCustomFieldsInput>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
    optionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
    price?: InputMaybe<Scalars['Money']['input']>;
    prices?: InputMaybe<Array<InputMaybe<CreateProductVariantPriceInput>>>;
    productId: Scalars['ID']['input'];
    sku: Scalars['String']['input'];
    stockLevels?: InputMaybe<Array<StockLevelInput>>;
    stockOnHand?: InputMaybe<Scalars['Int']['input']>;
    taxCategoryId?: InputMaybe<Scalars['ID']['input']>;
    trackInventory?: InputMaybe<GlobalFlag>;
    translations: Array<ProductVariantTranslationInput>;
    useGlobalOutOfStockThreshold?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateProductVariantOptionInput = {
    code: Scalars['String']['input'];
    optionGroupId: Scalars['ID']['input'];
    translations: Array<ProductOptionTranslationInput>;
};

export type CreateProductVariantPriceInput = {
    currencyCode: CurrencyCode;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    price: Scalars['Money']['input'];
};

export type CreatePromotionInput = {
    actions: Array<ConfigurableOperationInput>;
    conditions: Array<ConfigurableOperationInput>;
    couponCode?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    enabled: Scalars['Boolean']['input'];
    endsAt?: InputMaybe<Scalars['DateTime']['input']>;
    perCustomerUsageLimit?: InputMaybe<Scalars['Int']['input']>;
    startsAt?: InputMaybe<Scalars['DateTime']['input']>;
    translations: Array<PromotionTranslationInput>;
    usageLimit?: InputMaybe<Scalars['Int']['input']>;
};

export type CreatePromotionResult = MissingConditionsError | Promotion;

export type CreateProvinceInput = {
    code: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    enabled: Scalars['Boolean']['input'];
    translations: Array<ProvinceTranslationInput>;
};

export type CreateRoleInput = {
    channelIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    code: Scalars['String']['input'];
    description: Scalars['String']['input'];
    permissions: Array<Permission>;
};

export type CreateSellerInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    name: Scalars['String']['input'];
};

export type CreateShippingMethodInput = {
    calculator: ConfigurableOperationInput;
    checker: ConfigurableOperationInput;
    code: Scalars['String']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    fulfillmentHandler: Scalars['String']['input'];
    translations: Array<ShippingMethodTranslationInput>;
};

export type CreateStockLocationCustomFieldsInput = {
    warehouseErpId?: InputMaybe<Scalars['String']['input']>;
};

export type CreateStockLocationInput = {
    customFields?: InputMaybe<CreateStockLocationCustomFieldsInput>;
    description?: InputMaybe<Scalars['String']['input']>;
    name: Scalars['String']['input'];
};

export type CreateTagInput = {
    value: Scalars['String']['input'];
};

export type CreateTaxCategoryCustomFieldsInput = {
    erpVatCode?: InputMaybe<Scalars['String']['input']>;
};

export type CreateTaxCategoryInput = {
    customFields?: InputMaybe<CreateTaxCategoryCustomFieldsInput>;
    isDefault?: InputMaybe<Scalars['Boolean']['input']>;
    name: Scalars['String']['input'];
};

export type CreateTaxRateInput = {
    categoryId: Scalars['ID']['input'];
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    customerGroupId?: InputMaybe<Scalars['ID']['input']>;
    enabled: Scalars['Boolean']['input'];
    name: Scalars['String']['input'];
    value: Scalars['Float']['input'];
    zoneId: Scalars['ID']['input'];
};

export type CreateZoneInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    memberIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    name: Scalars['String']['input'];
};

export type CreditTermLimit = {
    maxAmount: Maybe<Scalars['Int']['output']>;
    maxExtraDays: Scalars['Int']['output'];
    roleCode: Scalars['String']['output'];
};

export type CreditTermRequestInput = {
    counterpartyErpId: Scalars['String']['input'];
    justification: Scalars['String']['input'];
    requestedAmount?: InputMaybe<Scalars['Int']['input']>;
    requestedExtraDays: Scalars['Int']['input'];
};

/**
 * @description
 * ISO 4217 currency code
 *
 * @docsCategory common
 */
export enum CurrencyCode {
    /** United Arab Emirates dirham */
    Aed = 'AED',
    /** Afghan afghani */
    Afn = 'AFN',
    /** Albanian lek */
    All = 'ALL',
    /** Armenian dram */
    Amd = 'AMD',
    /** Netherlands Antillean guilder */
    Ang = 'ANG',
    /** Angolan kwanza */
    Aoa = 'AOA',
    /** Argentine peso */
    Ars = 'ARS',
    /** Australian dollar */
    Aud = 'AUD',
    /** Aruban florin */
    Awg = 'AWG',
    /** Azerbaijani manat */
    Azn = 'AZN',
    /** Bosnia and Herzegovina convertible mark */
    Bam = 'BAM',
    /** Barbados dollar */
    Bbd = 'BBD',
    /** Bangladeshi taka */
    Bdt = 'BDT',
    /** Bulgarian lev */
    Bgn = 'BGN',
    /** Bahraini dinar */
    Bhd = 'BHD',
    /** Burundian franc */
    Bif = 'BIF',
    /** Bermudian dollar */
    Bmd = 'BMD',
    /** Brunei dollar */
    Bnd = 'BND',
    /** Boliviano */
    Bob = 'BOB',
    /** Brazilian real */
    Brl = 'BRL',
    /** Bahamian dollar */
    Bsd = 'BSD',
    /** Bhutanese ngultrum */
    Btn = 'BTN',
    /** Botswana pula */
    Bwp = 'BWP',
    /** Belarusian ruble */
    Byn = 'BYN',
    /** Belize dollar */
    Bzd = 'BZD',
    /** Canadian dollar */
    Cad = 'CAD',
    /** Congolese franc */
    Cdf = 'CDF',
    /** Swiss franc */
    Chf = 'CHF',
    /** Chilean peso */
    Clp = 'CLP',
    /** Renminbi (Chinese) yuan */
    Cny = 'CNY',
    /** Colombian peso */
    Cop = 'COP',
    /** Costa Rican colon */
    Crc = 'CRC',
    /** Cuban convertible peso */
    Cuc = 'CUC',
    /** Cuban peso */
    Cup = 'CUP',
    /** Cape Verde escudo */
    Cve = 'CVE',
    /** Czech koruna */
    Czk = 'CZK',
    /** Djiboutian franc */
    Djf = 'DJF',
    /** Danish krone */
    Dkk = 'DKK',
    /** Dominican peso */
    Dop = 'DOP',
    /** Algerian dinar */
    Dzd = 'DZD',
    /** Egyptian pound */
    Egp = 'EGP',
    /** Eritrean nakfa */
    Ern = 'ERN',
    /** Ethiopian birr */
    Etb = 'ETB',
    /** Euro */
    Eur = 'EUR',
    /** Fiji dollar */
    Fjd = 'FJD',
    /** Falkland Islands pound */
    Fkp = 'FKP',
    /** Pound sterling */
    Gbp = 'GBP',
    /** Georgian lari */
    Gel = 'GEL',
    /** Ghanaian cedi */
    Ghs = 'GHS',
    /** Gibraltar pound */
    Gip = 'GIP',
    /** Gambian dalasi */
    Gmd = 'GMD',
    /** Guinean franc */
    Gnf = 'GNF',
    /** Guatemalan quetzal */
    Gtq = 'GTQ',
    /** Guyanese dollar */
    Gyd = 'GYD',
    /** Hong Kong dollar */
    Hkd = 'HKD',
    /** Honduran lempira */
    Hnl = 'HNL',
    /** Croatian kuna */
    Hrk = 'HRK',
    /** Haitian gourde */
    Htg = 'HTG',
    /** Hungarian forint */
    Huf = 'HUF',
    /** Indonesian rupiah */
    Idr = 'IDR',
    /** Israeli new shekel */
    Ils = 'ILS',
    /** Indian rupee */
    Inr = 'INR',
    /** Iraqi dinar */
    Iqd = 'IQD',
    /** Iranian rial */
    Irr = 'IRR',
    /** Icelandic króna */
    Isk = 'ISK',
    /** Jamaican dollar */
    Jmd = 'JMD',
    /** Jordanian dinar */
    Jod = 'JOD',
    /** Japanese yen */
    Jpy = 'JPY',
    /** Kenyan shilling */
    Kes = 'KES',
    /** Kyrgyzstani som */
    Kgs = 'KGS',
    /** Cambodian riel */
    Khr = 'KHR',
    /** Comoro franc */
    Kmf = 'KMF',
    /** North Korean won */
    Kpw = 'KPW',
    /** South Korean won */
    Krw = 'KRW',
    /** Kuwaiti dinar */
    Kwd = 'KWD',
    /** Cayman Islands dollar */
    Kyd = 'KYD',
    /** Kazakhstani tenge */
    Kzt = 'KZT',
    /** Lao kip */
    Lak = 'LAK',
    /** Lebanese pound */
    Lbp = 'LBP',
    /** Sri Lankan rupee */
    Lkr = 'LKR',
    /** Liberian dollar */
    Lrd = 'LRD',
    /** Lesotho loti */
    Lsl = 'LSL',
    /** Libyan dinar */
    Lyd = 'LYD',
    /** Moroccan dirham */
    Mad = 'MAD',
    /** Moldovan leu */
    Mdl = 'MDL',
    /** Malagasy ariary */
    Mga = 'MGA',
    /** Macedonian denar */
    Mkd = 'MKD',
    /** Myanmar kyat */
    Mmk = 'MMK',
    /** Mongolian tögrög */
    Mnt = 'MNT',
    /** Macanese pataca */
    Mop = 'MOP',
    /** Mauritanian ouguiya */
    Mru = 'MRU',
    /** Mauritian rupee */
    Mur = 'MUR',
    /** Maldivian rufiyaa */
    Mvr = 'MVR',
    /** Malawian kwacha */
    Mwk = 'MWK',
    /** Mexican peso */
    Mxn = 'MXN',
    /** Malaysian ringgit */
    Myr = 'MYR',
    /** Mozambican metical */
    Mzn = 'MZN',
    /** Namibian dollar */
    Nad = 'NAD',
    /** Nigerian naira */
    Ngn = 'NGN',
    /** Nicaraguan córdoba */
    Nio = 'NIO',
    /** Norwegian krone */
    Nok = 'NOK',
    /** Nepalese rupee */
    Npr = 'NPR',
    /** New Zealand dollar */
    Nzd = 'NZD',
    /** Omani rial */
    Omr = 'OMR',
    /** Panamanian balboa */
    Pab = 'PAB',
    /** Peruvian sol */
    Pen = 'PEN',
    /** Papua New Guinean kina */
    Pgk = 'PGK',
    /** Philippine peso */
    Php = 'PHP',
    /** Pakistani rupee */
    Pkr = 'PKR',
    /** Polish złoty */
    Pln = 'PLN',
    /** Paraguayan guaraní */
    Pyg = 'PYG',
    /** Qatari riyal */
    Qar = 'QAR',
    /** Romanian leu */
    Ron = 'RON',
    /** Serbian dinar */
    Rsd = 'RSD',
    /** Russian ruble */
    Rub = 'RUB',
    /** Rwandan franc */
    Rwf = 'RWF',
    /** Saudi riyal */
    Sar = 'SAR',
    /** Solomon Islands dollar */
    Sbd = 'SBD',
    /** Seychelles rupee */
    Scr = 'SCR',
    /** Sudanese pound */
    Sdg = 'SDG',
    /** Swedish krona/kronor */
    Sek = 'SEK',
    /** Singapore dollar */
    Sgd = 'SGD',
    /** Saint Helena pound */
    Shp = 'SHP',
    /** Sierra Leonean leone */
    Sll = 'SLL',
    /** Somali shilling */
    Sos = 'SOS',
    /** Surinamese dollar */
    Srd = 'SRD',
    /** South Sudanese pound */
    Ssp = 'SSP',
    /** São Tomé and Príncipe dobra */
    Stn = 'STN',
    /** Salvadoran colón */
    Svc = 'SVC',
    /** Syrian pound */
    Syp = 'SYP',
    /** Swazi lilangeni */
    Szl = 'SZL',
    /** Thai baht */
    Thb = 'THB',
    /** Tajikistani somoni */
    Tjs = 'TJS',
    /** Turkmenistan manat */
    Tmt = 'TMT',
    /** Tunisian dinar */
    Tnd = 'TND',
    /** Tongan paʻanga */
    Top = 'TOP',
    /** Turkish lira */
    Try = 'TRY',
    /** Trinidad and Tobago dollar */
    Ttd = 'TTD',
    /** New Taiwan dollar */
    Twd = 'TWD',
    /** Tanzanian shilling */
    Tzs = 'TZS',
    /** Ukrainian hryvnia */
    Uah = 'UAH',
    /** Ugandan shilling */
    Ugx = 'UGX',
    /** United States dollar */
    Usd = 'USD',
    /** Uruguayan peso */
    Uyu = 'UYU',
    /** Uzbekistan som */
    Uzs = 'UZS',
    /** Venezuelan bolívar soberano */
    Ves = 'VES',
    /** Vietnamese đồng */
    Vnd = 'VND',
    /** Vanuatu vatu */
    Vuv = 'VUV',
    /** Samoan tala */
    Wst = 'WST',
    /** CFA franc BEAC */
    Xaf = 'XAF',
    /** East Caribbean dollar */
    Xcd = 'XCD',
    /** CFA franc BCEAO */
    Xof = 'XOF',
    /** CFP franc (franc Pacifique) */
    Xpf = 'XPF',
    /** Yemeni rial */
    Yer = 'YER',
    /** South African rand */
    Zar = 'ZAR',
    /** Zambian kwacha */
    Zmw = 'ZMW',
    /** Zimbabwean dollar */
    Zwl = 'ZWL',
}

export type CurrentUser = {
    channels: Array<CurrentUserChannel>;
    id: Scalars['ID']['output'];
    identifier: Scalars['String']['output'];
};

export type CurrentUserChannel = {
    code: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    permissions: Array<Permission>;
    token: Scalars['String']['output'];
};

export type CustomField = {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type CustomFieldConfig =
    | BooleanCustomFieldConfig
    | DateTimeCustomFieldConfig
    | FloatCustomFieldConfig
    | IntCustomFieldConfig
    | LocaleStringCustomFieldConfig
    | LocaleTextCustomFieldConfig
    | RelationCustomFieldConfig
    | StringCustomFieldConfig
    | StructCustomFieldConfig
    | TextCustomFieldConfig;

/**
 * This type is deprecated in v2.2 in favor of the EntityCustomFields type,
 * which allows custom fields to be defined on user-supplied entities.
 */
export type CustomFields = {
    Address: Array<CustomFieldConfig>;
    Administrator: Array<CustomFieldConfig>;
    ApiKey: Array<CustomFieldConfig>;
    Asset: Array<CustomFieldConfig>;
    Channel: Array<CustomFieldConfig>;
    Collection: Array<CustomFieldConfig>;
    Customer: Array<CustomFieldConfig>;
    CustomerGroup: Array<CustomFieldConfig>;
    Facet: Array<CustomFieldConfig>;
    FacetValue: Array<CustomFieldConfig>;
    Fulfillment: Array<CustomFieldConfig>;
    GlobalSettings: Array<CustomFieldConfig>;
    HistoryEntry: Array<CustomFieldConfig>;
    Order: Array<CustomFieldConfig>;
    OrderLine: Array<CustomFieldConfig>;
    Payment: Array<CustomFieldConfig>;
    PaymentMethod: Array<CustomFieldConfig>;
    Product: Array<CustomFieldConfig>;
    ProductOption: Array<CustomFieldConfig>;
    ProductOptionGroup: Array<CustomFieldConfig>;
    ProductVariant: Array<CustomFieldConfig>;
    ProductVariantPrice: Array<CustomFieldConfig>;
    Promotion: Array<CustomFieldConfig>;
    Refund: Array<CustomFieldConfig>;
    Region: Array<CustomFieldConfig>;
    Seller: Array<CustomFieldConfig>;
    Session: Array<CustomFieldConfig>;
    ShippingLine: Array<CustomFieldConfig>;
    ShippingMethod: Array<CustomFieldConfig>;
    StockLevel: Array<CustomFieldConfig>;
    StockLocation: Array<CustomFieldConfig>;
    StockMovement: Array<CustomFieldConfig>;
    TaxCategory: Array<CustomFieldConfig>;
    TaxRate: Array<CustomFieldConfig>;
    User: Array<CustomFieldConfig>;
    Zone: Array<CustomFieldConfig>;
};

export type Customer = Node & {
    addresses: Maybe<Array<Address>>;
    counterparty: Maybe<Counterparty>;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<CustomerCustomFields>;
    emailAddress: Scalars['String']['output'];
    firstName: Scalars['String']['output'];
    groups: Array<CustomerGroup>;
    history: HistoryEntryList;
    id: Scalars['ID']['output'];
    lastName: Scalars['String']['output'];
    orders: OrderList;
    phoneNumber: Maybe<Scalars['String']['output']>;
    preferredTradingPoint: Maybe<TradingPoint>;
    priceType: Maybe<PriceType>;
    title: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
    user: Maybe<User>;
};

export type CustomerHistoryArgs = {
    options?: InputMaybe<HistoryEntryListOptions>;
};

export type CustomerOrdersArgs = {
    options?: InputMaybe<OrderListOptions>;
};

export type CustomerCustomFields = {
    counterpartyId: Maybe<Scalars['String']['output']>;
    portalRole: Maybe<Scalars['String']['output']>;
    preferredTradingPointId: Maybe<Scalars['String']['output']>;
};

export type CustomerFilterParameter = {
    _and?: InputMaybe<Array<CustomerFilterParameter>>;
    _or?: InputMaybe<Array<CustomerFilterParameter>>;
    counterpartyId?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    emailAddress?: InputMaybe<StringOperators>;
    firstName?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    lastName?: InputMaybe<StringOperators>;
    phoneNumber?: InputMaybe<StringOperators>;
    portalRole?: InputMaybe<StringOperators>;
    postalCode?: InputMaybe<StringOperators>;
    preferredTradingPointId?: InputMaybe<StringOperators>;
    title?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type CustomerGroup = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    customers: CustomerList;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type CustomerGroupCustomersArgs = {
    options?: InputMaybe<CustomerListOptions>;
};

export type CustomerGroupFilterParameter = {
    _and?: InputMaybe<Array<CustomerGroupFilterParameter>>;
    _or?: InputMaybe<Array<CustomerGroupFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type CustomerGroupList = PaginatedList & {
    items: Array<CustomerGroup>;
    totalItems: Scalars['Int']['output'];
};

export type CustomerGroupListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<CustomerGroupFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<CustomerGroupSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type CustomerGroupSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type CustomerList = PaginatedList & {
    items: Array<Customer>;
    totalItems: Scalars['Int']['output'];
};

export type CustomerListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<CustomerFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<CustomerSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type CustomerSortParameter = {
    counterpartyId?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    emailAddress?: InputMaybe<SortOrder>;
    firstName?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    lastName?: InputMaybe<SortOrder>;
    phoneNumber?: InputMaybe<SortOrder>;
    portalRole?: InputMaybe<SortOrder>;
    preferredTradingPointId?: InputMaybe<SortOrder>;
    title?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type DashboardMetricSummary = {
    entries: Array<DashboardMetricSummaryEntry>;
    title: Scalars['String']['output'];
    type: DashboardMetricType;
};

export type DashboardMetricSummaryEntry = {
    label: Scalars['String']['output'];
    value: Scalars['Float']['output'];
};

export type DashboardMetricSummaryInput = {
    endDate: Scalars['DateTime']['input'];
    refresh?: InputMaybe<Scalars['Boolean']['input']>;
    startDate: Scalars['DateTime']['input'];
    types: Array<DashboardMetricType>;
};

export enum DashboardMetricType {
    AverageOrderValue = 'AverageOrderValue',
    OrderCount = 'OrderCount',
    OrderTotal = 'OrderTotal',
}

/** Operators for filtering on a list of Date fields */
export type DateListOperators = {
    inList: Scalars['DateTime']['input'];
};

/** Operators for filtering on a DateTime field */
export type DateOperators = {
    after?: InputMaybe<Scalars['DateTime']['input']>;
    before?: InputMaybe<Scalars['DateTime']['input']>;
    between?: InputMaybe<DateRange>;
    eq?: InputMaybe<Scalars['DateTime']['input']>;
    isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DateRange = {
    end: Scalars['DateTime']['input'];
    start: Scalars['DateTime']['input'];
};

/**
 * Expects the same validation formats as the `<input type="datetime-local">` HTML element.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local#Additional_attributes
 */
export type DateTimeCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max: Maybe<Scalars['String']['output']>;
    min: Maybe<Scalars['String']['output']>;
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    step: Maybe<Scalars['Int']['output']>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

/**
 * Expects the same validation formats as the `<input type="datetime-local">` HTML element.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local#Additional_attributes
 */
export type DateTimeStructFieldConfig = StructField & {
    description: Maybe<Array<LocalizedString>>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max: Maybe<Scalars['String']['output']>;
    min: Maybe<Scalars['String']['output']>;
    name: Scalars['String']['output'];
    step: Maybe<Scalars['Int']['output']>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type DeleteAssetInput = {
    assetId: Scalars['ID']['input'];
    deleteFromAllChannels?: InputMaybe<Scalars['Boolean']['input']>;
    force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DeleteAssetsInput = {
    assetIds: Array<Scalars['ID']['input']>;
    deleteFromAllChannels?: InputMaybe<Scalars['Boolean']['input']>;
    force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DeleteStockLocationInput = {
    id: Scalars['ID']['input'];
    transferToLocationId?: InputMaybe<Scalars['ID']['input']>;
};

export type DeletionResponse = {
    message: Maybe<Scalars['String']['output']>;
    result: DeletionResult;
};

export enum DeletionResult {
    /** The entity was successfully deleted */
    Deleted = 'DELETED',
    /** Deletion did not take place, reason given in message */
    NotDeleted = 'NOT_DELETED',
}

export type Department = {
    erpId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    parentErpId: Maybe<Scalars['String']['output']>;
};

export type Discount = {
    adjustmentSource: Scalars['String']['output'];
    amount: Scalars['Money']['output'];
    amountWithTax: Scalars['Money']['output'];
    description: Scalars['String']['output'];
    type: AdjustmentType;
};

export type DiscountGrant = {
    counterparties: Array<DiscountGrantCounterparty>;
    discountRuleId: Scalars['ID']['output'];
    id: Scalars['ID']['output'];
    scopeType: Scalars['String']['output'];
    validTo: Scalars['DateTime']['output'];
};

export type DiscountGrantCounterparty = {
    id: Scalars['ID']['output'];
    legalName: Scalars['String']['output'];
};

export type DiscountGrantForCustomer = {
    createdAt: Scalars['DateTime']['output'];
    facetValueCode: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    /** Human-facing business number — see DiscountGrant.number's own doc comment (discount-grant.entity.ts). */
    number: Scalars['String']['output'];
    percent: Scalars['Int']['output'];
    scopeType: Scalars['String']['output'];
    /** active | expiring-soon | expired — computed server-side, see DiscountGrantService.computeGrantStatus. */
    status: Scalars['String']['output'];
    validTo: Scalars['DateTime']['output'];
};

export type DiscountGrantForCustomerList = {
    items: Array<DiscountGrantForCustomer>;
    totalItems: Scalars['Int']['output'];
};

export type DiscountGrantForCustomerListOptions = {
    /** Substring match against the grant's own number (DiscountGrant.number). */
    search?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** active | expiring-soon | expired */
    status?: InputMaybe<Scalars['String']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type DiscountGrantInput = {
    counterpartyIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    facetCode?: InputMaybe<Scalars['String']['input']>;
    facetValueCode?: InputMaybe<Scalars['String']['input']>;
    justification: Scalars['String']['input'];
    minAmount?: InputMaybe<Scalars['Int']['input']>;
    minWeightKg?: InputMaybe<Scalars['Float']['input']>;
    percent: Scalars['Int']['input'];
    priceTypeCode: Scalars['String']['input'];
    supersedesDiscountRuleId?: InputMaybe<Scalars['String']['input']>;
    validFrom: Scalars['DateTime']['input'];
    validTo: Scalars['DateTime']['input'];
};

export type DiscountRegistryEntry = {
    approvalRequestId: Maybe<Scalars['ID']['output']>;
    counterpartyIds: Maybe<Array<Scalars['String']['output']>>;
    discountRuleId: Maybe<Scalars['ID']['output']>;
    facetCode: Maybe<Scalars['String']['output']>;
    facetValueCode: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    justification: Maybe<Scalars['String']['output']>;
    percent: Scalars['Int']['output'];
    priceTypeCode: Scalars['String']['output'];
    status: Scalars['String']['output'];
    validFrom: Scalars['DateTime']['output'];
    validTo: Scalars['DateTime']['output'];
};

export type DiscountRegistryEntryList = {
    items: Array<DiscountRegistryEntry>;
    totalItems: Scalars['Int']['output'];
};

export type DiscountRegistryListOptions = {
    priceTypeCode?: InputMaybe<Scalars['String']['input']>;
    search?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    status?: InputMaybe<Scalars['String']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type DiscountRule = {
    erpId: Scalars['String']['output'];
    facetCode: Maybe<Scalars['String']['output']>;
    facetValueCode: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    minAmount: Maybe<Scalars['Int']['output']>;
    minWeightKg: Maybe<Scalars['Float']['output']>;
    percent: Scalars['Int']['output'];
    priceTypeCode: Scalars['String']['output'];
    validFrom: Scalars['DateTime']['output'];
    validTo: Scalars['DateTime']['output'];
};

export type DiscountRuleInput = {
    erpId: Scalars['String']['input'];
    facetCode?: InputMaybe<Scalars['String']['input']>;
    facetValueCode?: InputMaybe<Scalars['String']['input']>;
    minAmount?: InputMaybe<Scalars['Int']['input']>;
    minWeightKg?: InputMaybe<Scalars['Float']['input']>;
    percent: Scalars['Int']['input'];
    priceTypeCode: Scalars['String']['input'];
    validFrom: Scalars['DateTime']['input'];
    validTo: Scalars['DateTime']['input'];
};

export type Dispute = {
    amount: Scalars['Int']['output'];
    id: Scalars['ID']['output'];
    paymentId: Scalars['ID']['output'];
    status: Scalars['String']['output'];
    type: Scalars['String']['output'];
};

export type Document = {
    amount: Maybe<Scalars['Int']['output']>;
    asset: Maybe<Asset>;
    counterpartyId: Scalars['ID']['output'];
    currencyCode: Maybe<Scalars['String']['output']>;
    fileUrl: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    issueDate: Scalars['DateTime']['output'];
    number: Scalars['String']['output'];
    orderId: Maybe<Scalars['ID']['output']>;
    status: Scalars['String']['output'];
    type: Scalars['String']['output'];
};

export type DocumentList = {
    items: Array<Document>;
    totalItems: Scalars['Int']['output'];
};

export type DocumentListOptions = {
    /** Substring match against the document's own number (ILIKE). */
    search?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    status?: InputMaybe<Scalars['String']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
    type?: InputMaybe<Scalars['String']['input']>;
    /** Exact-match multi-select, populated from documentTypes — see that query's doc comment. */
    types?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type DuplicateEntityError = ErrorResult & {
    duplicationError: Scalars['String']['output'];
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type DuplicateEntityInput = {
    duplicatorInput: ConfigurableOperationInput;
    entityId: Scalars['ID']['input'];
    entityName: Scalars['String']['input'];
};

export type DuplicateEntityResult = DuplicateEntityError | DuplicateEntitySuccess;

export type DuplicateEntitySuccess = {
    newEntityId: Scalars['ID']['output'];
};

/** Returned when attempting to create a Customer with an email address already registered to an existing User. */
export type EmailAddressConflictError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned if no OrderLines have been specified for the operation */
export type EmptyOrderLineSelectionError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type EntityCustomFields = {
    customFields: Array<CustomFieldConfig>;
    entityName: Scalars['String']['output'];
};

export type EntityDuplicatorDefinition = {
    args: Array<ConfigArgDefinition>;
    code: Scalars['String']['output'];
    description: Scalars['String']['output'];
    forEntities: Array<Scalars['String']['output']>;
    requiresPermission: Array<Permission>;
};

export type EntityRefInput = {
    entityId: Scalars['ID']['input'];
    entityName: Scalars['String']['input'];
};

export type EntityVersion = {
    action: Scalars['String']['output'];
    administratorId: Maybe<Scalars['String']['output']>;
    changedFields: Maybe<Scalars['String']['output']>;
    comment: Maybe<Scalars['String']['output']>;
    createdAt: Scalars['DateTime']['output'];
    entityId: Scalars['String']['output'];
    entityName: Scalars['String']['output'];
    id: Scalars['ID']['output'];
};

export type EntityVersionList = {
    items: Array<EntityVersion>;
    totalItems: Scalars['Int']['output'];
};

export type EntityVersionListOptions = {
    action?: InputMaybe<Scalars['String']['input']>;
    administratorId?: InputMaybe<Scalars['ID']['input']>;
    createdAfter?: InputMaybe<Scalars['DateTime']['input']>;
    entityName?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** True to filter to system-initiated changes only (administratorId IS NULL) — mutually exclusive with administratorId. */
    system?: InputMaybe<Scalars['Boolean']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ErpReconciliationIssue = {
    aggregateType: Scalars['String']['output'];
    detectedAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    issueType: Scalars['String']['output'];
    ourCount: Scalars['Int']['output'];
    resolution: Maybe<Scalars['String']['output']>;
    status: Scalars['String']['output'];
    theirActiveCount: Scalars['Int']['output'];
    triggeredBy: Scalars['String']['output'];
    triggeredByAdministratorId: Maybe<Scalars['ID']['output']>;
};

export type ErpReconciliationIssueList = {
    items: Array<ErpReconciliationIssue>;
    totalItems: Scalars['Int']['output'];
};

export type ErpReconciliationRunResult = {
    checked: Scalars['Int']['output'];
    issuesFound: Scalars['Int']['output'];
    skipped: Array<Scalars['String']['output']>;
};

export enum ErrorCode {
    AlreadyRefundedError = 'ALREADY_REFUNDED_ERROR',
    CancelActiveOrderError = 'CANCEL_ACTIVE_ORDER_ERROR',
    CancelPaymentError = 'CANCEL_PAYMENT_ERROR',
    ChannelDefaultLanguageError = 'CHANNEL_DEFAULT_LANGUAGE_ERROR',
    CouponCodeExpiredError = 'COUPON_CODE_EXPIRED_ERROR',
    CouponCodeInvalidError = 'COUPON_CODE_INVALID_ERROR',
    CouponCodeLimitError = 'COUPON_CODE_LIMIT_ERROR',
    CreateFulfillmentError = 'CREATE_FULFILLMENT_ERROR',
    DuplicateEntityError = 'DUPLICATE_ENTITY_ERROR',
    EmailAddressConflictError = 'EMAIL_ADDRESS_CONFLICT_ERROR',
    EmptyOrderLineSelectionError = 'EMPTY_ORDER_LINE_SELECTION_ERROR',
    FacetInUseError = 'FACET_IN_USE_ERROR',
    FulfillmentStateTransitionError = 'FULFILLMENT_STATE_TRANSITION_ERROR',
    GuestCheckoutError = 'GUEST_CHECKOUT_ERROR',
    IneligibleShippingMethodError = 'INELIGIBLE_SHIPPING_METHOD_ERROR',
    InsufficientStockError = 'INSUFFICIENT_STOCK_ERROR',
    InsufficientStockOnHandError = 'INSUFFICIENT_STOCK_ON_HAND_ERROR',
    InvalidCredentialsError = 'INVALID_CREDENTIALS_ERROR',
    InvalidFulfillmentHandlerError = 'INVALID_FULFILLMENT_HANDLER_ERROR',
    ItemsAlreadyFulfilledError = 'ITEMS_ALREADY_FULFILLED_ERROR',
    LanguageNotAvailableError = 'LANGUAGE_NOT_AVAILABLE_ERROR',
    ManualPaymentStateError = 'MANUAL_PAYMENT_STATE_ERROR',
    MimeTypeError = 'MIME_TYPE_ERROR',
    MissingConditionsError = 'MISSING_CONDITIONS_ERROR',
    MultipleOrderError = 'MULTIPLE_ORDER_ERROR',
    NativeAuthStrategyError = 'NATIVE_AUTH_STRATEGY_ERROR',
    NegativeQuantityError = 'NEGATIVE_QUANTITY_ERROR',
    NothingToRefundError = 'NOTHING_TO_REFUND_ERROR',
    NoActiveOrderError = 'NO_ACTIVE_ORDER_ERROR',
    NoChangesSpecifiedError = 'NO_CHANGES_SPECIFIED_ERROR',
    OrderInterceptorError = 'ORDER_INTERCEPTOR_ERROR',
    OrderLimitError = 'ORDER_LIMIT_ERROR',
    OrderModificationError = 'ORDER_MODIFICATION_ERROR',
    OrderModificationStateError = 'ORDER_MODIFICATION_STATE_ERROR',
    OrderStateTransitionError = 'ORDER_STATE_TRANSITION_ERROR',
    PaymentMethodMissingError = 'PAYMENT_METHOD_MISSING_ERROR',
    PaymentOrderMismatchError = 'PAYMENT_ORDER_MISMATCH_ERROR',
    PaymentStateTransitionError = 'PAYMENT_STATE_TRANSITION_ERROR',
    ProductOptionGroupInUseError = 'PRODUCT_OPTION_GROUP_IN_USE_ERROR',
    ProductOptionInUseError = 'PRODUCT_OPTION_IN_USE_ERROR',
    QuantityTooGreatError = 'QUANTITY_TOO_GREAT_ERROR',
    RefundAmountError = 'REFUND_AMOUNT_ERROR',
    RefundOrderStateError = 'REFUND_ORDER_STATE_ERROR',
    RefundPaymentIdMissingError = 'REFUND_PAYMENT_ID_MISSING_ERROR',
    RefundStateTransitionError = 'REFUND_STATE_TRANSITION_ERROR',
    SettlePaymentError = 'SETTLE_PAYMENT_ERROR',
    UnknownError = 'UNKNOWN_ERROR',
}

export type ErrorResult = {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Facet = Node & {
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    isPrivate: Scalars['Boolean']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    translations: Array<FacetTranslation>;
    updatedAt: Scalars['DateTime']['output'];
    /** Returns a paginated, sortable, filterable list of the Facet's values. Added in v2.1.0. */
    valueList: FacetValueList;
    values: Array<FacetValue>;
};

export type FacetValueListArgs = {
    options?: InputMaybe<FacetValueListOptions>;
};

export type FacetFilterParameter = {
    _and?: InputMaybe<Array<FacetFilterParameter>>;
    _or?: InputMaybe<Array<FacetFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    isPrivate?: InputMaybe<BooleanOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type FacetInUseError = ErrorResult & {
    errorCode: ErrorCode;
    facetCode: Scalars['String']['output'];
    message: Scalars['String']['output'];
    productCount: Scalars['Int']['output'];
    variantCount: Scalars['Int']['output'];
};

export type FacetList = PaginatedList & {
    items: Array<Facet>;
    totalItems: Scalars['Int']['output'];
};

export type FacetListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<FacetFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<FacetSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type FacetSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type FacetTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type FacetTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

export type FacetValue = Node & {
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    facet: Facet;
    facetId: Scalars['ID']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    translations: Array<FacetValueTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

/**
 * Used to construct boolean expressions for filtering search results
 * by FacetValue ID. Examples:
 *
 * * ID=1 OR ID=2: `{ facetValueFilters: [{ or: [1,2] }] }`
 * * ID=1 AND ID=2: `{ facetValueFilters: [{ and: 1 }, { and: 2 }] }`
 * * ID=1 AND (ID=2 OR ID=3): `{ facetValueFilters: [{ and: 1 }, { or: [2,3] }] }`
 */
export type FacetValueFilterInput = {
    and?: InputMaybe<Scalars['ID']['input']>;
    or?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type FacetValueFilterParameter = {
    _and?: InputMaybe<Array<FacetValueFilterParameter>>;
    _or?: InputMaybe<Array<FacetValueFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    facetId?: InputMaybe<IdOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type FacetValueList = PaginatedList & {
    items: Array<FacetValue>;
    totalItems: Scalars['Int']['output'];
};

export type FacetValueListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<FacetValueFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<FacetValueSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Which FacetValues are present in the products returned
 * by the search, and in what quantity.
 */
export type FacetValueResult = {
    count: Scalars['Int']['output'];
    facetValue: FacetValue;
};

export type FacetValueSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    facetId?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type FacetValueTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type FacetValueTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

export type FailedIntegrationInboxEvent = {
    attempts: Scalars['Int']['output'];
    entityId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    lastError: Maybe<Scalars['String']['output']>;
    stream: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type FailedIntegrationInboxEventList = {
    items: Array<FailedIntegrationInboxEvent>;
    totalItems: Scalars['Int']['output'];
};

export type FailedIntegrationInboxEventListOptions = {
    skip?: InputMaybe<Scalars['Int']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type FloatCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max: Maybe<Scalars['Float']['output']>;
    min: Maybe<Scalars['Float']['output']>;
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    step: Maybe<Scalars['Float']['output']>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type FloatStructFieldConfig = StructField & {
    description: Maybe<Array<LocalizedString>>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max: Maybe<Scalars['Float']['output']>;
    min: Maybe<Scalars['Float']['output']>;
    name: Scalars['String']['output'];
    step: Maybe<Scalars['Float']['output']>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type FulfillOrderInput = {
    handler: ConfigurableOperationInput;
    lines: Array<OrderLineInput>;
};

export type Fulfillment = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    lines: Array<FulfillmentLine>;
    method: Scalars['String']['output'];
    nextStates: Array<Scalars['String']['output']>;
    state: Scalars['String']['output'];
    /** @deprecated Use the `lines` field instead */
    summary: Array<FulfillmentLine>;
    trackingCode: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

export type FulfillmentLine = {
    fulfillment: Fulfillment;
    fulfillmentId: Scalars['ID']['output'];
    orderLine: OrderLine;
    orderLineId: Scalars['ID']['output'];
    quantity: Scalars['Int']['output'];
};

/** Returned when there is an error in transitioning the Fulfillment state */
export type FulfillmentStateTransitionError = ErrorResult & {
    errorCode: ErrorCode;
    fromState: Scalars['String']['output'];
    message: Scalars['String']['output'];
    toState: Scalars['String']['output'];
    transitionError: Scalars['String']['output'];
};

export enum GlobalFlag {
    False = 'FALSE',
    Inherit = 'INHERIT',
    True = 'TRUE',
}

export type GlobalSettings = {
    availableLanguages: Array<LanguageCode>;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<GlobalSettingsCustomFields>;
    id: Scalars['ID']['output'];
    outOfStockThreshold: Scalars['Int']['output'];
    serverConfig: ServerConfig;
    trackInventory: Scalars['Boolean']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type GlobalSettingsCustomFields = {
    defaultBranchId: Maybe<Scalars['String']['output']>;
    organizationSplitEnabled: Maybe<Scalars['Boolean']['output']>;
};

/** Returned when attempting to set the Customer on a guest checkout when the configured GuestCheckoutStrategy does not allow it. */
export type GuestCheckoutError = ErrorResult & {
    errorCode: ErrorCode;
    errorDetail: Scalars['String']['output'];
    message: Scalars['String']['output'];
};

export type HistoryEntry = Node & {
    administrator: Maybe<Administrator>;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    data: Scalars['JSON']['output'];
    id: Scalars['ID']['output'];
    isPublic: Scalars['Boolean']['output'];
    type: HistoryEntryType;
    updatedAt: Scalars['DateTime']['output'];
};

export type HistoryEntryFilterParameter = {
    _and?: InputMaybe<Array<HistoryEntryFilterParameter>>;
    _or?: InputMaybe<Array<HistoryEntryFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    isPublic?: InputMaybe<BooleanOperators>;
    type?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type HistoryEntryList = PaginatedList & {
    items: Array<HistoryEntry>;
    totalItems: Scalars['Int']['output'];
};

export type HistoryEntryListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<HistoryEntryFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<HistoryEntrySortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type HistoryEntrySortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export enum HistoryEntryType {
    CustomerAddedToGroup = 'CUSTOMER_ADDED_TO_GROUP',
    CustomerAddressCreated = 'CUSTOMER_ADDRESS_CREATED',
    CustomerAddressDeleted = 'CUSTOMER_ADDRESS_DELETED',
    CustomerAddressUpdated = 'CUSTOMER_ADDRESS_UPDATED',
    CustomerDetailUpdated = 'CUSTOMER_DETAIL_UPDATED',
    CustomerEmailUpdateRequested = 'CUSTOMER_EMAIL_UPDATE_REQUESTED',
    CustomerEmailUpdateVerified = 'CUSTOMER_EMAIL_UPDATE_VERIFIED',
    CustomerNote = 'CUSTOMER_NOTE',
    CustomerPasswordResetRequested = 'CUSTOMER_PASSWORD_RESET_REQUESTED',
    CustomerPasswordResetVerified = 'CUSTOMER_PASSWORD_RESET_VERIFIED',
    CustomerPasswordUpdated = 'CUSTOMER_PASSWORD_UPDATED',
    CustomerRegistered = 'CUSTOMER_REGISTERED',
    CustomerRemovedFromGroup = 'CUSTOMER_REMOVED_FROM_GROUP',
    CustomerVerified = 'CUSTOMER_VERIFIED',
    OrderCancellation = 'ORDER_CANCELLATION',
    OrderCouponApplied = 'ORDER_COUPON_APPLIED',
    OrderCouponRemoved = 'ORDER_COUPON_REMOVED',
    OrderCurrencyUpdated = 'ORDER_CURRENCY_UPDATED',
    OrderCustomerUpdated = 'ORDER_CUSTOMER_UPDATED',
    OrderFulfillment = 'ORDER_FULFILLMENT',
    OrderFulfillmentTransition = 'ORDER_FULFILLMENT_TRANSITION',
    OrderModified = 'ORDER_MODIFIED',
    OrderNote = 'ORDER_NOTE',
    OrderPaymentTransition = 'ORDER_PAYMENT_TRANSITION',
    OrderRefundTransition = 'ORDER_REFUND_TRANSITION',
    OrderStateTransition = 'ORDER_STATE_TRANSITION',
}

/** Operators for filtering on a list of ID fields */
export type IdListOperators = {
    inList: Scalars['ID']['input'];
};

/** Operators for filtering on an ID field */
export type IdOperators = {
    eq?: InputMaybe<Scalars['String']['input']>;
    in?: InputMaybe<Array<Scalars['String']['input']>>;
    isNull?: InputMaybe<Scalars['Boolean']['input']>;
    notEq?: InputMaybe<Scalars['String']['input']>;
    notIn?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ImportInfo = {
    errors: Maybe<Array<Scalars['String']['output']>>;
    imported: Scalars['Int']['output'];
    processed: Scalars['Int']['output'];
};

/** Returned when attempting to set a ShippingMethod for which the Order is not eligible */
export type IneligibleShippingMethodError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned when attempting to add more items to the Order than are available */
export type InsufficientStockError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    order: Order;
    quantityAvailable: Scalars['Int']['output'];
};

/**
 * Returned if attempting to create a Fulfillment when there is insufficient
 * stockOnHand of a ProductVariant to satisfy the requested quantity.
 */
export type InsufficientStockOnHandError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    productVariantId: Scalars['ID']['output'];
    productVariantName: Scalars['String']['output'];
    stockOnHand: Scalars['Int']['output'];
};

export type IntCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max: Maybe<Scalars['Int']['output']>;
    min: Maybe<Scalars['Int']['output']>;
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    step: Maybe<Scalars['Int']['output']>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type IntStructFieldConfig = StructField & {
    description: Maybe<Array<LocalizedString>>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max: Maybe<Scalars['Int']['output']>;
    min: Maybe<Scalars['Int']['output']>;
    name: Scalars['String']['output'];
    step: Maybe<Scalars['Int']['output']>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

/** Returned if the user authentication credentials are not valid */
export type InvalidCredentialsError = ErrorResult & {
    authenticationError: Scalars['String']['output'];
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned if the specified FulfillmentHandler code is not valid */
export type InvalidFulfillmentHandlerError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Invoice = {
    amount: Scalars['Int']['output'];
    branchId: Maybe<Scalars['ID']['output']>;
    counterpartyId: Scalars['ID']['output'];
    createdAt: Scalars['DateTime']['output'];
    currencyCode: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    /** Resolved via InvoiceFieldResolver.lines — must be declared here too: registering InvoiceFieldResolver without declaring every field it resolves throws 'Invoice.lines defined in resolvers, but not in schema' at bootstrap (real incident, caught before merging). */
    lines: Array<OrderLine>;
    /** Human-facing business number — generated at creation, distinct from the order's own code — see Invoice.number's own doc comment (invoice.entity.ts). */
    number: Scalars['String']['output'];
    /** Resolved via InvoiceFieldResolver.order — was previously registered only for shopApiExtensions, so no admin client could ever request it (real bug: InvoicesTable.vue linked to /orders/<orderId> instead of /orders/<order.code>, landing on a broken page). */
    order: InvoiceOrder;
    orderId: Scalars['ID']['output'];
    organizationId: Scalars['ID']['output'];
    status: Scalars['String']['output'];
};

export type InvoiceList = {
    items: Array<Invoice>;
    totalItems: Scalars['Int']['output'];
};

export type InvoiceListOptions = {
    /** Substring match against the invoice's own number (Invoice.number). */
    search?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    status?: InputMaybe<Scalars['String']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

/** Mirrors shop.schema.ts's InvoiceOrder — a lightweight ref, not the full core Order type. */
export type InvoiceOrder = {
    code: Scalars['String']['output'];
    id: Scalars['ID']['output'];
};

/** Returned if the specified items are already part of a Fulfillment */
export type ItemsAlreadyFulfilledError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Job = Node & {
    attempts: Scalars['Int']['output'];
    createdAt: Scalars['DateTime']['output'];
    data: Maybe<Scalars['JSON']['output']>;
    duration: Scalars['Int']['output'];
    error: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    isSettled: Scalars['Boolean']['output'];
    progress: Scalars['Float']['output'];
    queueName: Scalars['String']['output'];
    result: Maybe<Scalars['JSON']['output']>;
    retries: Scalars['Int']['output'];
    settledAt: Maybe<Scalars['DateTime']['output']>;
    startedAt: Maybe<Scalars['DateTime']['output']>;
    state: JobState;
};

export type JobBufferSize = {
    bufferId: Scalars['String']['output'];
    size: Scalars['Int']['output'];
};

export type JobFilterParameter = {
    _and?: InputMaybe<Array<JobFilterParameter>>;
    _or?: InputMaybe<Array<JobFilterParameter>>;
    attempts?: InputMaybe<NumberOperators>;
    createdAt?: InputMaybe<DateOperators>;
    duration?: InputMaybe<NumberOperators>;
    id?: InputMaybe<IdOperators>;
    isSettled?: InputMaybe<BooleanOperators>;
    progress?: InputMaybe<NumberOperators>;
    queueName?: InputMaybe<StringOperators>;
    retries?: InputMaybe<NumberOperators>;
    settledAt?: InputMaybe<DateOperators>;
    startedAt?: InputMaybe<DateOperators>;
    state?: InputMaybe<StringOperators>;
};

export type JobList = PaginatedList & {
    items: Array<Job>;
    totalItems: Scalars['Int']['output'];
};

export type JobListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<JobFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<JobSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type JobQueue = {
    name: Scalars['String']['output'];
    running: Scalars['Boolean']['output'];
};

export type JobSortParameter = {
    attempts?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    duration?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    progress?: InputMaybe<SortOrder>;
    queueName?: InputMaybe<SortOrder>;
    retries?: InputMaybe<SortOrder>;
    settledAt?: InputMaybe<SortOrder>;
    startedAt?: InputMaybe<SortOrder>;
};

/**
 * @description
 * The state of a Job in the JobQueue
 *
 * @docsCategory common
 */
export enum JobState {
    Cancelled = 'CANCELLED',
    Completed = 'COMPLETED',
    Failed = 'FAILED',
    Pending = 'PENDING',
    Retrying = 'RETRYING',
    Running = 'RUNNING',
}

/**
 * @description
 * Languages in the form of a ISO 639-1 language code with optional
 * region or script modifier (e.g. de_AT). The selection available is based
 * on the [Unicode CLDR summary list](https://unicode-org.github.io/cldr-staging/charts/37/summary/root.html)
 * and includes the major spoken languages of the world and any widely-used variants.
 *
 * @docsCategory common
 */
export enum LanguageCode {
    /** Afrikaans */
    Af = 'af',
    /** Akan */
    Ak = 'ak',
    /** Amharic */
    Am = 'am',
    /** Arabic */
    Ar = 'ar',
    /** Assamese */
    As = 'as',
    /** Azerbaijani */
    Az = 'az',
    /** Belarusian */
    Be = 'be',
    /** Bulgarian */
    Bg = 'bg',
    /** Bambara */
    Bm = 'bm',
    /** Bangla */
    Bn = 'bn',
    /** Tibetan */
    Bo = 'bo',
    /** Breton */
    Br = 'br',
    /** Bosnian */
    Bs = 'bs',
    /** Catalan */
    Ca = 'ca',
    /** Chechen */
    Ce = 'ce',
    /** Corsican */
    Co = 'co',
    /** Czech */
    Cs = 'cs',
    /** Church Slavic */
    Cu = 'cu',
    /** Welsh */
    Cy = 'cy',
    /** Danish */
    Da = 'da',
    /** German */
    De = 'de',
    /** Austrian German */
    DeAt = 'de_AT',
    /** Swiss High German */
    DeCh = 'de_CH',
    /** Dzongkha */
    Dz = 'dz',
    /** Ewe */
    Ee = 'ee',
    /** Greek */
    El = 'el',
    /** English */
    En = 'en',
    /** Australian English */
    EnAu = 'en_AU',
    /** Canadian English */
    EnCa = 'en_CA',
    /** British English */
    EnGb = 'en_GB',
    /** American English */
    EnUs = 'en_US',
    /** Esperanto */
    Eo = 'eo',
    /** Spanish */
    Es = 'es',
    /** European Spanish */
    EsEs = 'es_ES',
    /** Mexican Spanish */
    EsMx = 'es_MX',
    /** Estonian */
    Et = 'et',
    /** Basque */
    Eu = 'eu',
    /** Persian */
    Fa = 'fa',
    /** Dari */
    FaAf = 'fa_AF',
    /** Fulah */
    Ff = 'ff',
    /** Finnish */
    Fi = 'fi',
    /** Faroese */
    Fo = 'fo',
    /** French */
    Fr = 'fr',
    /** Canadian French */
    FrCa = 'fr_CA',
    /** Swiss French */
    FrCh = 'fr_CH',
    /** Western Frisian */
    Fy = 'fy',
    /** Irish */
    Ga = 'ga',
    /** Scottish Gaelic */
    Gd = 'gd',
    /** Galician */
    Gl = 'gl',
    /** Gujarati */
    Gu = 'gu',
    /** Manx */
    Gv = 'gv',
    /** Hausa */
    Ha = 'ha',
    /** Hebrew */
    He = 'he',
    /** Hindi */
    Hi = 'hi',
    /** Croatian */
    Hr = 'hr',
    /** Haitian Creole */
    Ht = 'ht',
    /** Hungarian */
    Hu = 'hu',
    /** Armenian */
    Hy = 'hy',
    /** Interlingua */
    Ia = 'ia',
    /** Indonesian */
    Id = 'id',
    /** Igbo */
    Ig = 'ig',
    /** Sichuan Yi */
    Ii = 'ii',
    /** Icelandic */
    Is = 'is',
    /** Italian */
    It = 'it',
    /** Japanese */
    Ja = 'ja',
    /** Javanese */
    Jv = 'jv',
    /** Georgian */
    Ka = 'ka',
    /** Kikuyu */
    Ki = 'ki',
    /** Kazakh */
    Kk = 'kk',
    /** Kalaallisut */
    Kl = 'kl',
    /** Khmer */
    Km = 'km',
    /** Kannada */
    Kn = 'kn',
    /** Korean */
    Ko = 'ko',
    /** Kashmiri */
    Ks = 'ks',
    /** Kurdish */
    Ku = 'ku',
    /** Cornish */
    Kw = 'kw',
    /** Kyrgyz */
    Ky = 'ky',
    /** Latin */
    La = 'la',
    /** Luxembourgish */
    Lb = 'lb',
    /** Ganda */
    Lg = 'lg',
    /** Lingala */
    Ln = 'ln',
    /** Lao */
    Lo = 'lo',
    /** Lithuanian */
    Lt = 'lt',
    /** Luba-Katanga */
    Lu = 'lu',
    /** Latvian */
    Lv = 'lv',
    /** Malagasy */
    Mg = 'mg',
    /** Maori */
    Mi = 'mi',
    /** Macedonian */
    Mk = 'mk',
    /** Malayalam */
    Ml = 'ml',
    /** Mongolian */
    Mn = 'mn',
    /** Marathi */
    Mr = 'mr',
    /** Malay */
    Ms = 'ms',
    /** Maltese */
    Mt = 'mt',
    /** Burmese */
    My = 'my',
    /** Norwegian Bokmål */
    Nb = 'nb',
    /** North Ndebele */
    Nd = 'nd',
    /** Nepali */
    Ne = 'ne',
    /** Dutch */
    Nl = 'nl',
    /** Flemish */
    NlBe = 'nl_BE',
    /** Norwegian Nynorsk */
    Nn = 'nn',
    /** Nyanja */
    Ny = 'ny',
    /** Oromo */
    Om = 'om',
    /** Odia */
    Or = 'or',
    /** Ossetic */
    Os = 'os',
    /** Punjabi */
    Pa = 'pa',
    /** Polish */
    Pl = 'pl',
    /** Pashto */
    Ps = 'ps',
    /** Portuguese */
    Pt = 'pt',
    /** Brazilian Portuguese */
    PtBr = 'pt_BR',
    /** European Portuguese */
    PtPt = 'pt_PT',
    /** Quechua */
    Qu = 'qu',
    /** Romansh */
    Rm = 'rm',
    /** Rundi */
    Rn = 'rn',
    /** Romanian */
    Ro = 'ro',
    /** Moldavian */
    RoMd = 'ro_MD',
    /** Russian */
    Ru = 'ru',
    /** Kinyarwanda */
    Rw = 'rw',
    /** Sanskrit */
    Sa = 'sa',
    /** Sindhi */
    Sd = 'sd',
    /** Northern Sami */
    Se = 'se',
    /** Sango */
    Sg = 'sg',
    /** Sinhala */
    Si = 'si',
    /** Slovak */
    Sk = 'sk',
    /** Slovenian */
    Sl = 'sl',
    /** Samoan */
    Sm = 'sm',
    /** Shona */
    Sn = 'sn',
    /** Somali */
    So = 'so',
    /** Albanian */
    Sq = 'sq',
    /** Serbian */
    Sr = 'sr',
    /** Southern Sotho */
    St = 'st',
    /** Sundanese */
    Su = 'su',
    /** Swedish */
    Sv = 'sv',
    /** Swahili */
    Sw = 'sw',
    /** Congo Swahili */
    SwCd = 'sw_CD',
    /** Tamil */
    Ta = 'ta',
    /** Telugu */
    Te = 'te',
    /** Tajik */
    Tg = 'tg',
    /** Thai */
    Th = 'th',
    /** Tigrinya */
    Ti = 'ti',
    /** Turkmen */
    Tk = 'tk',
    /** Tongan */
    To = 'to',
    /** Turkish */
    Tr = 'tr',
    /** Tatar */
    Tt = 'tt',
    /** Uyghur */
    Ug = 'ug',
    /** Ukrainian */
    Uk = 'uk',
    /** Urdu */
    Ur = 'ur',
    /** Uzbek */
    Uz = 'uz',
    /** Vietnamese */
    Vi = 'vi',
    /** Volapük */
    Vo = 'vo',
    /** Wolof */
    Wo = 'wo',
    /** Xhosa */
    Xh = 'xh',
    /** Yiddish */
    Yi = 'yi',
    /** Yoruba */
    Yo = 'yo',
    /** Chinese */
    Zh = 'zh',
    /** Simplified Chinese */
    ZhHans = 'zh_Hans',
    /** Traditional Chinese */
    ZhHant = 'zh_Hant',
    /** Zulu */
    Zu = 'zu',
}

/** Returned if attempting to set a Channel's defaultLanguageCode to a language which is not enabled in GlobalSettings */
export type LanguageNotAvailableError = ErrorResult & {
    errorCode: ErrorCode;
    languageCode: Scalars['String']['output'];
    message: Scalars['String']['output'];
};

export type LocaleStringCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    length: Maybe<Scalars['Int']['output']>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    pattern: Maybe<Scalars['String']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type LocaleTextCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type LocalizedString = {
    languageCode: LanguageCode;
    value: Scalars['String']['output'];
};

export enum LogicalOperator {
    And = 'AND',
    Or = 'OR',
}

export type ManualPaymentInput = {
    metadata?: InputMaybe<Scalars['JSON']['input']>;
    method: Scalars['String']['input'];
    orderId: Scalars['ID']['input'];
    transactionId?: InputMaybe<Scalars['String']['input']>;
};

/**
 * Returned when a call to addManualPaymentToOrder is made but the Order
 * is not in the required state.
 */
export type ManualPaymentStateError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type MimeTypeError = ErrorResult & {
    errorCode: ErrorCode;
    fileName: Scalars['String']['output'];
    message: Scalars['String']['output'];
    mimeType: Scalars['String']['output'];
};

/** Returned if a PromotionCondition has neither a couponCode nor any conditions set */
export type MissingConditionsError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type ModifyOrderInput = {
    addItems?: InputMaybe<Array<AddItemInput>>;
    adjustOrderLines?: InputMaybe<Array<OrderLineInput>>;
    couponCodes?: InputMaybe<Array<Scalars['String']['input']>>;
    customFields?: InputMaybe<UpdateOrderCustomFieldsInput>;
    dryRun: Scalars['Boolean']['input'];
    note?: InputMaybe<Scalars['String']['input']>;
    options?: InputMaybe<ModifyOrderOptions>;
    orderId: Scalars['ID']['input'];
    /**
     * Deprecated in v2.2.0. Use `refunds` instead to allow multiple refunds to be
     * applied in the case that multiple payment methods have been used on the order.
     */
    refund?: InputMaybe<AdministratorRefundInput>;
    refunds?: InputMaybe<Array<AdministratorRefundInput>>;
    /** Added in v2.2 */
    shippingMethodIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    surcharges?: InputMaybe<Array<SurchargeInput>>;
    updateBillingAddress?: InputMaybe<UpdateOrderAddressInput>;
    updateShippingAddress?: InputMaybe<UpdateOrderAddressInput>;
};

export type ModifyOrderOptions = {
    freezePromotions?: InputMaybe<Scalars['Boolean']['input']>;
    recalculateShipping?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ModifyOrderResult =
    | CouponCodeExpiredError
    | CouponCodeInvalidError
    | CouponCodeLimitError
    | IneligibleShippingMethodError
    | InsufficientStockError
    | NegativeQuantityError
    | NoChangesSpecifiedError
    | Order
    | OrderLimitError
    | OrderModificationStateError
    | PaymentMethodMissingError
    | RefundPaymentIdMissingError;

export type MoneyAmount = {
    amount: Scalars['Int']['output'];
    currencyCode: Scalars['String']['output'];
};

export type MoveCollectionInput = {
    collectionId: Scalars['ID']['input'];
    index: Scalars['Int']['input'];
    parentId: Scalars['ID']['input'];
};

/** Returned if an operation has specified OrderLines from multiple Orders */
export type MultipleOrderError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Mutation = {
    addCounterpartyTeamMember: CounterpartyTeamMember;
    /** Add Customers to a CustomerGroup */
    addCustomersToGroup: CustomerGroup;
    addFulfillmentToOrder: AddFulfillmentToOrderResult;
    /** Adds an item to the draft Order. */
    addItemToDraftOrder: UpdateOrderItemsResult;
    /**
     * Used to manually create a new Payment against an Order.
     * This can be used by an Administrator when an Order is in the ArrangingPayment state.
     *
     * It is also used when a completed Order
     * has been modified (using `modifyOrder`) and the price has increased. The extra payment
     * can then be manually arranged by the administrator, and the details used to create a new
     * Payment.
     */
    addManualPaymentToOrder: AddManualPaymentToOrderResult;
    /** Add members to a Zone */
    addMembersToZone: Zone;
    addNoteToCustomer: Customer;
    addNoteToOrder: Order;
    /** Add an OptionGroup to a Product */
    addOptionGroupToProduct: Product;
    /** Adjusts a draft OrderLine. If custom fields are defined on the OrderLine entity, a third argument 'customFields' of type `OrderLineCustomFieldsInput` will be available. */
    adjustDraftOrderLine: UpdateOrderItemsResult;
    /** Applies the given coupon code to the draft Order */
    applyCouponCodeToDraftOrder: ApplyCouponCodeResult;
    /** Assign assets to channel */
    assignAssetsToChannel: Array<Asset>;
    /** Assigns Collections to the specified Channel */
    assignCollectionsToChannel: Array<Collection>;
    assignCustomerToCounterparty: Scalars['Boolean']['output'];
    /** Assigns Facets to the specified Channel */
    assignFacetsToChannel: Array<Facet>;
    /** Assigns PaymentMethods to the specified Channel */
    assignPaymentMethodsToChannel: Array<PaymentMethod>;
    /** Assigns ProductOptionGroups to the specified Channel */
    assignProductOptionGroupsToChannel: Array<ProductOptionGroup>;
    /** Assigns ProductVariants to the specified Channel */
    assignProductVariantsToChannel: Array<ProductVariant>;
    /** Assigns all ProductVariants of Product to the specified Channel */
    assignProductsToChannel: Array<Product>;
    /** Assigns Promotions to the specified Channel */
    assignPromotionsToChannel: Array<Promotion>;
    /** Assign a Role to an Administrator */
    assignRoleToAdministrator: Administrator;
    /** Assigns ShippingMethods to the specified Channel */
    assignShippingMethodsToChannel: Array<ShippingMethod>;
    /** Assigns StockLocations to the specified Channel */
    assignStockLocationsToChannel: Array<StockLocation>;
    /** Authenticates the user using a named authentication strategy */
    authenticate: AuthenticationResult;
    backfillDiscountRegistry: Scalars['Int']['output'];
    bulkUpsertDiscountRules: Scalars['Int']['output'];
    bulkUpsertPriceEntries: Scalars['Int']['output'];
    cancelJob: Job;
    cancelOrder: CancelOrderResult;
    cancelPayment: CancelPaymentResult;
    confirmOrder: Array<Reservation>;
    /** Create a new Administrator */
    createAdministrator: Administrator;
    /**
     * Generates a new API-Key and attaches it to an Administrator.
     * Returns the generated API-Key.
     * API-Keys cannot be viewed again after creation.
     */
    createApiKey: CreateApiKeyResult;
    createApprovalRequest: ApprovalRequest;
    /** Create a new Asset */
    createAssets: Array<CreateAssetResult>;
    createBranch: Branch;
    /** Create a new Channel */
    createChannel: CreateChannelResult;
    /** Create a new Collection */
    createCollection: Collection;
    /** Create a new Country */
    createCountry: Country;
    /** Create a new Customer. If a password is provided, a new User will also be created an linked to the Customer. */
    createCustomer: CreateCustomerResult;
    /** Create a new Address and associate it with the Customer specified by customerId */
    createCustomerAddress: Address;
    /** Create a new CustomerGroup */
    createCustomerGroup: CustomerGroup;
    /** Creates a draft Order */
    createDraftOrder: Order;
    /** Create a new Facet */
    createFacet: Facet;
    /** Create a single FacetValue */
    createFacetValue: FacetValue;
    /** Create one or more FacetValues */
    createFacetValues: Array<FacetValue>;
    /** Create existing PaymentMethod */
    createPaymentMethod: PaymentMethod;
    /** Create a new Product */
    createProduct: Product;
    /** Create a new ProductOption within a ProductOptionGroup */
    createProductOption: ProductOption;
    /** Create a new ProductOptionGroup */
    createProductOptionGroup: ProductOptionGroup;
    /** Create a set of ProductVariants based on the OptionGroups assigned to the given Product */
    createProductVariants: Array<Maybe<ProductVariant>>;
    createPromotion: CreatePromotionResult;
    /** Create a new Province */
    createProvince: Province;
    /** Create a new Role */
    createRole: Role;
    /** Create a new Seller */
    createSeller: Seller;
    /** Create a new ShippingMethod */
    createShippingMethod: ShippingMethod;
    createStockLocation: StockLocation;
    /** Create a new Tag */
    createTag: Tag;
    /** Create a new TaxCategory */
    createTaxCategory: TaxCategory;
    /** Create a new TaxRate */
    createTaxRate: TaxRate;
    /** Create a new Zone */
    createZone: Zone;
    decideApprovalRequest: ApprovalRequest;
    decideCreditTermRequest: ApprovalRequest;
    decideDiscountGrantRequest: ApprovalRequest;
    decidePriceAdjustmentRequest: ApprovalRequest;
    /** Delete an Administrator */
    deleteAdministrator: DeletionResponse;
    /** Delete multiple Administrators */
    deleteAdministrators: Array<DeletionResponse>;
    /** Deletes API-Keys */
    deleteApiKeys: Array<DeletionResponse>;
    /** Delete an Asset */
    deleteAsset: DeletionResponse;
    /** Delete multiple Assets */
    deleteAssets: DeletionResponse;
    /** Delete a Channel */
    deleteChannel: DeletionResponse;
    /** Delete multiple Channels */
    deleteChannels: Array<DeletionResponse>;
    /** Delete a Collection and all of its descendants */
    deleteCollection: DeletionResponse;
    /** Delete multiple Collections and all of their descendants */
    deleteCollections: Array<DeletionResponse>;
    /** Delete multiple Countries */
    deleteCountries: Array<DeletionResponse>;
    /** Delete a Country */
    deleteCountry: DeletionResponse;
    /** Delete a Customer */
    deleteCustomer: DeletionResponse;
    /** Update an existing Address */
    deleteCustomerAddress: Success;
    /** Delete a CustomerGroup */
    deleteCustomerGroup: DeletionResponse;
    /** Delete multiple CustomerGroups */
    deleteCustomerGroups: Array<DeletionResponse>;
    deleteCustomerNote: DeletionResponse;
    /** Deletes Customers */
    deleteCustomers: Array<DeletionResponse>;
    /** Deletes a draft Order */
    deleteDraftOrder: DeletionResponse;
    /** Delete an existing Facet */
    deleteFacet: DeletionResponse;
    /** Delete one or more FacetValues */
    deleteFacetValues: Array<DeletionResponse>;
    /** Delete multiple existing Facets */
    deleteFacets: Array<DeletionResponse>;
    deleteOrderNote: DeletionResponse;
    /** Delete a PaymentMethod */
    deletePaymentMethod: DeletionResponse;
    /** Delete multiple PaymentMethods */
    deletePaymentMethods: Array<DeletionResponse>;
    /** Delete a Product */
    deleteProduct: DeletionResponse;
    /** Delete a ProductOption */
    deleteProductOption: DeletionResponse;
    /** Delete a ProductOptionGroup */
    deleteProductOptionGroup: DeletionResponse;
    /** Delete multiple ProductOptionGroups */
    deleteProductOptionGroups: Array<DeletionResponse>;
    /** Delete a ProductVariant */
    deleteProductVariant: DeletionResponse;
    /** Delete multiple ProductVariants */
    deleteProductVariants: Array<DeletionResponse>;
    /** Delete multiple Products */
    deleteProducts: Array<DeletionResponse>;
    deletePromotion: DeletionResponse;
    deletePromotions: Array<DeletionResponse>;
    /** Delete a Province */
    deleteProvince: DeletionResponse;
    /** Delete an existing Role */
    deleteRole: DeletionResponse;
    /** Delete multiple Roles */
    deleteRoles: Array<DeletionResponse>;
    /** Delete a Seller */
    deleteSeller: DeletionResponse;
    /** Delete multiple Sellers */
    deleteSellers: Array<DeletionResponse>;
    /** Delete a ShippingMethod */
    deleteShippingMethod: DeletionResponse;
    /** Delete multiple ShippingMethods */
    deleteShippingMethods: Array<DeletionResponse>;
    deleteStockLocation: DeletionResponse;
    deleteStockLocations: Array<DeletionResponse>;
    deleteTableView: Scalars['Boolean']['output'];
    /** Delete an existing Tag */
    deleteTag: DeletionResponse;
    /** Deletes multiple TaxCategories */
    deleteTaxCategories: Array<DeletionResponse>;
    /** Deletes a TaxCategory */
    deleteTaxCategory: DeletionResponse;
    /** Delete a TaxRate */
    deleteTaxRate: DeletionResponse;
    /** Delete multiple TaxRates */
    deleteTaxRates: Array<DeletionResponse>;
    /** Delete a Zone */
    deleteZone: DeletionResponse;
    /** Delete a Zone */
    deleteZones: Array<DeletionResponse>;
    /**
     * Duplicate an existing entity using a specific EntityDuplicator.
     * Since v2.2.0.
     */
    duplicateEntity: DuplicateEntityResult;
    endAllSessions: Scalars['Boolean']['output'];
    endOtherSessions: Scalars['Boolean']['output'];
    endSession: Scalars['Boolean']['output'];
    escalateApprovalRequest: ApprovalRequest;
    extendOrderReservation: Array<Reservation>;
    flushBufferedJobs: Success;
    generateContract: Scalars['Boolean']['output'];
    importProducts: Maybe<ImportInfo>;
    /**
     * Authenticates the user using the native authentication strategy. This mutation is an alias for authenticate({ native: { ... }})
     *
     * The `rememberMe` option applies when using cookie-based sessions, and if `true` it will set the maxAge of the session cookie
     * to 1 year.
     */
    login: NativeAuthenticationResult;
    logout: Success;
    markNotificationRead: Notification;
    /**
     * Allows an Order to be modified after it has been completed by the Customer. The Order must first
     * be in the `Modifying` state.
     */
    modifyOrder: ModifyOrderResult;
    /** Move a Collection to a different parent or index */
    moveCollection: Collection;
    reassignCounterpartyManager: Counterparty;
    /** Records a real Dispute/chargeback row for a payment — its own lifecycle, never folded into PaymentAttempt.paymentStatus. */
    recordPaymentDispute: Dispute;
    /** Records a real PaymentRefund row (the external-integration-rules skill: a refund is its own entity, never a negative payment record), modeled on Robokassa's RefundOperation API — providerRefundId mirrors Robokassa's OpKey. */
    recordPaymentRefund: PaymentRefund;
    recordWitnessedPayment: Scalars['Boolean']['output'];
    refundOrder: RefundOrderResult;
    reindex: Job;
    releaseOrderReservation: Scalars['Int']['output'];
    /** Removes Collections from the specified Channel */
    removeCollectionsFromChannel: Array<Collection>;
    removeCounterpartyTeamMember: Scalars['Boolean']['output'];
    /** Removes the given coupon code from the draft Order */
    removeCouponCodeFromDraftOrder: Maybe<Order>;
    /** Remove Customers from a CustomerGroup */
    removeCustomersFromGroup: CustomerGroup;
    /** Remove an OrderLine from the draft Order */
    removeDraftOrderLine: RemoveOrderItemsResult;
    /** Removes Facets from the specified Channel */
    removeFacetsFromChannel: Array<RemoveFacetFromChannelResult>;
    /** Remove members from a Zone */
    removeMembersFromZone: Zone;
    /**
     * Remove an OptionGroup from a Product. If the OptionGroup is in use by any ProductVariants
     * the mutation will return a ProductOptionInUseError, and the OptionGroup will not be removed.
     * Setting the `force` argument to `true` will override this and remove the OptionGroup anyway,
     * as well as removing any of the group's options from the Product's ProductVariants.
     */
    removeOptionGroupFromProduct: RemoveOptionGroupFromProductResult;
    /** Removes PaymentMethods from the specified Channel */
    removePaymentMethodsFromChannel: Array<PaymentMethod>;
    /** Removes ProductOptionGroups from the specified Channel */
    removeProductOptionGroupsFromChannel: Array<RemoveProductOptionGroupFromChannelResult>;
    /** Removes ProductVariants from the specified Channel */
    removeProductVariantsFromChannel: Array<ProductVariant>;
    /** Removes all ProductVariants of Product from the specified Channel */
    removeProductsFromChannel: Array<Product>;
    /** Removes Promotions from the specified Channel */
    removePromotionsFromChannel: Array<Promotion>;
    /** Remove all settled jobs in the given queues older than the given date. Returns the number of jobs deleted. */
    removeSettledJobs: Scalars['Int']['output'];
    /** Removes ShippingMethods from the specified Channel */
    removeShippingMethodsFromChannel: Array<ShippingMethod>;
    /** Removes StockLocations from the specified Channel */
    removeStockLocationsFromChannel: Array<StockLocation>;
    requestCreditTermExtension: ApprovalRequest;
    requestDiscountGrant: ApprovalRequest;
    requestPriceAdjustment: PriceAdjustmentResult;
    /** Marks an open ErpReconciliationIssue as resolved by a human, with a required free-text resolution note — never auto-resolved. */
    resolveErpReconciliationIssue: ErpReconciliationIssue;
    resolveNotification: Notification;
    /**
     * Replaces the old with a new API-Key.
     * This is a convenience method to invalidate an API-Key without
     * deleting the underlying roles and permissions.
     */
    rotateApiKey: RotateApiKeyResult;
    /** Manually runs the reconciliation comparison against Integration Service immediately, instead of waiting for the daily ScheduledTask (issue #84) — same ReconciliationService.runComparison the scheduled run uses, recorded with triggeredBy='manual' and the calling administrator's id. */
    runErpReconciliation: ErpReconciliationRunResult;
    runPendingSearchIndexUpdates: Success;
    runScheduledTask: Success;
    saveTableView: SavedTableView;
    setBranchSettings: BranchSettings;
    setCreditTermLimit: CreditTermLimit;
    setCustomerForDraftOrder: SetCustomerForDraftOrderResult;
    setCustomerPriceType: Customer;
    /** Sets the billing address for a draft Order */
    setDraftOrderBillingAddress: Order;
    /** Allows any custom fields to be set for the active order */
    setDraftOrderCustomFields: Order;
    /** Sets the shipping address for a draft Order */
    setDraftOrderShippingAddress: Order;
    /** Sets the shipping method by id, which can be obtained with the `eligibleShippingMethodsForDraftOrder` query */
    setDraftOrderShippingMethod: SetOrderShippingMethodResult;
    setOrderCustomFields: Maybe<Order>;
    /** Allows a different Customer to be assigned to an Order. Added in v2.2.0. */
    setOrderCustomer: Maybe<Order>;
    setOrganizationLogo: Scalars['Boolean']['output'];
    setPreferredTradingPoint: Scalars['Boolean']['output'];
    setReservationExtensionLimit: ReservationExtensionLimit;
    setRoleAccessScopeConfig: Scalars['Boolean']['output'];
    /** Set a single key-value pair (automatically scoped based on field configuration) */
    setSettingsStoreValue: SetSettingsStoreValueResult;
    /** Set multiple key-value pairs in a transaction (each automatically scoped) */
    setSettingsStoreValues: Array<SetSettingsStoreValueResult>;
    setTradingPointActive: TradingPoint;
    settlePayment: SettlePaymentResult;
    settleRefund: SettleRefundResult;
    transitionFulfillmentToState: TransitionFulfillmentToStateResult;
    transitionOrderToState: Maybe<TransitionOrderToStateResult>;
    transitionPaymentToState: TransitionPaymentToStateResult;
    /** Manually runs one payment inbox sweep immediately, instead of waiting for the periodic worker. Ops/test visibility only — does not change the async processing contract (the external-integration-rules skill): this still goes through the same InboxService.claimBatch/PaymentInboxProcessorService path the timer uses, it just runs it on demand. */
    triggerPaymentInboxSweep: PaymentInboxSweepResult;
    /** Unsets the billing address for a draft Order */
    unsetDraftOrderBillingAddress: Order;
    /** Unsets the shipping address for a draft Order */
    unsetDraftOrderShippingAddress: Order;
    /** Update the active (currently logged-in) Administrator */
    updateActiveAdministrator: Administrator;
    /** Update an existing Administrator */
    updateAdministrator: Administrator;
    /** Updates an API-Key */
    updateApiKey: ApiKey;
    /** Update an existing Asset */
    updateAsset: Asset;
    /** Update an existing Channel */
    updateChannel: UpdateChannelResult;
    /** Update an existing Collection */
    updateCollection: Collection;
    /** Update an existing Country */
    updateCountry: Country;
    /** Update an existing Customer */
    updateCustomer: UpdateCustomerResult;
    /** Update an existing Address */
    updateCustomerAddress: Address;
    /** Update an existing CustomerGroup */
    updateCustomerGroup: CustomerGroup;
    updateCustomerNote: HistoryEntry;
    /** Update an existing Facet */
    updateFacet: Facet;
    /** Update a single FacetValue */
    updateFacetValue: FacetValue;
    /** Update one or more FacetValues */
    updateFacetValues: Array<FacetValue>;
    updateGlobalSettings: UpdateGlobalSettingsResult;
    updateOrderNote: HistoryEntry;
    /** Update an existing PaymentMethod */
    updatePaymentMethod: PaymentMethod;
    /** Update an existing Product */
    updateProduct: Product;
    /** Create a new ProductOption within a ProductOptionGroup */
    updateProductOption: ProductOption;
    /** Update an existing ProductOptionGroup */
    updateProductOptionGroup: ProductOptionGroup;
    /** Update an existing ProductVariant */
    updateProductVariant: ProductVariant;
    /** Update existing ProductVariants */
    updateProductVariants: Array<Maybe<ProductVariant>>;
    /** Update multiple existing Products */
    updateProducts: Array<Product>;
    updatePromotion: UpdatePromotionResult;
    /** Update an existing Province */
    updateProvince: Province;
    /** Update an existing Role */
    updateRole: Role;
    updateScheduledTask: ScheduledTask;
    /** Update an existing Seller */
    updateSeller: Seller;
    /** Update an existing ShippingMethod */
    updateShippingMethod: ShippingMethod;
    updateStockLocation: StockLocation;
    /** Update an existing Tag */
    updateTag: Tag;
    /** Update an existing TaxCategory */
    updateTaxCategory: TaxCategory;
    /** Update an existing TaxRate */
    updateTaxRate: TaxRate;
    updateTradingPointComment: TradingPoint;
    updateTradingPointDetails: TradingPoint;
    updateWarehouseBranchAssignment: Warehouse;
    /** Update an existing Zone */
    updateZone: Zone;
    upsertCounterparty: Counterparty;
    upsertDiscountRule: DiscountRule;
    upsertPriceEntry: PriceEntry;
    upsertPriceType: PriceType;
    upsertTradingPoint: TradingPoint;
    upsertWorkflowDefinition: WorkflowDefinition;
};

export type MutationAddCounterpartyTeamMemberArgs = {
    administratorId: Scalars['ID']['input'];
    counterpartyId: Scalars['ID']['input'];
    phone?: InputMaybe<Scalars['String']['input']>;
    role: Scalars['String']['input'];
};

export type MutationAddCustomersToGroupArgs = {
    customerGroupId: Scalars['ID']['input'];
    customerIds: Array<Scalars['ID']['input']>;
};

export type MutationAddFulfillmentToOrderArgs = {
    input: FulfillOrderInput;
};

export type MutationAddItemToDraftOrderArgs = {
    input: AddItemToDraftOrderInput;
    orderId: Scalars['ID']['input'];
};

export type MutationAddManualPaymentToOrderArgs = {
    input: ManualPaymentInput;
};

export type MutationAddMembersToZoneArgs = {
    memberIds: Array<Scalars['ID']['input']>;
    zoneId: Scalars['ID']['input'];
};

export type MutationAddNoteToCustomerArgs = {
    input: AddNoteToCustomerInput;
};

export type MutationAddNoteToOrderArgs = {
    input: AddNoteToOrderInput;
};

export type MutationAddOptionGroupToProductArgs = {
    optionGroupId: Scalars['ID']['input'];
    productId: Scalars['ID']['input'];
};

export type MutationAdjustDraftOrderLineArgs = {
    input: AdjustDraftOrderLineInput;
    orderId: Scalars['ID']['input'];
};

export type MutationApplyCouponCodeToDraftOrderArgs = {
    couponCode: Scalars['String']['input'];
    orderId: Scalars['ID']['input'];
};

export type MutationAssignAssetsToChannelArgs = {
    input: AssignAssetsToChannelInput;
};

export type MutationAssignCollectionsToChannelArgs = {
    input: AssignCollectionsToChannelInput;
};

export type MutationAssignCustomerToCounterpartyArgs = {
    customerId: Scalars['ID']['input'];
    erpId: Scalars['String']['input'];
    role: Scalars['String']['input'];
};

export type MutationAssignFacetsToChannelArgs = {
    input: AssignFacetsToChannelInput;
};

export type MutationAssignPaymentMethodsToChannelArgs = {
    input: AssignPaymentMethodsToChannelInput;
};

export type MutationAssignProductOptionGroupsToChannelArgs = {
    input: AssignProductOptionGroupsToChannelInput;
};

export type MutationAssignProductVariantsToChannelArgs = {
    input: AssignProductVariantsToChannelInput;
};

export type MutationAssignProductsToChannelArgs = {
    input: AssignProductsToChannelInput;
};

export type MutationAssignPromotionsToChannelArgs = {
    input: AssignPromotionsToChannelInput;
};

export type MutationAssignRoleToAdministratorArgs = {
    administratorId: Scalars['ID']['input'];
    roleId: Scalars['ID']['input'];
};

export type MutationAssignShippingMethodsToChannelArgs = {
    input: AssignShippingMethodsToChannelInput;
};

export type MutationAssignStockLocationsToChannelArgs = {
    input: AssignStockLocationsToChannelInput;
};

export type MutationAuthenticateArgs = {
    input: AuthenticationInput;
    rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationBulkUpsertDiscountRulesArgs = {
    entries: Array<DiscountRuleInput>;
};

export type MutationBulkUpsertPriceEntriesArgs = {
    entries: Array<PriceEntryInput>;
};

export type MutationCancelJobArgs = {
    jobId: Scalars['ID']['input'];
};

export type MutationCancelOrderArgs = {
    input: CancelOrderInput;
};

export type MutationCancelPaymentArgs = {
    id: Scalars['ID']['input'];
};

export type MutationConfirmOrderArgs = {
    orderId: Scalars['ID']['input'];
    reservationDays: Scalars['Int']['input'];
};

export type MutationCreateAdministratorArgs = {
    input: CreateAdministratorInput;
};

export type MutationCreateApiKeyArgs = {
    input: CreateApiKeyInput;
};

export type MutationCreateApprovalRequestArgs = {
    payload: Scalars['String']['input'];
    requestType: Scalars['String']['input'];
};

export type MutationCreateAssetsArgs = {
    input: Array<CreateAssetInput>;
};

export type MutationCreateBranchArgs = {
    name: Scalars['String']['input'];
};

export type MutationCreateChannelArgs = {
    input: CreateChannelInput;
};

export type MutationCreateCollectionArgs = {
    input: CreateCollectionInput;
};

export type MutationCreateCountryArgs = {
    input: CreateCountryInput;
};

export type MutationCreateCustomerArgs = {
    input: CreateCustomerInput;
    password?: InputMaybe<Scalars['String']['input']>;
};

export type MutationCreateCustomerAddressArgs = {
    customerId: Scalars['ID']['input'];
    input: CreateAddressInput;
};

export type MutationCreateCustomerGroupArgs = {
    input: CreateCustomerGroupInput;
};

export type MutationCreateFacetArgs = {
    input: CreateFacetInput;
};

export type MutationCreateFacetValueArgs = {
    input: CreateFacetValueInput;
};

export type MutationCreateFacetValuesArgs = {
    input: Array<CreateFacetValueInput>;
};

export type MutationCreatePaymentMethodArgs = {
    input: CreatePaymentMethodInput;
};

export type MutationCreateProductArgs = {
    input: CreateProductInput;
};

export type MutationCreateProductOptionArgs = {
    input: CreateProductOptionInput;
};

export type MutationCreateProductOptionGroupArgs = {
    input: CreateProductOptionGroupInput;
};

export type MutationCreateProductVariantsArgs = {
    input: Array<CreateProductVariantInput>;
};

export type MutationCreatePromotionArgs = {
    input: CreatePromotionInput;
};

export type MutationCreateProvinceArgs = {
    input: CreateProvinceInput;
};

export type MutationCreateRoleArgs = {
    input: CreateRoleInput;
};

export type MutationCreateSellerArgs = {
    input: CreateSellerInput;
};

export type MutationCreateShippingMethodArgs = {
    input: CreateShippingMethodInput;
};

export type MutationCreateStockLocationArgs = {
    input: CreateStockLocationInput;
};

export type MutationCreateTagArgs = {
    input: CreateTagInput;
};

export type MutationCreateTaxCategoryArgs = {
    input: CreateTaxCategoryInput;
};

export type MutationCreateTaxRateArgs = {
    input: CreateTaxRateInput;
};

export type MutationCreateZoneArgs = {
    input: CreateZoneInput;
};

export type MutationDecideApprovalRequestArgs = {
    comment?: InputMaybe<Scalars['String']['input']>;
    decision: Scalars['String']['input'];
    requestId: Scalars['ID']['input'];
};

export type MutationDecideCreditTermRequestArgs = {
    comment?: InputMaybe<Scalars['String']['input']>;
    decision: Scalars['String']['input'];
    requestId: Scalars['ID']['input'];
};

export type MutationDecideDiscountGrantRequestArgs = {
    comment?: InputMaybe<Scalars['String']['input']>;
    decision: Scalars['String']['input'];
    requestId: Scalars['ID']['input'];
};

export type MutationDecidePriceAdjustmentRequestArgs = {
    comment?: InputMaybe<Scalars['String']['input']>;
    decision: Scalars['String']['input'];
    requestId: Scalars['ID']['input'];
};

export type MutationDeleteAdministratorArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteAdministratorsArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteApiKeysArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteAssetArgs = {
    input: DeleteAssetInput;
};

export type MutationDeleteAssetsArgs = {
    input: DeleteAssetsInput;
};

export type MutationDeleteChannelArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteChannelsArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteCollectionArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteCollectionsArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteCountriesArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteCountryArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerAddressArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerGroupArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerGroupsArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteCustomerNoteArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteCustomersArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteDraftOrderArgs = {
    orderId: Scalars['ID']['input'];
};

export type MutationDeleteFacetArgs = {
    force?: InputMaybe<Scalars['Boolean']['input']>;
    id: Scalars['ID']['input'];
};

export type MutationDeleteFacetValuesArgs = {
    force?: InputMaybe<Scalars['Boolean']['input']>;
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteFacetsArgs = {
    force?: InputMaybe<Scalars['Boolean']['input']>;
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteOrderNoteArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeletePaymentMethodArgs = {
    force?: InputMaybe<Scalars['Boolean']['input']>;
    id: Scalars['ID']['input'];
};

export type MutationDeletePaymentMethodsArgs = {
    force?: InputMaybe<Scalars['Boolean']['input']>;
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteProductArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteProductOptionArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteProductOptionGroupArgs = {
    force?: InputMaybe<Scalars['Boolean']['input']>;
    id: Scalars['ID']['input'];
};

export type MutationDeleteProductOptionGroupsArgs = {
    force?: InputMaybe<Scalars['Boolean']['input']>;
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteProductVariantArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteProductVariantsArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteProductsArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeletePromotionArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeletePromotionsArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteProvinceArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteRoleArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteRolesArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteSellerArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteSellersArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteShippingMethodArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteShippingMethodsArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteStockLocationArgs = {
    input: DeleteStockLocationInput;
};

export type MutationDeleteStockLocationsArgs = {
    input: Array<DeleteStockLocationInput>;
};

export type MutationDeleteTableViewArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteTagArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteTaxCategoriesArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteTaxCategoryArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteTaxRateArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteTaxRatesArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteZoneArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteZonesArgs = {
    ids: Array<Scalars['ID']['input']>;
};

export type MutationDuplicateEntityArgs = {
    input: DuplicateEntityInput;
};

export type MutationEndSessionArgs = {
    id: Scalars['ID']['input'];
};

export type MutationEscalateApprovalRequestArgs = {
    escalateToAdministratorId: Scalars['ID']['input'];
    requestId: Scalars['ID']['input'];
};

export type MutationExtendOrderReservationArgs = {
    additionalDays: Scalars['Int']['input'];
    orderId: Scalars['ID']['input'];
};

export type MutationFlushBufferedJobsArgs = {
    bufferIds?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MutationGenerateContractArgs = {
    counterpartyId: Scalars['ID']['input'];
};

export type MutationImportProductsArgs = {
    csvFile: Scalars['Upload']['input'];
};

export type MutationLoginArgs = {
    password: Scalars['String']['input'];
    rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
    username: Scalars['String']['input'];
};

export type MutationMarkNotificationReadArgs = {
    id: Scalars['ID']['input'];
};

export type MutationModifyOrderArgs = {
    input: ModifyOrderInput;
};

export type MutationMoveCollectionArgs = {
    input: MoveCollectionInput;
};

export type MutationReassignCounterpartyManagerArgs = {
    administratorId: Scalars['ID']['input'];
    counterpartyId: Scalars['ID']['input'];
};

export type MutationRecordPaymentDisputeArgs = {
    amount: Scalars['Int']['input'];
    paymentId: Scalars['ID']['input'];
    status?: InputMaybe<Scalars['String']['input']>;
    type: Scalars['String']['input'];
};

export type MutationRecordPaymentRefundArgs = {
    amount: Scalars['Int']['input'];
    paymentId: Scalars['ID']['input'];
    providerRefundId?: InputMaybe<Scalars['String']['input']>;
    reason: Scalars['String']['input'];
    status?: InputMaybe<Scalars['String']['input']>;
};

export type MutationRecordWitnessedPaymentArgs = {
    amount: Scalars['Int']['input'];
    invoiceId?: InputMaybe<Scalars['Int']['input']>;
    method: Scalars['String']['input'];
    orderId: Scalars['ID']['input'];
    organizationId?: InputMaybe<Scalars['Int']['input']>;
    outcome?: InputMaybe<Scalars['String']['input']>;
    rrn?: InputMaybe<Scalars['String']['input']>;
};

export type MutationRefundOrderArgs = {
    input: RefundOrderInput;
};

export type MutationReleaseOrderReservationArgs = {
    orderId: Scalars['ID']['input'];
};

export type MutationRemoveCollectionsFromChannelArgs = {
    input: RemoveCollectionsFromChannelInput;
};

export type MutationRemoveCounterpartyTeamMemberArgs = {
    administratorId: Scalars['ID']['input'];
    counterpartyId: Scalars['ID']['input'];
};

export type MutationRemoveCouponCodeFromDraftOrderArgs = {
    couponCode: Scalars['String']['input'];
    orderId: Scalars['ID']['input'];
};

export type MutationRemoveCustomersFromGroupArgs = {
    customerGroupId: Scalars['ID']['input'];
    customerIds: Array<Scalars['ID']['input']>;
};

export type MutationRemoveDraftOrderLineArgs = {
    orderId: Scalars['ID']['input'];
    orderLineId: Scalars['ID']['input'];
};

export type MutationRemoveFacetsFromChannelArgs = {
    input: RemoveFacetsFromChannelInput;
};

export type MutationRemoveMembersFromZoneArgs = {
    memberIds: Array<Scalars['ID']['input']>;
    zoneId: Scalars['ID']['input'];
};

export type MutationRemoveOptionGroupFromProductArgs = {
    force?: InputMaybe<Scalars['Boolean']['input']>;
    optionGroupId: Scalars['ID']['input'];
    productId: Scalars['ID']['input'];
};

export type MutationRemovePaymentMethodsFromChannelArgs = {
    input: RemovePaymentMethodsFromChannelInput;
};

export type MutationRemoveProductOptionGroupsFromChannelArgs = {
    input: RemoveProductOptionGroupsFromChannelInput;
};

export type MutationRemoveProductVariantsFromChannelArgs = {
    input: RemoveProductVariantsFromChannelInput;
};

export type MutationRemoveProductsFromChannelArgs = {
    input: RemoveProductsFromChannelInput;
};

export type MutationRemovePromotionsFromChannelArgs = {
    input: RemovePromotionsFromChannelInput;
};

export type MutationRemoveSettledJobsArgs = {
    olderThan?: InputMaybe<Scalars['DateTime']['input']>;
    queueNames?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MutationRemoveShippingMethodsFromChannelArgs = {
    input: RemoveShippingMethodsFromChannelInput;
};

export type MutationRemoveStockLocationsFromChannelArgs = {
    input: RemoveStockLocationsFromChannelInput;
};

export type MutationRequestCreditTermExtensionArgs = {
    input: CreditTermRequestInput;
};

export type MutationRequestDiscountGrantArgs = {
    input: DiscountGrantInput;
};

export type MutationRequestPriceAdjustmentArgs = {
    justification?: InputMaybe<Scalars['String']['input']>;
    orderId: Scalars['ID']['input'];
    orderLineId: Scalars['ID']['input'];
    requestedPrice: Scalars['Int']['input'];
};

export type MutationResolveErpReconciliationIssueArgs = {
    id: Scalars['ID']['input'];
    resolution: Scalars['String']['input'];
};

export type MutationResolveNotificationArgs = {
    id: Scalars['ID']['input'];
    resolution: Scalars['String']['input'];
};

export type MutationRotateApiKeyArgs = {
    id: Scalars['ID']['input'];
};

export type MutationRunScheduledTaskArgs = {
    id: Scalars['String']['input'];
};

export type MutationSaveTableViewArgs = {
    filters: Scalars['String']['input'];
    name: Scalars['String']['input'];
    pageKey: Scalars['String']['input'];
    visibleColumns: Array<Scalars['String']['input']>;
};

export type MutationSetBranchSettingsArgs = {
    branchId: Scalars['String']['input'];
    defaultPriceTypeId: Scalars['String']['input'];
    defaultWarehouseId: Scalars['String']['input'];
    visiblePriceTypeIds?: InputMaybe<Array<Scalars['String']['input']>>;
    visibleWarehouseIds?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MutationSetCreditTermLimitArgs = {
    maxAmount?: InputMaybe<Scalars['Int']['input']>;
    maxExtraDays: Scalars['Int']['input'];
    roleCode: Scalars['String']['input'];
};

export type MutationSetCustomerForDraftOrderArgs = {
    customerId?: InputMaybe<Scalars['ID']['input']>;
    input?: InputMaybe<CreateCustomerInput>;
    orderId: Scalars['ID']['input'];
};

export type MutationSetCustomerPriceTypeArgs = {
    customerId: Scalars['ID']['input'];
    priceTypeId: Scalars['ID']['input'];
};

export type MutationSetDraftOrderBillingAddressArgs = {
    input: CreateAddressInput;
    orderId: Scalars['ID']['input'];
};

export type MutationSetDraftOrderCustomFieldsArgs = {
    input: UpdateOrderInput;
    orderId: Scalars['ID']['input'];
};

export type MutationSetDraftOrderShippingAddressArgs = {
    input: CreateAddressInput;
    orderId: Scalars['ID']['input'];
};

export type MutationSetDraftOrderShippingMethodArgs = {
    orderId: Scalars['ID']['input'];
    shippingMethodId: Scalars['ID']['input'];
};

export type MutationSetOrderCustomFieldsArgs = {
    input: UpdateOrderInput;
};

export type MutationSetOrderCustomerArgs = {
    input: SetOrderCustomerInput;
};

export type MutationSetOrganizationLogoArgs = {
    assetId: Scalars['ID']['input'];
    erpId: Scalars['String']['input'];
};

export type MutationSetPreferredTradingPointArgs = {
    tradingPointId: Scalars['ID']['input'];
};

export type MutationSetReservationExtensionLimitArgs = {
    maxExtraDays: Scalars['Int']['input'];
    roleCode: Scalars['String']['input'];
};

export type MutationSetRoleAccessScopeConfigArgs = {
    accessScopeConfig: Scalars['String']['input'];
    roleCode: Scalars['String']['input'];
};

export type MutationSetSettingsStoreValueArgs = {
    input: SettingsStoreInput;
};

export type MutationSetSettingsStoreValuesArgs = {
    inputs: Array<SettingsStoreInput>;
};

export type MutationSetTradingPointActiveArgs = {
    id: Scalars['ID']['input'];
    isActive: Scalars['Boolean']['input'];
};

export type MutationSettlePaymentArgs = {
    id: Scalars['ID']['input'];
};

export type MutationSettleRefundArgs = {
    input: SettleRefundInput;
};

export type MutationTransitionFulfillmentToStateArgs = {
    id: Scalars['ID']['input'];
    state: Scalars['String']['input'];
};

export type MutationTransitionOrderToStateArgs = {
    id: Scalars['ID']['input'];
    state: Scalars['String']['input'];
};

export type MutationTransitionPaymentToStateArgs = {
    id: Scalars['ID']['input'];
    state: Scalars['String']['input'];
};

export type MutationUnsetDraftOrderBillingAddressArgs = {
    orderId: Scalars['ID']['input'];
};

export type MutationUnsetDraftOrderShippingAddressArgs = {
    orderId: Scalars['ID']['input'];
};

export type MutationUpdateActiveAdministratorArgs = {
    input: UpdateActiveAdministratorInput;
};

export type MutationUpdateAdministratorArgs = {
    input: UpdateAdministratorInput;
};

export type MutationUpdateApiKeyArgs = {
    input: UpdateApiKeyInput;
};

export type MutationUpdateAssetArgs = {
    input: UpdateAssetInput;
};

export type MutationUpdateChannelArgs = {
    input: UpdateChannelInput;
};

export type MutationUpdateCollectionArgs = {
    input: UpdateCollectionInput;
};

export type MutationUpdateCountryArgs = {
    input: UpdateCountryInput;
};

export type MutationUpdateCustomerArgs = {
    input: UpdateCustomerInput;
};

export type MutationUpdateCustomerAddressArgs = {
    input: UpdateAddressInput;
};

export type MutationUpdateCustomerGroupArgs = {
    input: UpdateCustomerGroupInput;
};

export type MutationUpdateCustomerNoteArgs = {
    input: UpdateCustomerNoteInput;
};

export type MutationUpdateFacetArgs = {
    input: UpdateFacetInput;
};

export type MutationUpdateFacetValueArgs = {
    input: UpdateFacetValueInput;
};

export type MutationUpdateFacetValuesArgs = {
    input: Array<UpdateFacetValueInput>;
};

export type MutationUpdateGlobalSettingsArgs = {
    input: UpdateGlobalSettingsInput;
};

export type MutationUpdateOrderNoteArgs = {
    input: UpdateOrderNoteInput;
};

export type MutationUpdatePaymentMethodArgs = {
    input: UpdatePaymentMethodInput;
};

export type MutationUpdateProductArgs = {
    input: UpdateProductInput;
};

export type MutationUpdateProductOptionArgs = {
    input: UpdateProductOptionInput;
};

export type MutationUpdateProductOptionGroupArgs = {
    input: UpdateProductOptionGroupInput;
};

export type MutationUpdateProductVariantArgs = {
    input: UpdateProductVariantInput;
};

export type MutationUpdateProductVariantsArgs = {
    input: Array<UpdateProductVariantInput>;
};

export type MutationUpdateProductsArgs = {
    input: Array<UpdateProductInput>;
};

export type MutationUpdatePromotionArgs = {
    input: UpdatePromotionInput;
};

export type MutationUpdateProvinceArgs = {
    input: UpdateProvinceInput;
};

export type MutationUpdateRoleArgs = {
    input: UpdateRoleInput;
};

export type MutationUpdateScheduledTaskArgs = {
    input: UpdateScheduledTaskInput;
};

export type MutationUpdateSellerArgs = {
    input: UpdateSellerInput;
};

export type MutationUpdateShippingMethodArgs = {
    input: UpdateShippingMethodInput;
};

export type MutationUpdateStockLocationArgs = {
    input: UpdateStockLocationInput;
};

export type MutationUpdateTagArgs = {
    input: UpdateTagInput;
};

export type MutationUpdateTaxCategoryArgs = {
    input: UpdateTaxCategoryInput;
};

export type MutationUpdateTaxRateArgs = {
    input: UpdateTaxRateInput;
};

export type MutationUpdateTradingPointCommentArgs = {
    comment?: InputMaybe<Scalars['String']['input']>;
    tradingPointId: Scalars['ID']['input'];
};

export type MutationUpdateTradingPointDetailsArgs = {
    id: Scalars['ID']['input'];
    input: TradingPointDetailsInput;
};

export type MutationUpdateWarehouseBranchAssignmentArgs = {
    branchId: Scalars['String']['input'];
    includedInBranchAtp: Scalars['Boolean']['input'];
    warehouseId: Scalars['ID']['input'];
};

export type MutationUpdateZoneArgs = {
    input: UpdateZoneInput;
};

export type MutationUpsertCounterpartyArgs = {
    branchId?: InputMaybe<Scalars['String']['input']>;
    creditBalance: Scalars['Int']['input'];
    creditLimit: Scalars['Int']['input'];
    departmentId?: InputMaybe<Scalars['String']['input']>;
    erpGroupLabel?: InputMaybe<Scalars['String']['input']>;
    erpId: Scalars['String']['input'];
    inn?: InputMaybe<Scalars['String']['input']>;
    isActive: Scalars['Boolean']['input'];
    legalName: Scalars['String']['input'];
    paymentDelayDays: Scalars['Int']['input'];
    priceType: Scalars['String']['input'];
    shortName: Scalars['String']['input'];
};

export type MutationUpsertDiscountRuleArgs = {
    input: DiscountRuleInput;
};

export type MutationUpsertPriceEntryArgs = {
    price: Scalars['Int']['input'];
    priceTypeCode: Scalars['String']['input'];
    variantId: Scalars['ID']['input'];
};

export type MutationUpsertPriceTypeArgs = {
    code: Scalars['String']['input'];
    name: Scalars['String']['input'];
};

export type MutationUpsertTradingPointArgs = {
    address: Scalars['String']['input'];
    counterpartyErpId: Scalars['String']['input'];
    erpId: Scalars['String']['input'];
    isActive: Scalars['Boolean']['input'];
    latitude?: InputMaybe<Scalars['Float']['input']>;
    longitude?: InputMaybe<Scalars['Float']['input']>;
    name: Scalars['String']['input'];
    workingHours?: InputMaybe<Scalars['String']['input']>;
};

export type MutationUpsertWorkflowDefinitionArgs = {
    displayName: Scalars['String']['input'];
    requestType: Scalars['String']['input'];
    steps: Array<WorkflowStepInput>;
};

export type NativeAuthInput = {
    password: Scalars['String']['input'];
    username: Scalars['String']['input'];
};

/** Returned when attempting an operation that relies on the NativeAuthStrategy, if that strategy is not configured. */
export type NativeAuthStrategyError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type NativeAuthenticationResult =
    | CurrentUser
    | InvalidCredentialsError
    | NativeAuthStrategyError;

/** Returned when attempting to set a negative OrderLine quantity. */
export type NegativeQuantityError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/**
 * Returned when invoking a mutation which depends on there being an active Order on the
 * current session.
 */
export type NoActiveOrderError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned when a call to modifyOrder fails to specify any changes */
export type NoChangesSpecifiedError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Node = {
    id: Scalars['ID']['output'];
};

/** Returned if an attempting to refund an Order but neither items nor shipping refund was specified */
export type NothingToRefundError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Notification = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    kind: NotificationKind;
    message: Scalars['String']['output'];
    readAt: Maybe<Scalars['DateTime']['output']>;
    resolution: Maybe<Scalars['String']['output']>;
    resolvedAt: Maybe<Scalars['DateTime']['output']>;
    sourceId: Maybe<Scalars['String']['output']>;
    sourceType: Scalars['String']['output'];
    status: NotificationStatus;
    title: Scalars['String']['output'];
};

export enum NotificationKind {
    Error = 'error',
    Info = 'info',
    Success = 'success',
    Warning = 'warning',
}

export type NotificationList = {
    items: Array<Notification>;
    totalItems: Scalars['Int']['output'];
};

export type NotificationListOptions = {
    skip?: InputMaybe<Scalars['Int']['input']>;
    status?: InputMaybe<NotificationStatus>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export enum NotificationStatus {
    Read = 'read',
    Resolved = 'resolved',
    Unread = 'unread',
}

/** Operators for filtering on a list of Number fields */
export type NumberListOperators = {
    inList: Scalars['Float']['input'];
};

/** Operators for filtering on a Int or Float field */
export type NumberOperators = {
    between?: InputMaybe<NumberRange>;
    eq?: InputMaybe<Scalars['Float']['input']>;
    gt?: InputMaybe<Scalars['Float']['input']>;
    gte?: InputMaybe<Scalars['Float']['input']>;
    isNull?: InputMaybe<Scalars['Boolean']['input']>;
    lt?: InputMaybe<Scalars['Float']['input']>;
    lte?: InputMaybe<Scalars['Float']['input']>;
};

export type NumberRange = {
    end: Scalars['Float']['input'];
    start: Scalars['Float']['input'];
};

export type OpenErpReconciliationIssueListOptions = {
    skip?: InputMaybe<Scalars['Int']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type OpenPaymentReconciliationIssueListOptions = {
    skip?: InputMaybe<Scalars['Int']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type OpenReservationReconciliationIssueListOptions = {
    skip?: InputMaybe<Scalars['Int']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type Order = Node & {
    /** An order is active as long as the payment process has not been completed */
    active: Scalars['Boolean']['output'];
    aggregateOrder: Maybe<Order>;
    aggregateOrderId: Maybe<Scalars['ID']['output']>;
    billingAddress: Maybe<OrderAddress>;
    channels: Array<Channel>;
    /** A unique code for the Order */
    code: Scalars['String']['output'];
    /** An array of all coupon codes applied to the Order */
    couponCodes: Array<Scalars['String']['output']>;
    createdAt: Scalars['DateTime']['output'];
    currencyCode: CurrencyCode;
    customFields: Maybe<OrderCustomFields>;
    customer: Maybe<Customer>;
    discounts: Array<Discount>;
    fulfillments: Maybe<Array<Fulfillment>>;
    history: HistoryEntryList;
    id: Scalars['ID']['output'];
    lines: Array<OrderLine>;
    modifications: Array<OrderModification>;
    nextStates: Array<Scalars['String']['output']>;
    /**
     * The date & time that the Order was placed, i.e. the Customer
     * completed the checkout and the Order is no longer "active"
     */
    orderPlacedAt: Maybe<Scalars['DateTime']['output']>;
    payments: Maybe<Array<Payment>>;
    /** Promotions applied to the order. Only gets populated after the payment process has completed. */
    promotions: Array<Promotion>;
    sellerOrders: Maybe<Array<Order>>;
    shipping: Scalars['Money']['output'];
    shippingAddress: Maybe<OrderAddress>;
    shippingLines: Array<ShippingLine>;
    shippingWithTax: Scalars['Money']['output'];
    state: Scalars['String']['output'];
    /**
     * The subTotal is the total of all OrderLines in the Order. This figure also includes any Order-level
     * discounts which have been prorated (proportionally distributed) amongst the items of each OrderLine.
     * To get a total of all OrderLines which does not account for prorated discounts, use the
     * sum of `OrderLine.discountedLinePrice` values.
     */
    subTotal: Scalars['Money']['output'];
    /** Same as subTotal, but inclusive of tax */
    subTotalWithTax: Scalars['Money']['output'];
    /**
     * Surcharges are arbitrary modifications to the Order total which are neither
     * ProductVariants nor discounts resulting from applied Promotions. For example,
     * one-off discounts based on customer interaction, or surcharges based on payment
     * methods.
     */
    surcharges: Array<Surcharge>;
    /** A summary of the taxes being applied to this Order */
    taxSummary: Array<OrderTaxSummary>;
    /** Equal to subTotal plus shipping */
    total: Scalars['Money']['output'];
    totalQuantity: Scalars['Int']['output'];
    /** The final payable amount. Equal to subTotalWithTax plus shippingWithTax */
    totalWithTax: Scalars['Money']['output'];
    type: OrderType;
    updatedAt: Scalars['DateTime']['output'];
};

export type OrderHistoryArgs = {
    options?: InputMaybe<HistoryEntryListOptions>;
};

export type OrderAddress = {
    city: Maybe<Scalars['String']['output']>;
    company: Maybe<Scalars['String']['output']>;
    country: Maybe<Scalars['String']['output']>;
    countryCode: Maybe<Scalars['String']['output']>;
    customFields: Maybe<Scalars['JSON']['output']>;
    fullName: Maybe<Scalars['String']['output']>;
    phoneNumber: Maybe<Scalars['String']['output']>;
    postalCode: Maybe<Scalars['String']['output']>;
    province: Maybe<Scalars['String']['output']>;
    streetLine1: Maybe<Scalars['String']['output']>;
    streetLine2: Maybe<Scalars['String']['output']>;
};

export type OrderCustomFields = {
    branchId: Maybe<Scalars['String']['output']>;
    erpOrderId: Maybe<Scalars['String']['output']>;
    erpStatus: Maybe<Scalars['String']['output']>;
    erpStatusAt: Maybe<Scalars['DateTime']['output']>;
    latestFulfillmentState: Maybe<Scalars['String']['output']>;
    paymentStatus: Maybe<Scalars['String']['output']>;
    placedByAdministratorId: Maybe<Scalars['String']['output']>;
    reservationDays: Maybe<Scalars['Int']['output']>;
    reservationState: Maybe<Scalars['String']['output']>;
    sourceOrderId: Maybe<Scalars['String']['output']>;
    tradingPointId: Maybe<Scalars['String']['output']>;
};

export type OrderFilterParameter = {
    _and?: InputMaybe<Array<OrderFilterParameter>>;
    _or?: InputMaybe<Array<OrderFilterParameter>>;
    /** An order is active as long as the payment process has not been completed */
    active?: InputMaybe<BooleanOperators>;
    aggregateOrderId?: InputMaybe<IdOperators>;
    branchId?: InputMaybe<StringOperators>;
    /** A unique code for the Order */
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    currencyCode?: InputMaybe<StringOperators>;
    customerLastName?: InputMaybe<StringOperators>;
    erpOrderId?: InputMaybe<StringOperators>;
    erpStatus?: InputMaybe<StringOperators>;
    erpStatusAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    latestFulfillmentState?: InputMaybe<StringOperators>;
    /**
     * The date & time that the Order was placed, i.e. the Customer
     * completed the checkout and the Order is no longer "active"
     */
    orderPlacedAt?: InputMaybe<DateOperators>;
    paymentStatus?: InputMaybe<StringOperators>;
    placedByAdministratorId?: InputMaybe<StringOperators>;
    reservationDays?: InputMaybe<NumberOperators>;
    reservationState?: InputMaybe<StringOperators>;
    shipping?: InputMaybe<NumberOperators>;
    shippingWithTax?: InputMaybe<NumberOperators>;
    sourceOrderId?: InputMaybe<StringOperators>;
    state?: InputMaybe<StringOperators>;
    /**
     * The subTotal is the total of all OrderLines in the Order. This figure also includes any Order-level
     * discounts which have been prorated (proportionally distributed) amongst the items of each OrderLine.
     * To get a total of all OrderLines which does not account for prorated discounts, use the
     * sum of `OrderLine.discountedLinePrice` values.
     */
    subTotal?: InputMaybe<NumberOperators>;
    /** Same as subTotal, but inclusive of tax */
    subTotalWithTax?: InputMaybe<NumberOperators>;
    /** Equal to subTotal plus shipping */
    total?: InputMaybe<NumberOperators>;
    totalQuantity?: InputMaybe<NumberOperators>;
    /** The final payable amount. Equal to subTotalWithTax plus shippingWithTax */
    totalWithTax?: InputMaybe<NumberOperators>;
    tradingPointId?: InputMaybe<StringOperators>;
    transactionId?: InputMaybe<StringOperators>;
    type?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

/** Returned when an order operation is rejected by an OrderInterceptor method. */
export type OrderInterceptorError = ErrorResult & {
    errorCode: ErrorCode;
    interceptorError: Scalars['String']['output'];
    message: Scalars['String']['output'];
};

/** Returned when the maximum order size limit has been reached. */
export type OrderLimitError = ErrorResult & {
    errorCode: ErrorCode;
    maxItems: Scalars['Int']['output'];
    message: Scalars['String']['output'];
};

export type OrderLine = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<OrderLineCustomFields>;
    /** The price of the line including discounts, excluding tax */
    discountedLinePrice: Scalars['Money']['output'];
    /** The price of the line including discounts and tax */
    discountedLinePriceWithTax: Scalars['Money']['output'];
    /**
     * The price of a single unit including discounts, excluding tax.
     *
     * If Order-level discounts have been applied, this will not be the
     * actual taxable unit price (see `proratedUnitPrice`), but is generally the
     * correct price to display to customers to avoid confusion
     * about the internal handling of distributed Order-level discounts.
     */
    discountedUnitPrice: Scalars['Money']['output'];
    /** The price of a single unit including discounts and tax */
    discountedUnitPriceWithTax: Scalars['Money']['output'];
    discounts: Array<Discount>;
    featuredAsset: Maybe<Asset>;
    fulfillmentLines: Maybe<Array<FulfillmentLine>>;
    id: Scalars['ID']['output'];
    /** The total price of the line excluding tax and discounts. */
    linePrice: Scalars['Money']['output'];
    /** The total price of the line including tax but excluding discounts. */
    linePriceWithTax: Scalars['Money']['output'];
    /** The total tax on this line */
    lineTax: Scalars['Money']['output'];
    order: Order;
    /** The quantity at the time the Order was placed */
    orderPlacedQuantity: Scalars['Int']['output'];
    productVariant: ProductVariant;
    /**
     * The actual line price, taking into account both item discounts _and_ prorated (proportionally-distributed)
     * Order-level discounts. This value is the true economic value of the OrderLine, and is used in tax
     * and refund calculations.
     */
    proratedLinePrice: Scalars['Money']['output'];
    /** The proratedLinePrice including tax */
    proratedLinePriceWithTax: Scalars['Money']['output'];
    /**
     * The actual unit price, taking into account both item discounts _and_ prorated (proportionally-distributed)
     * Order-level discounts. This value is the true economic value of the OrderItem, and is used in tax
     * and refund calculations.
     */
    proratedUnitPrice: Scalars['Money']['output'];
    /** The proratedUnitPrice including tax */
    proratedUnitPriceWithTax: Scalars['Money']['output'];
    /** The quantity of items purchased */
    quantity: Scalars['Int']['output'];
    taxLines: Array<TaxLine>;
    taxRate: Scalars['Float']['output'];
    /** The price of a single unit, excluding tax and discounts */
    unitPrice: Scalars['Money']['output'];
    /** Non-zero if the unitPrice has changed since it was initially added to Order */
    unitPriceChangeSinceAdded: Scalars['Money']['output'];
    /** The price of a single unit, including tax but excluding discounts */
    unitPriceWithTax: Scalars['Money']['output'];
    /** Non-zero if the unitPriceWithTax has changed since it was initially added to Order */
    unitPriceWithTaxChangeSinceAdded: Scalars['Money']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type OrderLineCustomFields = {
    manualPriceReason: Maybe<Scalars['String']['output']>;
    manualUnitPrice: Maybe<Scalars['Int']['output']>;
};

export type OrderLineCustomFieldsInput = {
    manualPriceReason?: InputMaybe<Scalars['String']['input']>;
    manualUnitPrice?: InputMaybe<Scalars['Int']['input']>;
};

export type OrderLineInput = {
    customFields?: InputMaybe<OrderLineCustomFieldsInput>;
    orderLineId: Scalars['ID']['input'];
    quantity: Scalars['Int']['input'];
};

export type OrderList = PaginatedList & {
    items: Array<Order>;
    totalItems: Scalars['Int']['output'];
};

export type OrderListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<OrderFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<OrderSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type OrderModification = Node & {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    isSettled: Scalars['Boolean']['output'];
    lines: Array<OrderModificationLine>;
    note: Scalars['String']['output'];
    payment: Maybe<Payment>;
    priceChange: Scalars['Money']['output'];
    refund: Maybe<Refund>;
    surcharges: Maybe<Array<Surcharge>>;
    updatedAt: Scalars['DateTime']['output'];
};

/** Returned when attempting to modify the contents of an Order that is not in the `AddingItems` state. */
export type OrderModificationError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type OrderModificationLine = {
    modification: OrderModification;
    modificationId: Scalars['ID']['output'];
    orderLine: OrderLine;
    orderLineId: Scalars['ID']['output'];
    quantity: Scalars['Int']['output'];
};

/** Returned when attempting to modify the contents of an Order that is not in the `Modifying` state. */
export type OrderModificationStateError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type OrderPaymentSummary = {
    /** Sum of paymentStatus='captured' PaymentAttempt rows for this order — see PaymentAttemptService.sumCapturedAmountsByOrderIds for what's deliberately not netted out (refunds/disputes). */
    capturedAmount: Scalars['Int']['output'];
    orderId: Scalars['ID']['output'];
};

export type OrderProcessState = {
    name: Scalars['String']['output'];
    to: Array<Scalars['String']['output']>;
};

export type OrderSortParameter = {
    aggregateOrderId?: InputMaybe<SortOrder>;
    branchId?: InputMaybe<SortOrder>;
    /** A unique code for the Order */
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    customerLastName?: InputMaybe<SortOrder>;
    erpOrderId?: InputMaybe<SortOrder>;
    erpStatus?: InputMaybe<SortOrder>;
    erpStatusAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    latestFulfillmentState?: InputMaybe<SortOrder>;
    /**
     * The date & time that the Order was placed, i.e. the Customer
     * completed the checkout and the Order is no longer "active"
     */
    orderPlacedAt?: InputMaybe<SortOrder>;
    paymentStatus?: InputMaybe<SortOrder>;
    placedByAdministratorId?: InputMaybe<SortOrder>;
    reservationDays?: InputMaybe<SortOrder>;
    reservationState?: InputMaybe<SortOrder>;
    shipping?: InputMaybe<SortOrder>;
    shippingWithTax?: InputMaybe<SortOrder>;
    sourceOrderId?: InputMaybe<SortOrder>;
    state?: InputMaybe<SortOrder>;
    /**
     * The subTotal is the total of all OrderLines in the Order. This figure also includes any Order-level
     * discounts which have been prorated (proportionally distributed) amongst the items of each OrderLine.
     * To get a total of all OrderLines which does not account for prorated discounts, use the
     * sum of `OrderLine.discountedLinePrice` values.
     */
    subTotal?: InputMaybe<SortOrder>;
    /** Same as subTotal, but inclusive of tax */
    subTotalWithTax?: InputMaybe<SortOrder>;
    /** Equal to subTotal plus shipping */
    total?: InputMaybe<SortOrder>;
    totalQuantity?: InputMaybe<SortOrder>;
    /** The final payable amount. Equal to subTotalWithTax plus shippingWithTax */
    totalWithTax?: InputMaybe<SortOrder>;
    tradingPointId?: InputMaybe<SortOrder>;
    transactionId?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

/** Returned if there is an error in transitioning the Order state */
export type OrderStateTransitionError = ErrorResult & {
    errorCode: ErrorCode;
    fromState: Scalars['String']['output'];
    message: Scalars['String']['output'];
    toState: Scalars['String']['output'];
    transitionError: Scalars['String']['output'];
};

/**
 * A summary of the taxes being applied to this order, grouped
 * by taxRate.
 */
export type OrderTaxSummary = {
    /** A description of this tax */
    description: Scalars['String']['output'];
    /** The total net price of OrderLines to which this taxRate applies */
    taxBase: Scalars['Money']['output'];
    /** The taxRate as a percentage */
    taxRate: Scalars['Float']['output'];
    /** The total tax being applied to the Order at this taxRate */
    taxTotal: Scalars['Money']['output'];
};

export enum OrderType {
    Aggregate = 'Aggregate',
    Regular = 'Regular',
    Seller = 'Seller',
}

export type OrganizationRequisites = {
    erpId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    isActive: Scalars['Boolean']['output'];
    legalName: Scalars['String']['output'];
};

export type PaginatedList = {
    items: Array<Node>;
    totalItems: Scalars['Int']['output'];
};

export type Payment = Node & {
    amount: Scalars['Money']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    errorMessage: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    metadata: Maybe<Scalars['JSON']['output']>;
    method: Scalars['String']['output'];
    nextStates: Array<Scalars['String']['output']>;
    refunds: Array<Refund>;
    state: Scalars['String']['output'];
    transactionId: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

export type PaymentAttempt = {
    amount: Scalars['Int']['output'];
    channel: Scalars['String']['output'];
    /** Only populated when returned from visiblePayments (joined from its Invoice) — null elsewhere. */
    counterpartyId: Maybe<Scalars['ID']['output']>;
    createdAt: Scalars['DateTime']['output'];
    currencyCode: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    invoiceId: Maybe<Scalars['ID']['output']>;
    /** The payment's own internal, human-facing business number — generated the same way as Order.code/Invoice.number/DiscountGrant.number. See PaymentAttempt.number's own doc comment (payment-attempt.entity.ts) for why this is distinct from providerPaymentId below (the external-integration-rules skill). */
    number: Scalars['String']['output'];
    paymentStatus: Scalars['String']['output'];
    /** The payment's real external reference — an acquirer RRN, a branch kassa receipt number, an ERP payment-document id, or (until a real acquirer is wired in) a clearly-marked stub value. Mandatory for every channel; used for reconciliation, never as this payment's own displayed identity. */
    providerPaymentId: Scalars['String']['output'];
};

export type PaymentAttemptList = {
    items: Array<PaymentAttempt>;
    totalItems: Scalars['Int']['output'];
};

export type PaymentInboxSweepResult = {
    failed: Scalars['Int']['output'];
    processed: Scalars['Int']['output'];
};

export type PaymentListOptions = {
    channel?: InputMaybe<Scalars['String']['input']>;
    /** Substring match against the payment's own internal number (PaymentAttempt.number) — never providerPaymentId. */
    search?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    status?: InputMaybe<Scalars['String']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type PaymentMethod = Node & {
    checker: Maybe<ConfigurableOperation>;
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<PaymentMethodCustomFields>;
    description: Scalars['String']['output'];
    enabled: Scalars['Boolean']['output'];
    handler: ConfigurableOperation;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    translations: Array<PaymentMethodTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type PaymentMethodCustomFields = {
    paymentClassification: Maybe<Scalars['String']['output']>;
    reservationTtlDays: Maybe<Scalars['Int']['output']>;
};

export type PaymentMethodFilterParameter = {
    _and?: InputMaybe<Array<PaymentMethodFilterParameter>>;
    _or?: InputMaybe<Array<PaymentMethodFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    description?: InputMaybe<StringOperators>;
    enabled?: InputMaybe<BooleanOperators>;
    id?: InputMaybe<IdOperators>;
    name?: InputMaybe<StringOperators>;
    paymentClassification?: InputMaybe<StringOperators>;
    reservationTtlDays?: InputMaybe<NumberOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type PaymentMethodList = PaginatedList & {
    items: Array<PaymentMethod>;
    totalItems: Scalars['Int']['output'];
};

export type PaymentMethodListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<PaymentMethodFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<PaymentMethodSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Returned when a call to modifyOrder fails to include a paymentMethod even
 * though the price has increased as a result of the changes.
 */
export type PaymentMethodMissingError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type PaymentMethodQuote = {
    code: Scalars['String']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    eligibilityMessage: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    isEligible: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
};

export type PaymentMethodSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    description?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    paymentClassification?: InputMaybe<SortOrder>;
    reservationTtlDays?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type PaymentMethodTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type PaymentMethodTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    description?: InputMaybe<Scalars['String']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if an attempting to refund a Payment against OrderLines from a different Order */
export type PaymentOrderMismatchError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type PaymentReconciliationIssue = {
    actualAmount: Maybe<Scalars['Int']['output']>;
    actualCurrency: Maybe<Scalars['String']['output']>;
    detectedAt: Scalars['DateTime']['output'];
    erpDocumentId: Maybe<Scalars['String']['output']>;
    expectedAmount: Maybe<Scalars['Int']['output']>;
    expectedCurrency: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    invoiceId: Maybe<Scalars['ID']['output']>;
    issueType: Scalars['String']['output'];
    organizationId: Maybe<Scalars['ID']['output']>;
    paymentId: Maybe<Scalars['ID']['output']>;
    providerPaymentId: Maybe<Scalars['String']['output']>;
    status: Scalars['String']['output'];
};

export type PaymentReconciliationIssueList = {
    items: Array<PaymentReconciliationIssue>;
    totalItems: Scalars['Int']['output'];
};

export type PaymentRefund = {
    amount: Scalars['Int']['output'];
    id: Scalars['ID']['output'];
    paymentId: Scalars['ID']['output'];
    providerRefundId: Maybe<Scalars['String']['output']>;
    reason: Scalars['String']['output'];
    status: Scalars['String']['output'];
};

/** Returned when there is an error in transitioning the Payment state */
export type PaymentStateTransitionError = ErrorResult & {
    errorCode: ErrorCode;
    fromState: Scalars['String']['output'];
    message: Scalars['String']['output'];
    toState: Scalars['String']['output'];
    transitionError: Scalars['String']['output'];
};

/**
 * @description
 * Permissions for administrators and customers. Used to control access to
 * GraphQL resolvers via the {@link Allow} decorator.
 *
 * ## Understanding Permission.Owner
 *
 * `Permission.Owner` is a special permission which is used in some Vendure resolvers to indicate that that resolver should only
 * be accessible to the "owner" of that resource.
 *
 * For example, the Shop API `activeCustomer` query resolver should only return the Customer object for the "owner" of that Customer, i.e.
 * based on the activeUserId of the current session. As a result, the resolver code looks like this:
 *
 * @example
 * ```TypeScript
 * \@Query()
 * \@Allow(Permission.Owner)
 * async activeCustomer(\@Ctx() ctx: RequestContext): Promise<Customer | undefined> {
 *   const userId = ctx.activeUserId;
 *   if (userId) {
 *     return this.customerService.findOneByUserId(ctx, userId);
 *   }
 * }
 * ```
 *
 * Here we can see that the "ownership" must be enforced by custom logic inside the resolver. Since "ownership" cannot be defined generally
 * nor statically encoded at build-time, any resolvers using `Permission.Owner` **must** include logic to enforce that only the owner
 * of the resource has access. If not, then it is the equivalent of using `Permission.Public`.
 *
 *
 * @docsCategory common
 */
export enum Permission {
    /** Adjust an order line price directly, as long as it stays at/above the floor price (layer 5 gate) */
    AdjustPriceWithinLimit = 'AdjustPriceWithinLimit',
    /** Decide a step of a priceAdjustmentApproval or discountGrantApproval chain (layer 5) */
    ApproveDiscountRequest = 'ApproveDiscountRequest',
    /** Decide a step of a securityLimitApproval chain (layer 5) */
    ApproveSecurityLimit = 'ApproveSecurityLimit',
    /** Authenticated means simply that the user is logged in */
    Authenticated = 'Authenticated',
    /** Confirm or release a manual order reservation (order-confirmation flow, see docs/order-flow.md) */
    ConfirmOrder = 'ConfirmOrder',
    /** Grants permission to create Administrator */
    CreateAdministrator = 'CreateAdministrator',
    /** Grants permission to create ApiKey */
    CreateApiKey = 'CreateApiKey',
    /** Grants permission to create Asset */
    CreateAsset = 'CreateAsset',
    /** Grants permission to create Products, Facets, Assets, Collections */
    CreateCatalog = 'CreateCatalog',
    /** Grants permission to create Channel */
    CreateChannel = 'CreateChannel',
    /** Grants permission to create Collection */
    CreateCollection = 'CreateCollection',
    /** Grants permission to create Country */
    CreateCountry = 'CreateCountry',
    /** Grants permission to create Customer */
    CreateCustomer = 'CreateCustomer',
    /** Grants permission to create CustomerGroup */
    CreateCustomerGroup = 'CreateCustomerGroup',
    /** Grants permission to create Facet */
    CreateFacet = 'CreateFacet',
    /** Grants permission to create Order */
    CreateOrder = 'CreateOrder',
    /** Grants permission to create PaymentMethod */
    CreatePaymentMethod = 'CreatePaymentMethod',
    /** Grants permission to create Product */
    CreateProduct = 'CreateProduct',
    /** Grants permission to create Promotion */
    CreatePromotion = 'CreatePromotion',
    /** Grants permission to create Seller */
    CreateSeller = 'CreateSeller',
    /** Grants permission to create PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
    CreateSettings = 'CreateSettings',
    /** Grants permission to create ShippingMethod */
    CreateShippingMethod = 'CreateShippingMethod',
    /** Grants permission to create StockLocation */
    CreateStockLocation = 'CreateStockLocation',
    /** Grants permission to create System */
    CreateSystem = 'CreateSystem',
    /** Grants permission to create Tag */
    CreateTag = 'CreateTag',
    /** Grants permission to create TaxCategory */
    CreateTaxCategory = 'CreateTaxCategory',
    /** Grants permission to create TaxRate */
    CreateTaxRate = 'CreateTaxRate',
    /** Grants permission to create Zone */
    CreateZone = 'CreateZone',
    /** Grants permission to delete Administrator */
    DeleteAdministrator = 'DeleteAdministrator',
    /** Grants permission to delete ApiKey */
    DeleteApiKey = 'DeleteApiKey',
    /** Grants permission to delete Asset */
    DeleteAsset = 'DeleteAsset',
    /** Grants permission to delete Products, Facets, Assets, Collections */
    DeleteCatalog = 'DeleteCatalog',
    /** Grants permission to delete Channel */
    DeleteChannel = 'DeleteChannel',
    /** Grants permission to delete Collection */
    DeleteCollection = 'DeleteCollection',
    /** Grants permission to delete Country */
    DeleteCountry = 'DeleteCountry',
    /** Grants permission to delete Customer */
    DeleteCustomer = 'DeleteCustomer',
    /** Grants permission to delete CustomerGroup */
    DeleteCustomerGroup = 'DeleteCustomerGroup',
    /** Grants permission to delete Facet */
    DeleteFacet = 'DeleteFacet',
    /** Grants permission to delete Order */
    DeleteOrder = 'DeleteOrder',
    /** Grants permission to delete PaymentMethod */
    DeletePaymentMethod = 'DeletePaymentMethod',
    /** Grants permission to delete Product */
    DeleteProduct = 'DeleteProduct',
    /** Grants permission to delete Promotion */
    DeletePromotion = 'DeletePromotion',
    /** Grants permission to delete Seller */
    DeleteSeller = 'DeleteSeller',
    /** Grants permission to delete PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
    DeleteSettings = 'DeleteSettings',
    /** Grants permission to delete ShippingMethod */
    DeleteShippingMethod = 'DeleteShippingMethod',
    /** Grants permission to delete StockLocation */
    DeleteStockLocation = 'DeleteStockLocation',
    /** Grants permission to delete System */
    DeleteSystem = 'DeleteSystem',
    /** Grants permission to delete Tag */
    DeleteTag = 'DeleteTag',
    /** Grants permission to delete TaxCategory */
    DeleteTaxCategory = 'DeleteTaxCategory',
    /** Grants permission to delete TaxRate */
    DeleteTaxRate = 'DeleteTaxRate',
    /** Grants permission to delete Zone */
    DeleteZone = 'DeleteZone',
    /** Manage role scope configuration (departmentId/branchId, max scope per resource) */
    ManageAccessControl = 'ManageAccessControl',
    /** Create/edit WorkflowDefinition chains (layer 5, /settings) */
    ManageApprovalWorkflows = 'ManageApprovalWorkflows',
    /** Add/remove CounterpartyTeamMember rows (backup/observer) for a counterparty — same department/all scoping as ReassignCounterpartyManager, but for the additional team beyond the Owner */
    ManageCounterpartyTeam = 'ManageCounterpartyTeam',
    /** Read reconciliation discrepancies against Integration Service and manually trigger a re-check (issue #84) */
    ManageErpIntegration = 'ManageErpIntegration',
    /** Owner means the user owns this entity, e.g. a Customer's own Order */
    Owner = 'Owner',
    /** Public means any unauthenticated user may perform the operation */
    Public = 'Public',
    /** Grants permission to read Administrator */
    ReadAdministrator = 'ReadAdministrator',
    /** Grants permission to read ApiKey */
    ReadApiKey = 'ReadApiKey',
    /** Grants permission to read Asset */
    ReadAsset = 'ReadAsset',
    /** Grants permission to read Products, Facets, Assets, Collections */
    ReadCatalog = 'ReadCatalog',
    /** Grants permission to read Channel */
    ReadChannel = 'ReadChannel',
    /** Grants permission to read Collection */
    ReadCollection = 'ReadCollection',
    /** Read counterparty records (scope resolved separately by AccessScopeService) */
    ReadCounterparty = 'ReadCounterparty',
    /** Read a counterparty's creditLimit/creditBalance (financial data, layer 4 redaction) */
    ReadCounterpartyCredit = 'ReadCounterpartyCredit',
    /** Grants permission to read Country */
    ReadCountry = 'ReadCountry',
    /** Grants permission to read Customer */
    ReadCustomer = 'ReadCustomer',
    /** Grants permission to read CustomerGroup */
    ReadCustomerGroup = 'ReadCustomerGroup',
    /** Grants permission to read DashboardGlobalViews */
    ReadDashboardGlobalViews = 'ReadDashboardGlobalViews',
    /** Read the generic entity-version audit trail (who changed what, when) — leadership roles only, distinct from the operational edit permissions on the versioned entities themselves */
    ReadEntityHistory = 'ReadEntityHistory',
    /** Grants permission to read Facet */
    ReadFacet = 'ReadFacet',
    /** Read the raw floor-price threshold for a variant (financial data, layer 4 redaction) */
    ReadFloorPrice = 'ReadFloorPrice',
    /** Read invoice records for the manager portal (scope resolved separately by AccessScopeService.resolveInvoiceScope) */
    ReadInvoice = 'ReadInvoice',
    /** Grants permission to read Order */
    ReadOrder = 'ReadOrder',
    /** Read payment records for the manager portal — a resource derived from Invoice, scoped the same way (AccessScopeService.resolveInvoiceScope) */
    ReadPayment = 'ReadPayment',
    /** Grants permission to read PaymentMethod */
    ReadPaymentMethod = 'ReadPaymentMethod',
    /** Grants permission to read Product */
    ReadProduct = 'ReadProduct',
    /** Grants permission to read Promotion */
    ReadPromotion = 'ReadPromotion',
    /** Grants permission to read Seller */
    ReadSeller = 'ReadSeller',
    /** Grants permission to read PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
    ReadSettings = 'ReadSettings',
    /** Grants permission to read ShippingMethod */
    ReadShippingMethod = 'ReadShippingMethod',
    /** Grants permission to read StockLocation */
    ReadStockLocation = 'ReadStockLocation',
    /** Grants permission to read System */
    ReadSystem = 'ReadSystem',
    /** Grants permission to read Tag */
    ReadTag = 'ReadTag',
    /** Grants permission to read TaxCategory */
    ReadTaxCategory = 'ReadTaxCategory',
    /** Grants permission to read TaxRate */
    ReadTaxRate = 'ReadTaxRate',
    /** Grants permission to read Zone */
    ReadZone = 'ReadZone',
    /** Change a counterparty's assignedManagerId — department-head only within their own department, portal-admin unrestricted (see manager-portal-concept.md §3.3) */
    ReassignCounterpartyManager = 'ReassignCounterpartyManager',
    /** Create a credit-term approval request (layer 5) */
    RequestCreditTermApproval = 'RequestCreditTermApproval',
    /** Create/renew a standing discount grant approval request (layer 5) */
    RequestDiscountGrantApproval = 'RequestDiscountGrantApproval',
    /** Create a one-off price adjustment approval request (layer 5) */
    RequestPriceAdjustmentApproval = 'RequestPriceAdjustmentApproval',
    /** SuperAdmin has unrestricted access to all operations */
    SuperAdmin = 'SuperAdmin',
    /** Grants permission to update Administrator */
    UpdateAdministrator = 'UpdateAdministrator',
    /** Grants permission to update ApiKey */
    UpdateApiKey = 'UpdateApiKey',
    /** Grants permission to update Asset */
    UpdateAsset = 'UpdateAsset',
    /** Grants permission to update Products, Facets, Assets, Collections */
    UpdateCatalog = 'UpdateCatalog',
    /** Grants permission to update Channel */
    UpdateChannel = 'UpdateChannel',
    /** Grants permission to update Collection */
    UpdateCollection = 'UpdateCollection',
    /** Grants permission to update Country */
    UpdateCountry = 'UpdateCountry',
    /** Grants permission to update Customer */
    UpdateCustomer = 'UpdateCustomer',
    /** Grants permission to update CustomerGroup */
    UpdateCustomerGroup = 'UpdateCustomerGroup',
    /** Grants permission to update Facet */
    UpdateFacet = 'UpdateFacet',
    /** Grants permission to update GlobalSettings */
    UpdateGlobalSettings = 'UpdateGlobalSettings',
    /** Grants permission to update Order */
    UpdateOrder = 'UpdateOrder',
    /** Grants permission to update PaymentMethod */
    UpdatePaymentMethod = 'UpdatePaymentMethod',
    /** Grants permission to update Product */
    UpdateProduct = 'UpdateProduct',
    /** Grants permission to update Promotion */
    UpdatePromotion = 'UpdatePromotion',
    /** Grants permission to update Seller */
    UpdateSeller = 'UpdateSeller',
    /** Grants permission to update PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
    UpdateSettings = 'UpdateSettings',
    /** Grants permission to update ShippingMethod */
    UpdateShippingMethod = 'UpdateShippingMethod',
    /** Grants permission to update StockLocation */
    UpdateStockLocation = 'UpdateStockLocation',
    /** Grants permission to update System */
    UpdateSystem = 'UpdateSystem',
    /** Grants permission to update Tag */
    UpdateTag = 'UpdateTag',
    /** Grants permission to update TaxCategory */
    UpdateTaxCategory = 'UpdateTaxCategory',
    /** Grants permission to update TaxRate */
    UpdateTaxRate = 'UpdateTaxRate',
    /** Grants permission to update Zone */
    UpdateZone = 'UpdateZone',
    /** Grants permission to write DashboardGlobalViews */
    WriteDashboardGlobalViews = 'WriteDashboardGlobalViews',
}

export type PermissionDefinition = {
    assignable: Scalars['Boolean']['output'];
    description: Scalars['String']['output'];
    name: Scalars['String']['output'];
};

export type PreviewCollectionVariantsInput = {
    filters: Array<ConfigurableOperationInput>;
    inheritFilters: Scalars['Boolean']['input'];
    parentId?: InputMaybe<Scalars['ID']['input']>;
};

export type PriceAdjustmentResult = {
    approvalRequestId: Maybe<Scalars['ID']['output']>;
    decision: Scalars['String']['output'];
};

export type PriceEntry = {
    id: Scalars['ID']['output'];
    price: Scalars['Int']['output'];
    priceTypeCode: Scalars['String']['output'];
    variantId: Scalars['ID']['output'];
};

export type PriceEntryInput = {
    price: Scalars['Int']['input'];
    priceTypeCode: Scalars['String']['input'];
    variantId: Scalars['ID']['input'];
};

/** The price range where the result has more than one price */
export type PriceRange = {
    max: Scalars['Money']['output'];
    min: Scalars['Money']['output'];
};

export type PriceType = {
    code: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    isActive: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
};

export type Product = Node & {
    assets: Array<Asset>;
    channels: Array<Channel>;
    collections: Array<Collection>;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<ProductCustomFields>;
    description: Scalars['String']['output'];
    enabled: Scalars['Boolean']['output'];
    facetValues: Array<FacetValue>;
    featuredAsset: Maybe<Asset>;
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    optionGroups: Array<ProductOptionGroup>;
    slug: Scalars['String']['output'];
    translations: Array<ProductTranslation>;
    updatedAt: Scalars['DateTime']['output'];
    /** Returns a paginated, sortable, filterable list of ProductVariants */
    variantList: ProductVariantList;
    /** Returns all ProductVariants */
    variants: Array<ProductVariant>;
};

export type ProductVariantListArgs = {
    options?: InputMaybe<ProductVariantListOptions>;
};

export type ProductCrossReference = {
    id: Scalars['ID']['output'];
    oemBrand: Scalars['String']['output'];
    oemCode: Scalars['String']['output'];
    productId: Scalars['ID']['output'];
};

export type ProductCustomFields = {
    externalId: Maybe<Scalars['String']['output']>;
    fullName: Maybe<Scalars['String']['output']>;
    onSale: Maybe<Scalars['Boolean']['output']>;
};

export type ProductFilterParameter = {
    _and?: InputMaybe<Array<ProductFilterParameter>>;
    _or?: InputMaybe<Array<ProductFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    description?: InputMaybe<StringOperators>;
    enabled?: InputMaybe<BooleanOperators>;
    externalId?: InputMaybe<StringOperators>;
    facetValueId?: InputMaybe<IdOperators>;
    fullName?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    onSale?: InputMaybe<BooleanOperators>;
    optionGroupId?: InputMaybe<IdOperators>;
    sku?: InputMaybe<StringOperators>;
    slug?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type ProductList = PaginatedList & {
    items: Array<Product>;
    totalItems: Scalars['Int']['output'];
};

export type ProductListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ProductFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ProductSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductOption = Node & {
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    group: ProductOptionGroup;
    groupId: Scalars['ID']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    translations: Array<ProductOptionTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionFilterParameter = {
    _and?: InputMaybe<Array<ProductOptionFilterParameter>>;
    _or?: InputMaybe<Array<ProductOptionFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    groupId?: InputMaybe<IdOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type ProductOptionGroup = Node & {
    channels: Array<Channel>;
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    options: Array<ProductOption>;
    /** The number of products that use this option group */
    productCount: Scalars['Int']['output'];
    translations: Array<ProductOptionGroupTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionGroupFilterParameter = {
    _and?: InputMaybe<Array<ProductOptionGroupFilterParameter>>;
    _or?: InputMaybe<Array<ProductOptionGroupFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    /** The number of products that use this option group */
    productCount?: InputMaybe<NumberOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type ProductOptionGroupInUseError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    optionGroupCode: Scalars['String']['output'];
    productCount: Scalars['Int']['output'];
    variantCount: Scalars['Int']['output'];
};

export type ProductOptionGroupList = PaginatedList & {
    items: Array<ProductOptionGroup>;
    totalItems: Scalars['Int']['output'];
};

export type ProductOptionGroupListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ProductOptionGroupFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ProductOptionGroupSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductOptionGroupSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    /** The number of products that use this option group */
    productCount?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type ProductOptionGroupTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionGroupTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

export type ProductOptionInUseError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    optionGroupCode: Scalars['String']['output'];
    productVariantCount: Scalars['Int']['output'];
};

export type ProductOptionList = PaginatedList & {
    items: Array<ProductOption>;
    totalItems: Scalars['Int']['output'];
};

export type ProductOptionListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ProductOptionFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ProductOptionSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductOptionSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    groupId?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type ProductOptionTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

export type ProductSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    description?: InputMaybe<SortOrder>;
    externalId?: InputMaybe<SortOrder>;
    fullName?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    onSale?: InputMaybe<SortOrder>;
    slug?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type ProductTaxCodeFlag = {
    detail: Scalars['String']['output'];
    detectedAt: Scalars['DateTime']['output'];
    externalProductId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    rawVatCode: Scalars['String']['output'];
    reason: Scalars['String']['output'];
};

export type ProductTaxCodeFlagList = {
    items: Array<ProductTaxCodeFlag>;
    totalItems: Scalars['Int']['output'];
};

export type ProductTaxCodeFlagListOptions = {
    skip?: InputMaybe<Scalars['Int']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    slug: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    description?: InputMaybe<Scalars['String']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
    slug?: InputMaybe<Scalars['String']['input']>;
};

export type ProductVariant = Node & {
    assets: Array<Asset>;
    channels: Array<Channel>;
    createdAt: Scalars['DateTime']['output'];
    currencyCode: CurrencyCode;
    customFields: Maybe<ProductVariantCustomFields>;
    enabled: Scalars['Boolean']['output'];
    facetValues: Array<FacetValue>;
    featuredAsset: Maybe<Asset>;
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    options: Array<ProductOption>;
    outOfStockThreshold: Scalars['Int']['output'];
    price: Scalars['Money']['output'];
    priceWithTax: Scalars['Money']['output'];
    prices: Array<ProductVariantPrice>;
    product: Product;
    productId: Scalars['ID']['output'];
    sku: Scalars['String']['output'];
    /** @deprecated use stockLevels */
    stockAllocated: Scalars['Int']['output'];
    stockLevel: Scalars['String']['output'];
    stockLevels: Array<StockLevel>;
    stockMovements: StockMovementList;
    /** @deprecated use stockLevels */
    stockOnHand: Scalars['Int']['output'];
    taxCategory: TaxCategory;
    taxRateApplied: TaxRate;
    trackInventory: GlobalFlag;
    translations: Array<ProductVariantTranslation>;
    updatedAt: Scalars['DateTime']['output'];
    useGlobalOutOfStockThreshold: Scalars['Boolean']['output'];
};

export type ProductVariantStockMovementsArgs = {
    options?: InputMaybe<StockMovementListOptions>;
};

export type ProductVariantCustomFields = {
    multiplicity: Maybe<Scalars['Int']['output']>;
    organizationId: Maybe<Scalars['Int']['output']>;
    organizationPriority: Maybe<Scalars['Int']['output']>;
    organizationSourceEntityId: Maybe<Scalars['String']['output']>;
    weight: Maybe<Scalars['Float']['output']>;
};

export type ProductVariantFilterParameter = {
    _and?: InputMaybe<Array<ProductVariantFilterParameter>>;
    _or?: InputMaybe<Array<ProductVariantFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    currencyCode?: InputMaybe<StringOperators>;
    enabled?: InputMaybe<BooleanOperators>;
    facetValueId?: InputMaybe<IdOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    multiplicity?: InputMaybe<NumberOperators>;
    name?: InputMaybe<StringOperators>;
    organizationId?: InputMaybe<NumberOperators>;
    organizationPriority?: InputMaybe<NumberOperators>;
    organizationSourceEntityId?: InputMaybe<StringOperators>;
    outOfStockThreshold?: InputMaybe<NumberOperators>;
    price?: InputMaybe<NumberOperators>;
    priceWithTax?: InputMaybe<NumberOperators>;
    productId?: InputMaybe<IdOperators>;
    sku?: InputMaybe<StringOperators>;
    stockAllocated?: InputMaybe<NumberOperators>;
    stockLevel?: InputMaybe<StringOperators>;
    stockOnHand?: InputMaybe<NumberOperators>;
    trackInventory?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
    useGlobalOutOfStockThreshold?: InputMaybe<BooleanOperators>;
    weight?: InputMaybe<NumberOperators>;
};

export type ProductVariantList = PaginatedList & {
    items: Array<ProductVariant>;
    totalItems: Scalars['Int']['output'];
};

export type ProductVariantListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ProductVariantFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ProductVariantSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductVariantPrice = {
    currencyCode: CurrencyCode;
    customFields: Maybe<Scalars['JSON']['output']>;
    price: Scalars['Money']['output'];
};

export type ProductVariantSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    multiplicity?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    organizationId?: InputMaybe<SortOrder>;
    organizationPriority?: InputMaybe<SortOrder>;
    organizationSourceEntityId?: InputMaybe<SortOrder>;
    outOfStockThreshold?: InputMaybe<SortOrder>;
    price?: InputMaybe<SortOrder>;
    priceWithTax?: InputMaybe<SortOrder>;
    productId?: InputMaybe<SortOrder>;
    sku?: InputMaybe<SortOrder>;
    stockAllocated?: InputMaybe<SortOrder>;
    stockLevel?: InputMaybe<SortOrder>;
    stockOnHand?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
    weight?: InputMaybe<SortOrder>;
};

export type ProductVariantTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductVariantTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

export type Promotion = Node & {
    actions: Array<ConfigurableOperation>;
    conditions: Array<ConfigurableOperation>;
    couponCode: Maybe<Scalars['String']['output']>;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    enabled: Scalars['Boolean']['output'];
    endsAt: Maybe<Scalars['DateTime']['output']>;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    perCustomerUsageLimit: Maybe<Scalars['Int']['output']>;
    startsAt: Maybe<Scalars['DateTime']['output']>;
    translations: Array<PromotionTranslation>;
    updatedAt: Scalars['DateTime']['output'];
    usageLimit: Maybe<Scalars['Int']['output']>;
};

export type PromotionFilterParameter = {
    _and?: InputMaybe<Array<PromotionFilterParameter>>;
    _or?: InputMaybe<Array<PromotionFilterParameter>>;
    couponCode?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    description?: InputMaybe<StringOperators>;
    enabled?: InputMaybe<BooleanOperators>;
    endsAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    name?: InputMaybe<StringOperators>;
    perCustomerUsageLimit?: InputMaybe<NumberOperators>;
    startsAt?: InputMaybe<DateOperators>;
    updatedAt?: InputMaybe<DateOperators>;
    usageLimit?: InputMaybe<NumberOperators>;
};

export type PromotionList = PaginatedList & {
    items: Array<Promotion>;
    totalItems: Scalars['Int']['output'];
};

export type PromotionListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<PromotionFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<PromotionSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type PromotionSortParameter = {
    couponCode?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    description?: InputMaybe<SortOrder>;
    endsAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    perCustomerUsageLimit?: InputMaybe<SortOrder>;
    startsAt?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
    usageLimit?: InputMaybe<SortOrder>;
};

export type PromotionTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type PromotionTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    description?: InputMaybe<Scalars['String']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

export type Province = Node &
    Region & {
        code: Scalars['String']['output'];
        createdAt: Scalars['DateTime']['output'];
        customFields: Maybe<Scalars['JSON']['output']>;
        enabled: Scalars['Boolean']['output'];
        id: Scalars['ID']['output'];
        languageCode: LanguageCode;
        name: Scalars['String']['output'];
        parent: Maybe<Region>;
        parentId: Maybe<Scalars['ID']['output']>;
        translations: Array<RegionTranslation>;
        type: Scalars['String']['output'];
        updatedAt: Scalars['DateTime']['output'];
    };

export type ProvinceFilterParameter = {
    _and?: InputMaybe<Array<ProvinceFilterParameter>>;
    _or?: InputMaybe<Array<ProvinceFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    enabled?: InputMaybe<BooleanOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    parentId?: InputMaybe<IdOperators>;
    type?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type ProvinceList = PaginatedList & {
    items: Array<Province>;
    totalItems: Scalars['Int']['output'];
};

export type ProvinceListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ProvinceFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ProvinceSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProvinceSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    parentId?: InputMaybe<SortOrder>;
    type?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type ProvinceTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if the specified quantity of an OrderLine is greater than the number of items in that line */
export type QuantityTooGreatError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Query = {
    activeAdministrator: Maybe<Administrator>;
    activeChannel: Channel;
    administrator: Maybe<Administrator>;
    administrators: AdministratorList;
    apiKey: Maybe<ApiKey>;
    apiKeys: ApiKeyList;
    approvalRequest: Maybe<ApprovalRequest>;
    approvalRequestsByType: ApprovalRequestList;
    /** Get a single Asset by id */
    asset: Maybe<Asset>;
    /** Get a list of Assets */
    assets: AssetList;
    availableStock: Scalars['Int']['output'];
    branchSettings: Maybe<BranchSettings>;
    branches: Array<Branch>;
    /** Seed-script helper only — lists real captured online-acquiring payments to attach mock refunds/disputes to (backend-plugin-rules skill's Dev seed rules exception, see seed-payment-refunds.mjs). */
    capturedOnlinePayments: Array<PaymentAttempt>;
    channel: Maybe<Channel>;
    channels: ChannelList;
    /** Get a Collection either by id or slug. If neither id nor slug is specified, an error will result. */
    collection: Maybe<Collection>;
    collectionFilters: Array<ConfigurableOperationDefinition>;
    collections: CollectionList;
    counterparties: CounterpartyList;
    counterparty: Maybe<Counterparty>;
    counterpartySummary: CounterpartySummary;
    countries: CountryList;
    country: Maybe<Country>;
    creditTermLimit: Maybe<CreditTermLimit>;
    customer: Maybe<Customer>;
    customerGroup: Maybe<CustomerGroup>;
    customerGroups: CustomerGroupList;
    /** Real DB-level filtered + paginated order list for one customer, bucketed by real captured-payment status (unpaid/partial/paid) — see AdminOrderPaymentViewResolver. Used by CustomerOrdersTab.vue's Unpaid/Partially paid/Paid view chips. */
    customerOrdersByPaymentView: OrderList;
    customers: CustomerList;
    /** Get metrics for the given date range and metric types. */
    dashboardMetricSummary: Array<DashboardMetricSummary>;
    departments: Array<Department>;
    discountGrantsForCounterparty: DiscountGrantForCustomerList;
    discountRegistryPage: DiscountRegistryEntryList;
    discountRules: Array<DiscountRule>;
    documentTypes: Array<Scalars['String']['output']>;
    documents: DocumentList;
    /** Returns a list of eligible shipping methods for the draft Order */
    eligibleShippingMethodsForDraftOrder: Array<ShippingMethodQuote>;
    /** Returns all configured EntityDuplicators. */
    entityDuplicators: Array<EntityDuplicatorDefinition>;
    entityVersions: Array<EntityVersion>;
    entityVersionsForEntities: EntityVersionList;
    expiringDiscountGrants: Array<DiscountGrant>;
    facet: Maybe<Facet>;
    facetValue: Maybe<FacetValue>;
    facetValues: FacetValueList;
    facets: FacetList;
    /** Dead-lettered inbound Kafka events, newest first — for the manager-portal dashboard's integration-health panel (issue #76). */
    failedIntegrationInboxEvents: FailedIntegrationInboxEventList;
    floorPrice: Maybe<Scalars['Int']['output']>;
    fulfillmentHandlers: Array<ConfigurableOperationDefinition>;
    /** Get value for a specific key (automatically scoped based on field configuration) */
    getSettingsStoreValue: Maybe<Scalars['JSON']['output']>;
    /** Get multiple key-value pairs (each automatically scoped) */
    getSettingsStoreValues: Maybe<Scalars['JSON']['output']>;
    globalSettings: GlobalSettings;
    highUsageCounterparties: Array<Counterparty>;
    /** Sum of a counterparty's unpaid (pending/issued) invoices, scoped the same way visibleInvoices is. Null if the counterparty has no unpaid invoices, not zero-with-a-currency. */
    invoiceOutstandingBalance: Maybe<MoneyAmount>;
    invoicesForOrder: Array<Invoice>;
    job: Maybe<Job>;
    jobBufferSize: Array<JobBufferSize>;
    jobQueues: Array<JobQueue>;
    jobs: JobList;
    jobsById: Array<Job>;
    me: Maybe<CurrentUser>;
    myApprovalRequestsSummary: ApprovalRequestsSummary;
    myApprovalsInbox: ApprovalsInbox;
    mySessions: Array<SessionSummary>;
    myTableViews: Array<SavedTableView>;
    /** The calling administrator's own notifications plus visible broadcast notifications, newest first, server-paginated (issue #87). */
    notifications: NotificationList;
    /** Open entity-completeness discrepancies against Integration Service's reconciliation summary (issue #84), newest first. */
    openErpReconciliationIssues: ErpReconciliationIssueList;
    /** Open payment reconciliation issues, newest first — for the manager-portal dashboard's integration-health panel (issue #76). */
    openPaymentReconciliationIssues: PaymentReconciliationIssueList;
    /** Open reservation/1C drift issues, newest first — for the manager-portal dashboard's integration-health panel (issue #76). */
    openReservationReconciliationIssues: ReservationReconciliationIssueList;
    order: Maybe<Order>;
    /** Batched captured-payment total per order, for the manager portal's order-list Payment badge. Returns one summary per orderId requested, capturedAmount 0 if none captured yet. */
    orderPaymentSummaries: Array<OrderPaymentSummary>;
    orderReservations: Array<Reservation>;
    orders: OrderList;
    organizationRequisites: Array<OrganizationRequisites>;
    /** Seed-script idempotency helper only — see seed-payment-refunds.mjs. */
    paymentDisputeExists: Scalars['Boolean']['output'];
    paymentMethod: Maybe<PaymentMethod>;
    paymentMethodEligibilityCheckers: Array<ConfigurableOperationDefinition>;
    paymentMethodHandlers: Array<ConfigurableOperationDefinition>;
    paymentMethods: PaymentMethodList;
    /** Seed-script idempotency helper only — see seed-payment-refunds.mjs. */
    paymentRefundExists: Scalars['Boolean']['output'];
    pendingPriceAdjustmentOrderIds: Array<Scalars['String']['output']>;
    pendingSearchIndexUpdates: Scalars['Int']['output'];
    /** Used for real-time previews of the contents of a Collection */
    previewCollectionVariants: ProductVariantList;
    priceAdjustmentRequestsForOrder: Array<ApprovalRequest>;
    priceEntriesForVariants: Array<VariantPriceEntry>;
    priceTypeCodes: Array<Scalars['String']['output']>;
    priceTypes: Array<PriceType>;
    /** Get a Product either by id or slug. If neither id nor slug is specified, an error will result. */
    product: Maybe<Product>;
    productCrossReferences: Array<ProductCrossReference>;
    productOption: Maybe<ProductOption>;
    productOptionGroup: Maybe<ProductOptionGroup>;
    productOptionGroups: ProductOptionGroupList;
    productOptions: ProductOptionList;
    /** Get a ProductVariant by id */
    productVariant: Maybe<ProductVariant>;
    /** List ProductVariants either all or for the specific product. */
    productVariants: ProductVariantList;
    /** List Products */
    products: ProductList;
    promotion: Maybe<Promotion>;
    promotionActions: Array<ConfigurableOperationDefinition>;
    promotionConditions: Array<ConfigurableOperationDefinition>;
    promotions: PromotionList;
    province: Maybe<Province>;
    provinces: ProvinceList;
    /** Non-blocking VAT-code review flags raised while importing products, newest first (issue #79). */
    recentProductTaxCodeFlags: ProductTaxCodeFlagList;
    reservationExtensionLimit: Maybe<ReservationExtensionLimit>;
    role: Maybe<Role>;
    roleAccessScopeConfig: Maybe<Scalars['String']['output']>;
    roles: RoleList;
    scheduledTasks: Array<ScheduledTask>;
    search: SearchResponse;
    seller: Maybe<Seller>;
    sellers: SellerList;
    /** Returns all registered settings store field definitions with their current values */
    settingsStoreFieldDefinitions: Array<SettingsStoreFieldDefinition>;
    shippingCalculators: Array<ConfigurableOperationDefinition>;
    shippingEligibilityCheckers: Array<ConfigurableOperationDefinition>;
    shippingMethod: Maybe<ShippingMethod>;
    shippingMethods: ShippingMethodList;
    /** Generate slug for entity */
    slugForEntity: Scalars['String']['output'];
    stockLocation: Maybe<StockLocation>;
    stockLocations: StockLocationList;
    tag: Tag;
    tags: TagList;
    taxCategories: TaxCategoryList;
    taxCategory: Maybe<TaxCategory>;
    taxRate: Maybe<TaxRate>;
    taxRates: TaxRateList;
    teamDirectory: Array<TeamDirectoryMember>;
    teamMembers: Array<TeamMember>;
    testEligibleShippingMethods: Array<ShippingMethodQuote>;
    testShippingMethod: TestShippingMethodResult;
    tradingPoint: Maybe<TradingPoint>;
    unassignedCounterpartyCount: Scalars['Int']['output'];
    /** Manager-portal invoice list, branch-scoped via AccessScopeService.resolveInvoiceScope — see AdminInvoiceVisibilityResolver / docs/access-control.md. */
    visibleInvoices: InvoiceList;
    visibleOrders: OrderList;
    /** Manager-portal payment list — derived-from-Invoice scoping, see PaymentVisibilityService. */
    visiblePayments: PaymentAttemptList;
    warehouses: Array<Warehouse>;
    zone: Maybe<Zone>;
    zones: ZoneList;
};

export type QueryAdministratorArgs = {
    id: Scalars['ID']['input'];
};

export type QueryAdministratorsArgs = {
    options?: InputMaybe<AdministratorListOptions>;
};

export type QueryApiKeyArgs = {
    id: Scalars['ID']['input'];
};

export type QueryApiKeysArgs = {
    options?: InputMaybe<ApiKeyListOptions>;
};

export type QueryApprovalRequestArgs = {
    id: Scalars['ID']['input'];
};

export type QueryApprovalRequestsByTypeArgs = {
    options?: InputMaybe<ApprovalListOptions>;
    requestType: Scalars['String']['input'];
};

export type QueryAssetArgs = {
    id: Scalars['ID']['input'];
};

export type QueryAssetsArgs = {
    options?: InputMaybe<AssetListOptions>;
};

export type QueryAvailableStockArgs = {
    productVariantId: Scalars['ID']['input'];
};

export type QueryBranchSettingsArgs = {
    branchId: Scalars['String']['input'];
};

export type QueryCapturedOnlinePaymentsArgs = {
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryChannelArgs = {
    id: Scalars['ID']['input'];
};

export type QueryChannelsArgs = {
    options?: InputMaybe<ChannelListOptions>;
};

export type QueryCollectionArgs = {
    id?: InputMaybe<Scalars['ID']['input']>;
    slug?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCollectionsArgs = {
    options?: InputMaybe<CollectionListOptions>;
};

export type QueryCounterpartiesArgs = {
    options?: InputMaybe<CounterpartyListOptions>;
};

export type QueryCounterpartyArgs = {
    id: Scalars['ID']['input'];
};

export type QueryCountriesArgs = {
    options?: InputMaybe<CountryListOptions>;
};

export type QueryCountryArgs = {
    id: Scalars['ID']['input'];
};

export type QueryCreditTermLimitArgs = {
    roleCode: Scalars['String']['input'];
};

export type QueryCustomerArgs = {
    id: Scalars['ID']['input'];
};

export type QueryCustomerGroupArgs = {
    id: Scalars['ID']['input'];
};

export type QueryCustomerGroupsArgs = {
    options?: InputMaybe<CustomerGroupListOptions>;
};

export type QueryCustomerOrdersByPaymentViewArgs = {
    customerId: Scalars['ID']['input'];
    options?: InputMaybe<OrderListOptions>;
    paymentView: Scalars['String']['input'];
};

export type QueryCustomersArgs = {
    options?: InputMaybe<CustomerListOptions>;
};

export type QueryDashboardMetricSummaryArgs = {
    input?: InputMaybe<DashboardMetricSummaryInput>;
};

export type QueryDiscountGrantsForCounterpartyArgs = {
    counterpartyId: Scalars['ID']['input'];
    options?: InputMaybe<DiscountGrantForCustomerListOptions>;
};

export type QueryDiscountRegistryPageArgs = {
    options?: InputMaybe<DiscountRegistryListOptions>;
};

export type QueryDiscountRulesArgs = {
    priceTypeCode?: InputMaybe<Scalars['String']['input']>;
};

export type QueryDocumentTypesArgs = {
    counterpartyId?: InputMaybe<Scalars['ID']['input']>;
};

export type QueryDocumentsArgs = {
    counterpartyId?: InputMaybe<Scalars['ID']['input']>;
    options?: InputMaybe<DocumentListOptions>;
    orderId?: InputMaybe<Scalars['ID']['input']>;
};

export type QueryEligibleShippingMethodsForDraftOrderArgs = {
    orderId: Scalars['ID']['input'];
};

export type QueryEntityVersionsArgs = {
    entityId: Scalars['ID']['input'];
    entityName: Scalars['String']['input'];
};

export type QueryEntityVersionsForEntitiesArgs = {
    options?: InputMaybe<EntityVersionListOptions>;
    refs: Array<EntityRefInput>;
};

export type QueryExpiringDiscountGrantsArgs = {
    withinDays: Scalars['Int']['input'];
};

export type QueryFacetArgs = {
    id: Scalars['ID']['input'];
};

export type QueryFacetValueArgs = {
    id: Scalars['ID']['input'];
};

export type QueryFacetValuesArgs = {
    options?: InputMaybe<FacetValueListOptions>;
};

export type QueryFacetsArgs = {
    options?: InputMaybe<FacetListOptions>;
};

export type QueryFailedIntegrationInboxEventsArgs = {
    options?: InputMaybe<FailedIntegrationInboxEventListOptions>;
};

export type QueryFloorPriceArgs = {
    variantId: Scalars['ID']['input'];
};

export type QueryGetSettingsStoreValueArgs = {
    key: Scalars['String']['input'];
};

export type QueryGetSettingsStoreValuesArgs = {
    keys: Array<Scalars['String']['input']>;
};

export type QueryHighUsageCounterpartiesArgs = {
    limit: Scalars['Int']['input'];
};

export type QueryInvoiceOutstandingBalanceArgs = {
    counterpartyId: Scalars['ID']['input'];
};

export type QueryInvoicesForOrderArgs = {
    orderId: Scalars['ID']['input'];
};

export type QueryJobArgs = {
    jobId: Scalars['ID']['input'];
};

export type QueryJobBufferSizeArgs = {
    bufferIds?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type QueryJobsArgs = {
    options?: InputMaybe<JobListOptions>;
};

export type QueryJobsByIdArgs = {
    jobIds: Array<Scalars['ID']['input']>;
};

export type QueryMyApprovalRequestsSummaryArgs = {
    recentLimit?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryMyApprovalsInboxArgs = {
    allInvolvedOptions?: InputMaybe<ApprovalListOptions>;
    awaitingOptions?: InputMaybe<ApprovalListOptions>;
};

export type QueryMyTableViewsArgs = {
    pageKey: Scalars['String']['input'];
};

export type QueryNotificationsArgs = {
    options?: InputMaybe<NotificationListOptions>;
};

export type QueryOpenErpReconciliationIssuesArgs = {
    options?: InputMaybe<OpenErpReconciliationIssueListOptions>;
};

export type QueryOpenPaymentReconciliationIssuesArgs = {
    options?: InputMaybe<OpenPaymentReconciliationIssueListOptions>;
};

export type QueryOpenReservationReconciliationIssuesArgs = {
    options?: InputMaybe<OpenReservationReconciliationIssueListOptions>;
};

export type QueryOrderArgs = {
    id: Scalars['ID']['input'];
};

export type QueryOrderPaymentSummariesArgs = {
    orderIds: Array<Scalars['ID']['input']>;
};

export type QueryOrderReservationsArgs = {
    orderId: Scalars['ID']['input'];
};

export type QueryOrdersArgs = {
    options?: InputMaybe<OrderListOptions>;
};

export type QueryPaymentDisputeExistsArgs = {
    paymentId: Scalars['ID']['input'];
    type: Scalars['String']['input'];
};

export type QueryPaymentMethodArgs = {
    id: Scalars['ID']['input'];
};

export type QueryPaymentMethodsArgs = {
    options?: InputMaybe<PaymentMethodListOptions>;
};

export type QueryPaymentRefundExistsArgs = {
    providerRefundId: Scalars['String']['input'];
};

export type QueryPreviewCollectionVariantsArgs = {
    input: PreviewCollectionVariantsInput;
    options?: InputMaybe<ProductVariantListOptions>;
};

export type QueryPriceAdjustmentRequestsForOrderArgs = {
    orderId: Scalars['ID']['input'];
};

export type QueryPriceEntriesForVariantsArgs = {
    priceTypeCode: Scalars['String']['input'];
    variantIds: Array<Scalars['ID']['input']>;
};

export type QueryProductArgs = {
    id?: InputMaybe<Scalars['ID']['input']>;
    slug?: InputMaybe<Scalars['String']['input']>;
};

export type QueryProductCrossReferencesArgs = {
    productId: Scalars['ID']['input'];
};

export type QueryProductOptionArgs = {
    id: Scalars['ID']['input'];
};

export type QueryProductOptionGroupArgs = {
    id: Scalars['ID']['input'];
};

export type QueryProductOptionGroupsArgs = {
    options?: InputMaybe<ProductOptionGroupListOptions>;
};

export type QueryProductOptionsArgs = {
    groupId?: InputMaybe<Scalars['ID']['input']>;
    options?: InputMaybe<ProductOptionListOptions>;
};

export type QueryProductVariantArgs = {
    id: Scalars['ID']['input'];
};

export type QueryProductVariantsArgs = {
    options?: InputMaybe<ProductVariantListOptions>;
    productId?: InputMaybe<Scalars['ID']['input']>;
};

export type QueryProductsArgs = {
    options?: InputMaybe<ProductListOptions>;
};

export type QueryPromotionArgs = {
    id: Scalars['ID']['input'];
};

export type QueryPromotionsArgs = {
    options?: InputMaybe<PromotionListOptions>;
};

export type QueryProvinceArgs = {
    id: Scalars['ID']['input'];
};

export type QueryProvincesArgs = {
    options?: InputMaybe<ProvinceListOptions>;
};

export type QueryRecentProductTaxCodeFlagsArgs = {
    options?: InputMaybe<ProductTaxCodeFlagListOptions>;
};

export type QueryReservationExtensionLimitArgs = {
    roleCode: Scalars['String']['input'];
};

export type QueryRoleArgs = {
    id: Scalars['ID']['input'];
};

export type QueryRoleAccessScopeConfigArgs = {
    roleCode: Scalars['String']['input'];
};

export type QueryRolesArgs = {
    options?: InputMaybe<RoleListOptions>;
};

export type QuerySearchArgs = {
    input: SearchInput;
};

export type QuerySellerArgs = {
    id: Scalars['ID']['input'];
};

export type QuerySellersArgs = {
    options?: InputMaybe<SellerListOptions>;
};

export type QueryShippingMethodArgs = {
    id: Scalars['ID']['input'];
};

export type QueryShippingMethodsArgs = {
    options?: InputMaybe<ShippingMethodListOptions>;
};

export type QuerySlugForEntityArgs = {
    input: SlugForEntityInput;
};

export type QueryStockLocationArgs = {
    id: Scalars['ID']['input'];
};

export type QueryStockLocationsArgs = {
    options?: InputMaybe<StockLocationListOptions>;
};

export type QueryTagArgs = {
    id: Scalars['ID']['input'];
};

export type QueryTagsArgs = {
    options?: InputMaybe<TagListOptions>;
};

export type QueryTaxCategoriesArgs = {
    options?: InputMaybe<TaxCategoryListOptions>;
};

export type QueryTaxCategoryArgs = {
    id: Scalars['ID']['input'];
};

export type QueryTaxRateArgs = {
    id: Scalars['ID']['input'];
};

export type QueryTaxRatesArgs = {
    options?: InputMaybe<TaxRateListOptions>;
};

export type QueryTestEligibleShippingMethodsArgs = {
    input: TestEligibleShippingMethodsInput;
};

export type QueryTestShippingMethodArgs = {
    input: TestShippingMethodInput;
};

export type QueryTradingPointArgs = {
    id: Scalars['ID']['input'];
};

export type QueryVisibleInvoicesArgs = {
    counterpartyId?: InputMaybe<Scalars['ID']['input']>;
    options?: InputMaybe<InvoiceListOptions>;
};

export type QueryVisibleOrdersArgs = {
    customerId?: InputMaybe<Scalars['ID']['input']>;
    managerId?: InputMaybe<Scalars['ID']['input']>;
    options?: InputMaybe<OrderListOptions>;
    search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryVisiblePaymentsArgs = {
    counterpartyId?: InputMaybe<Scalars['ID']['input']>;
    options?: InputMaybe<PaymentListOptions>;
};

export type QueryZoneArgs = {
    id: Scalars['ID']['input'];
};

export type QueryZonesArgs = {
    options?: InputMaybe<ZoneListOptions>;
};

export type Refund = Node & {
    adjustment: Scalars['Money']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    items: Scalars['Money']['output'];
    lines: Array<RefundLine>;
    metadata: Maybe<Scalars['JSON']['output']>;
    method: Maybe<Scalars['String']['output']>;
    paymentId: Scalars['ID']['output'];
    reason: Maybe<Scalars['String']['output']>;
    shipping: Scalars['Money']['output'];
    state: Scalars['String']['output'];
    total: Scalars['Money']['output'];
    transactionId: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

/** Returned if `amount` is greater than the maximum un-refunded amount of the Payment */
export type RefundAmountError = ErrorResult & {
    errorCode: ErrorCode;
    maximumRefundable: Scalars['Int']['output'];
    message: Scalars['String']['output'];
};

export type RefundLine = {
    orderLine: OrderLine;
    orderLineId: Scalars['ID']['output'];
    quantity: Scalars['Int']['output'];
    refund: Refund;
    refundId: Scalars['ID']['output'];
};

export type RefundOrderInput = {
    /**
     * The amount to be refunded to this particular payment. This was introduced in v2.2.0 as the preferred way to specify the refund amount.
     * Can be as much as the total amount of the payment minus the sum of all previous refunds.
     */
    amount?: InputMaybe<Scalars['Money']['input']>;
    paymentId: Scalars['ID']['input'];
    reason?: InputMaybe<Scalars['String']['input']>;
};

export type RefundOrderResult =
    | AlreadyRefundedError
    | MultipleOrderError
    | NothingToRefundError
    | OrderStateTransitionError
    | PaymentOrderMismatchError
    | QuantityTooGreatError
    | Refund
    | RefundAmountError
    | RefundOrderStateError
    | RefundStateTransitionError;

/** Returned if an attempting to refund an Order which is not in the expected state */
export type RefundOrderStateError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    orderState: Scalars['String']['output'];
};

/**
 * Returned when a call to modifyOrder fails to include a refundPaymentId even
 * though the price has decreased as a result of the changes.
 */
export type RefundPaymentIdMissingError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned when there is an error in transitioning the Refund state */
export type RefundStateTransitionError = ErrorResult & {
    errorCode: ErrorCode;
    fromState: Scalars['String']['output'];
    message: Scalars['String']['output'];
    toState: Scalars['String']['output'];
    transitionError: Scalars['String']['output'];
};

export type Region = {
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    enabled: Scalars['Boolean']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    parent: Maybe<Region>;
    parentId: Maybe<Scalars['ID']['output']>;
    translations: Array<RegionTranslation>;
    type: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type RegionTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type RelationCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    entity: Scalars['String']['output'];
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    scalarFields: Array<Scalars['String']['output']>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type Release = Node &
    StockMovement & {
        createdAt: Scalars['DateTime']['output'];
        customFields: Maybe<Scalars['JSON']['output']>;
        id: Scalars['ID']['output'];
        productVariant: ProductVariant;
        quantity: Scalars['Int']['output'];
        type: StockMovementType;
        updatedAt: Scalars['DateTime']['output'];
    };

export type RemoveCollectionsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    collectionIds: Array<Scalars['ID']['input']>;
};

export type RemoveFacetFromChannelResult = Facet | FacetInUseError;

export type RemoveFacetsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    facetIds: Array<Scalars['ID']['input']>;
    force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type RemoveOptionGroupFromProductResult = Product | ProductOptionInUseError;

export type RemoveOrderItemsResult = Order | OrderInterceptorError | OrderModificationError;

export type RemovePaymentMethodsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    paymentMethodIds: Array<Scalars['ID']['input']>;
};

export type RemoveProductOptionGroupFromChannelResult =
    | ProductOptionGroup
    | ProductOptionGroupInUseError;

export type RemoveProductOptionGroupsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    force?: InputMaybe<Scalars['Boolean']['input']>;
    productOptionGroupIds: Array<Scalars['ID']['input']>;
};

export type RemoveProductVariantsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    productVariantIds: Array<Scalars['ID']['input']>;
};

export type RemoveProductsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    productIds: Array<Scalars['ID']['input']>;
};

export type RemovePromotionsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    promotionIds: Array<Scalars['ID']['input']>;
};

export type RemoveShippingMethodsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    shippingMethodIds: Array<Scalars['ID']['input']>;
};

export type RemoveStockLocationsFromChannelInput = {
    channelId: Scalars['ID']['input'];
    stockLocationIds: Array<Scalars['ID']['input']>;
};

export type Reservation = {
    confirmedByAdministratorId: Maybe<Scalars['ID']['output']>;
    creationMethod: Scalars['String']['output'];
    erpConfirmedAt: Maybe<Scalars['DateTime']['output']>;
    erpOperationId: Scalars['String']['output'];
    erpReleaseOperationId: Maybe<Scalars['String']['output']>;
    expiresAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    interventionFlaggedAt: Maybe<Scalars['DateTime']['output']>;
    orderId: Scalars['ID']['output'];
    orderLineId: Scalars['ID']['output'];
    productVariantId: Scalars['ID']['output'];
    quantity: Scalars['Int']['output'];
    releasedAt: Maybe<Scalars['DateTime']['output']>;
    reservedAt: Scalars['DateTime']['output'];
    status: Scalars['String']['output'];
    stockLocationId: Scalars['ID']['output'];
};

export type ReservationExtensionLimit = {
    maxExtraDays: Scalars['Int']['output'];
    roleCode: Scalars['String']['output'];
};

export type ReservationReconciliationIssue = {
    detectedAt: Scalars['DateTime']['output'];
    erpQuantity: Maybe<Scalars['Int']['output']>;
    externalProductId: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    issueType: Scalars['String']['output'];
    localQuantity: Maybe<Scalars['Int']['output']>;
    orderEntityId: Scalars['ID']['output'];
    orderId: Scalars['ID']['output'];
    productVariantId: Maybe<Scalars['ID']['output']>;
    status: Scalars['String']['output'];
};

export type ReservationReconciliationIssueList = {
    items: Array<ReservationReconciliationIssue>;
    totalItems: Scalars['Int']['output'];
};

export type Return = Node &
    StockMovement & {
        createdAt: Scalars['DateTime']['output'];
        customFields: Maybe<Scalars['JSON']['output']>;
        id: Scalars['ID']['output'];
        productVariant: ProductVariant;
        quantity: Scalars['Int']['output'];
        type: StockMovementType;
        updatedAt: Scalars['DateTime']['output'];
    };

export type Role = Node & {
    channels: Array<Channel>;
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    permissions: Array<Permission>;
    updatedAt: Scalars['DateTime']['output'];
};

export type RoleFilterParameter = {
    _and?: InputMaybe<Array<RoleFilterParameter>>;
    _or?: InputMaybe<Array<RoleFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    description?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type RoleList = PaginatedList & {
    items: Array<Role>;
    totalItems: Scalars['Int']['output'];
};

export type RoleListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<RoleFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<RoleSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type RoleSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    description?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type RotateApiKeyResult = {
    /** The generated API-Key. API-Keys cannot be viewed again after creation! */
    apiKey: Scalars['String']['output'];
};

export type Sale = Node &
    StockMovement & {
        createdAt: Scalars['DateTime']['output'];
        customFields: Maybe<Scalars['JSON']['output']>;
        id: Scalars['ID']['output'];
        productVariant: ProductVariant;
        quantity: Scalars['Int']['output'];
        type: StockMovementType;
        updatedAt: Scalars['DateTime']['output'];
    };

export type SavedTableView = {
    createdAt: Scalars['DateTime']['output'];
    filters: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    pageKey: Scalars['String']['output'];
    visibleColumns: Array<Scalars['String']['output']>;
};

export type ScheduledTask = {
    description: Scalars['String']['output'];
    enabled: Scalars['Boolean']['output'];
    id: Scalars['String']['output'];
    isRunning: Scalars['Boolean']['output'];
    lastExecutedAt: Maybe<Scalars['DateTime']['output']>;
    lastResult: Maybe<Scalars['JSON']['output']>;
    nextExecutionAt: Maybe<Scalars['DateTime']['output']>;
    schedule: Scalars['String']['output'];
    scheduleDescription: Scalars['String']['output'];
};

export type SearchInput = {
    collectionId?: InputMaybe<Scalars['ID']['input']>;
    collectionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    collectionSlug?: InputMaybe<Scalars['String']['input']>;
    collectionSlugs?: InputMaybe<Array<Scalars['String']['input']>>;
    facetValueFilters?: InputMaybe<Array<FacetValueFilterInput>>;
    groupByProduct?: InputMaybe<Scalars['Boolean']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    sort?: InputMaybe<SearchResultSortParameter>;
    take?: InputMaybe<Scalars['Int']['input']>;
    term?: InputMaybe<Scalars['String']['input']>;
};

export type SearchReindexResponse = {
    success: Scalars['Boolean']['output'];
};

export type SearchResponse = {
    collections: Array<CollectionResult>;
    facetValues: Array<FacetValueResult>;
    items: Array<SearchResult>;
    totalItems: Scalars['Int']['output'];
};

export type SearchResult = {
    /** An array of ids of the Channels in which this result appears */
    channelIds: Array<Scalars['ID']['output']>;
    /** An array of ids of the Collections in which this result appears */
    collectionIds: Array<Scalars['ID']['output']>;
    currencyCode: CurrencyCode;
    description: Scalars['String']['output'];
    enabled: Scalars['Boolean']['output'];
    facetIds: Array<Scalars['ID']['output']>;
    facetValueIds: Array<Scalars['ID']['output']>;
    price: SearchResultPrice;
    priceWithTax: SearchResultPrice;
    productAsset: Maybe<SearchResultAsset>;
    productId: Scalars['ID']['output'];
    productName: Scalars['String']['output'];
    productVariantAsset: Maybe<SearchResultAsset>;
    productVariantId: Scalars['ID']['output'];
    productVariantName: Scalars['String']['output'];
    /** A relevance score for the result. Differs between database implementations */
    score: Scalars['Float']['output'];
    sku: Scalars['String']['output'];
    slug: Scalars['String']['output'];
};

export type SearchResultAsset = {
    focalPoint: Maybe<Coordinate>;
    id: Scalars['ID']['output'];
    preview: Scalars['String']['output'];
};

/** The price of a search result product, either as a range or as a single price */
export type SearchResultPrice = PriceRange | SinglePrice;

export type SearchResultSortParameter = {
    name?: InputMaybe<SortOrder>;
    price?: InputMaybe<SortOrder>;
};

export type Seller = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type SellerFilterParameter = {
    _and?: InputMaybe<Array<SellerFilterParameter>>;
    _or?: InputMaybe<Array<SellerFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type SellerList = PaginatedList & {
    items: Array<Seller>;
    totalItems: Scalars['Int']['output'];
};

export type SellerListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<SellerFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<SellerSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type SellerSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type ServerConfig = {
    /**
     * This field is deprecated in v2.2 in favor of the entityCustomFields field,
     * which allows custom fields to be defined on user-supplies entities.
     */
    customFieldConfig: CustomFields;
    entityCustomFields: Array<EntityCustomFields>;
    moneyStrategyPrecision: Scalars['Int']['output'];
    orderProcess: Array<OrderProcessState>;
    permissions: Array<PermissionDefinition>;
    permittedAssetTypes: Array<Scalars['String']['output']>;
};

export type SessionSummary = {
    createdAt: Scalars['DateTime']['output'];
    current: Scalars['Boolean']['output'];
    deviceLabel: Scalars['String']['output'];
    expires: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    userAgent: Maybe<Scalars['String']['output']>;
};

export type SetCustomerForDraftOrderResult = EmailAddressConflictError | Order;

export type SetOrderCustomerInput = {
    customerId: Scalars['ID']['input'];
    note?: InputMaybe<Scalars['String']['input']>;
    orderId: Scalars['ID']['input'];
};

export type SetOrderShippingMethodResult =
    | IneligibleShippingMethodError
    | NoActiveOrderError
    | Order
    | OrderModificationError;

export type SetSettingsStoreValueResult = {
    error: Maybe<Scalars['String']['output']>;
    key: Scalars['String']['output'];
    result: Scalars['Boolean']['output'];
};

export type SettingsStoreFieldDefinition = {
    currentValue: Maybe<Scalars['JSON']['output']>;
    key: Scalars['String']['output'];
    readonly: Scalars['Boolean']['output'];
    scopeType: SettingsStoreScopeType;
};

export type SettingsStoreInput = {
    key: Scalars['String']['input'];
    value: Scalars['JSON']['input'];
};

export enum SettingsStoreScopeType {
    Channel = 'CHANNEL',
    Custom = 'CUSTOM',
    Global = 'GLOBAL',
    User = 'USER',
    UserAndChannel = 'USER_AND_CHANNEL',
}

/** Returned if the Payment settlement fails */
export type SettlePaymentError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    paymentErrorMessage: Scalars['String']['output'];
};

export type SettlePaymentResult =
    | OrderStateTransitionError
    | Payment
    | PaymentStateTransitionError
    | SettlePaymentError;

export type SettleRefundInput = {
    id: Scalars['ID']['input'];
    transactionId: Scalars['String']['input'];
};

export type SettleRefundResult = Refund | RefundStateTransitionError;

export type ShippingLine = {
    customFields: Maybe<Scalars['JSON']['output']>;
    discountedPrice: Scalars['Money']['output'];
    discountedPriceWithTax: Scalars['Money']['output'];
    discounts: Array<Discount>;
    id: Scalars['ID']['output'];
    price: Scalars['Money']['output'];
    priceWithTax: Scalars['Money']['output'];
    shippingMethod: ShippingMethod;
};

export type ShippingMethod = Node & {
    calculator: ConfigurableOperation;
    checker: ConfigurableOperation;
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    fulfillmentHandlerCode: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    translations: Array<ShippingMethodTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type ShippingMethodFilterParameter = {
    _and?: InputMaybe<Array<ShippingMethodFilterParameter>>;
    _or?: InputMaybe<Array<ShippingMethodFilterParameter>>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    description?: InputMaybe<StringOperators>;
    fulfillmentHandlerCode?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type ShippingMethodList = PaginatedList & {
    items: Array<ShippingMethod>;
    totalItems: Scalars['Int']['output'];
};

export type ShippingMethodListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ShippingMethodFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ShippingMethodSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ShippingMethodQuote = {
    code: Scalars['String']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    /** Any optional metadata returned by the ShippingCalculator in the ShippingCalculationResult */
    metadata: Maybe<Scalars['JSON']['output']>;
    name: Scalars['String']['output'];
    price: Scalars['Money']['output'];
    priceWithTax: Scalars['Money']['output'];
};

export type ShippingMethodSortParameter = {
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    description?: InputMaybe<SortOrder>;
    fulfillmentHandlerCode?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type ShippingMethodTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ShippingMethodTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    description?: InputMaybe<Scalars['String']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
};

/** The price value where the result has a single price */
export type SinglePrice = {
    value: Scalars['Money']['output'];
};

export type SlugForEntityInput = {
    entityId?: InputMaybe<Scalars['ID']['input']>;
    entityName: Scalars['String']['input'];
    fieldName: Scalars['String']['input'];
    inputValue: Scalars['String']['input'];
};

export enum SortOrder {
    Asc = 'ASC',
    Desc = 'DESC',
}

export type StockAdjustment = Node &
    StockMovement & {
        createdAt: Scalars['DateTime']['output'];
        customFields: Maybe<Scalars['JSON']['output']>;
        id: Scalars['ID']['output'];
        productVariant: ProductVariant;
        quantity: Scalars['Int']['output'];
        type: StockMovementType;
        updatedAt: Scalars['DateTime']['output'];
    };

export type StockLevel = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<StockLevelCustomFields>;
    id: Scalars['ID']['output'];
    stockAllocated: Scalars['Int']['output'];
    stockLocation: StockLocation;
    stockLocationId: Scalars['ID']['output'];
    stockOnHand: Scalars['Int']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type StockLevelCustomFields = {
    erpAvailableQuantity: Maybe<Scalars['Int']['output']>;
};

export type StockLevelInput = {
    stockLocationId: Scalars['ID']['input'];
    stockOnHand: Scalars['Int']['input'];
};

export type StockLocation = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<StockLocationCustomFields>;
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type StockLocationCustomFields = {
    warehouseErpId: Maybe<Scalars['String']['output']>;
};

export type StockLocationFilterParameter = {
    _and?: InputMaybe<Array<StockLocationFilterParameter>>;
    _or?: InputMaybe<Array<StockLocationFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    description?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
    warehouseErpId?: InputMaybe<StringOperators>;
};

export type StockLocationList = PaginatedList & {
    items: Array<StockLocation>;
    totalItems: Scalars['Int']['output'];
};

export type StockLocationListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<StockLocationFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<StockLocationSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type StockLocationSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    description?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
    warehouseErpId?: InputMaybe<SortOrder>;
};

export type StockMovement = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    productVariant: ProductVariant;
    quantity: Scalars['Int']['output'];
    type: StockMovementType;
    updatedAt: Scalars['DateTime']['output'];
};

export type StockMovementItem =
    | Allocation
    | Cancellation
    | Release
    | Return
    | Sale
    | StockAdjustment;

export type StockMovementList = {
    items: Array<StockMovementItem>;
    totalItems: Scalars['Int']['output'];
};

export type StockMovementListOptions = {
    skip?: InputMaybe<Scalars['Int']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
    type?: InputMaybe<StockMovementType>;
};

export enum StockMovementType {
    Adjustment = 'ADJUSTMENT',
    Allocation = 'ALLOCATION',
    Cancellation = 'CANCELLATION',
    Release = 'RELEASE',
    Return = 'RETURN',
    Sale = 'SALE',
}

export type StringCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    length: Maybe<Scalars['Int']['output']>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    options: Maybe<Array<StringFieldOption>>;
    pattern: Maybe<Scalars['String']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type StringFieldOption = {
    label: Maybe<Array<LocalizedString>>;
    value: Scalars['String']['output'];
};

/** Operators for filtering on a list of String fields */
export type StringListOperators = {
    inList: Scalars['String']['input'];
};

/** Operators for filtering on a String field */
export type StringOperators = {
    contains?: InputMaybe<Scalars['String']['input']>;
    eq?: InputMaybe<Scalars['String']['input']>;
    in?: InputMaybe<Array<Scalars['String']['input']>>;
    isNull?: InputMaybe<Scalars['Boolean']['input']>;
    notContains?: InputMaybe<Scalars['String']['input']>;
    notEq?: InputMaybe<Scalars['String']['input']>;
    notIn?: InputMaybe<Array<Scalars['String']['input']>>;
    regex?: InputMaybe<Scalars['String']['input']>;
};

export type StringStructFieldConfig = StructField & {
    description: Maybe<Array<LocalizedString>>;
    label: Maybe<Array<LocalizedString>>;
    length: Maybe<Scalars['Int']['output']>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    options: Maybe<Array<StringFieldOption>>;
    pattern: Maybe<Scalars['String']['output']>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type StructCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    fields: Array<StructFieldConfig>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type StructField = {
    description: Maybe<Array<LocalizedString>>;
    label: Maybe<Array<LocalizedString>>;
    list: Maybe<Scalars['Boolean']['output']>;
    name: Scalars['String']['output'];
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type StructFieldConfig =
    | BooleanStructFieldConfig
    | DateTimeStructFieldConfig
    | FloatStructFieldConfig
    | IntStructFieldConfig
    | StringStructFieldConfig
    | TextStructFieldConfig;

export type Subscription = {
    /** Fires for the connected administrator's own notifications, plus every broadcast-to-all-administrators notification this administrator has permission to see. */
    notificationReceived: Notification;
};

/** Indicates that an operation succeeded, where we do not want to return any more specific information. */
export type Success = {
    success: Scalars['Boolean']['output'];
};

export type Surcharge = Node & {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    price: Scalars['Money']['output'];
    priceWithTax: Scalars['Money']['output'];
    sku: Maybe<Scalars['String']['output']>;
    taxLines: Array<TaxLine>;
    taxRate: Scalars['Float']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type SurchargeInput = {
    description: Scalars['String']['input'];
    price: Scalars['Money']['input'];
    priceIncludesTax: Scalars['Boolean']['input'];
    sku?: InputMaybe<Scalars['String']['input']>;
    taxDescription?: InputMaybe<Scalars['String']['input']>;
    taxRate?: InputMaybe<Scalars['Float']['input']>;
};

export type Tag = Node & {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    updatedAt: Scalars['DateTime']['output'];
    value: Scalars['String']['output'];
};

export type TagFilterParameter = {
    _and?: InputMaybe<Array<TagFilterParameter>>;
    _or?: InputMaybe<Array<TagFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    updatedAt?: InputMaybe<DateOperators>;
    value?: InputMaybe<StringOperators>;
};

export type TagList = PaginatedList & {
    items: Array<Tag>;
    totalItems: Scalars['Int']['output'];
};

export type TagListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<TagFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<TagSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type TagSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
    value?: InputMaybe<SortOrder>;
};

export type TaxCategory = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<TaxCategoryCustomFields>;
    id: Scalars['ID']['output'];
    isDefault: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type TaxCategoryCustomFields = {
    erpVatCode: Maybe<Scalars['String']['output']>;
};

export type TaxCategoryFilterParameter = {
    _and?: InputMaybe<Array<TaxCategoryFilterParameter>>;
    _or?: InputMaybe<Array<TaxCategoryFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    erpVatCode?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    isDefault?: InputMaybe<BooleanOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type TaxCategoryList = PaginatedList & {
    items: Array<TaxCategory>;
    totalItems: Scalars['Int']['output'];
};

export type TaxCategoryListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<TaxCategoryFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<TaxCategorySortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type TaxCategorySortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    erpVatCode?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type TaxLine = {
    description: Scalars['String']['output'];
    taxRate: Scalars['Float']['output'];
};

export type TaxRate = Node & {
    category: TaxCategory;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    customerGroup: Maybe<CustomerGroup>;
    enabled: Scalars['Boolean']['output'];
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
    value: Scalars['Float']['output'];
    zone: Zone;
};

export type TaxRateFilterParameter = {
    _and?: InputMaybe<Array<TaxRateFilterParameter>>;
    _or?: InputMaybe<Array<TaxRateFilterParameter>>;
    categoryId?: InputMaybe<IdOperators>;
    createdAt?: InputMaybe<DateOperators>;
    enabled?: InputMaybe<BooleanOperators>;
    id?: InputMaybe<IdOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
    value?: InputMaybe<NumberOperators>;
    zoneId?: InputMaybe<IdOperators>;
};

export type TaxRateList = PaginatedList & {
    items: Array<TaxRate>;
    totalItems: Scalars['Int']['output'];
};

export type TaxRateListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<TaxRateFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<TaxRateSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type TaxRateSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
    value?: InputMaybe<SortOrder>;
};

export type TeamDirectoryMember = {
    branchId: Maybe<Scalars['String']['output']>;
    departmentId: Maybe<Scalars['String']['output']>;
    firstName: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    lastName: Maybe<Scalars['String']['output']>;
    position: Maybe<Scalars['String']['output']>;
    roleCodes: Array<Scalars['String']['output']>;
};

export type TeamMember = {
    emailAddress: Scalars['String']['output'];
    firstName: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    lastName: Scalars['String']['output'];
    roleCodes: Array<Scalars['String']['output']>;
};

export type TestEligibleShippingMethodsInput = {
    lines: Array<TestShippingMethodOrderLineInput>;
    shippingAddress: CreateAddressInput;
};

export type TestShippingMethodInput = {
    calculator: ConfigurableOperationInput;
    checker: ConfigurableOperationInput;
    lines: Array<TestShippingMethodOrderLineInput>;
    shippingAddress: CreateAddressInput;
};

export type TestShippingMethodOrderLineInput = {
    productVariantId: Scalars['ID']['input'];
    quantity: Scalars['Int']['input'];
};

export type TestShippingMethodQuote = {
    metadata: Maybe<Scalars['JSON']['output']>;
    price: Scalars['Money']['output'];
    priceWithTax: Scalars['Money']['output'];
};

export type TestShippingMethodResult = {
    eligible: Scalars['Boolean']['output'];
    quote: Maybe<TestShippingMethodQuote>;
};

export type TextCustomFieldConfig = CustomField & {
    deprecated: Maybe<Scalars['Boolean']['output']>;
    deprecationReason: Maybe<Scalars['String']['output']>;
    description: Maybe<Array<LocalizedString>>;
    internal: Maybe<Scalars['Boolean']['output']>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable: Maybe<Scalars['Boolean']['output']>;
    readonly: Maybe<Scalars['Boolean']['output']>;
    requiresPermission: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type TextStructFieldConfig = StructField & {
    description: Maybe<Array<LocalizedString>>;
    label: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    type: Scalars['String']['output'];
    ui: Maybe<Scalars['JSON']['output']>;
};

export type TradingPoint = {
    address: Scalars['String']['output'];
    contacts: Array<ContactPerson>;
    customerOwned: Scalars['Boolean']['output'];
    customerStatus: Scalars['String']['output'];
    deliveryComment: Maybe<Scalars['String']['output']>;
    erpId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    isActive: Scalars['Boolean']['output'];
    latitude: Maybe<Scalars['Float']['output']>;
    longitude: Maybe<Scalars['Float']['output']>;
    name: Scalars['String']['output'];
    servicingBranchId: Maybe<Scalars['String']['output']>;
    workingHours: Maybe<Scalars['String']['output']>;
};

export type TradingPointDetailsInput = {
    address?: InputMaybe<Scalars['String']['input']>;
    contacts?: InputMaybe<Array<ContactPersonInput>>;
    deliveryComment?: InputMaybe<Scalars['String']['input']>;
    name?: InputMaybe<Scalars['String']['input']>;
    servicingBranchId?: InputMaybe<Scalars['String']['input']>;
    workingHours?: InputMaybe<Scalars['String']['input']>;
};

export type TransitionFulfillmentToStateResult = Fulfillment | FulfillmentStateTransitionError;

export type TransitionOrderToStateResult = Order | OrderStateTransitionError;

export type TransitionPaymentToStateResult = Payment | PaymentStateTransitionError;

export type UpdateActiveAdministratorInput = {
    customFields?: InputMaybe<UpdateAdministratorCustomFieldsInput>;
    emailAddress?: InputMaybe<Scalars['String']['input']>;
    firstName?: InputMaybe<Scalars['String']['input']>;
    lastName?: InputMaybe<Scalars['String']['input']>;
    password?: InputMaybe<Scalars['String']['input']>;
};

/**
 * Input used to update an Address.
 *
 * The countryCode must correspond to a `code` property of a Country that has been defined in the
 * Vendure server. The `code` property is typically a 2-character ISO code such as "GB", "US", "DE" etc.
 * If an invalid code is passed, the mutation will fail.
 */
export type UpdateAddressInput = {
    city?: InputMaybe<Scalars['String']['input']>;
    company?: InputMaybe<Scalars['String']['input']>;
    countryCode?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    defaultBillingAddress?: InputMaybe<Scalars['Boolean']['input']>;
    defaultShippingAddress?: InputMaybe<Scalars['Boolean']['input']>;
    fullName?: InputMaybe<Scalars['String']['input']>;
    id: Scalars['ID']['input'];
    phoneNumber?: InputMaybe<Scalars['String']['input']>;
    postalCode?: InputMaybe<Scalars['String']['input']>;
    province?: InputMaybe<Scalars['String']['input']>;
    streetLine1?: InputMaybe<Scalars['String']['input']>;
    streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAdministratorCustomFieldsInput = {
    branchId?: InputMaybe<Scalars['String']['input']>;
    departmentId?: InputMaybe<Scalars['String']['input']>;
    position?: InputMaybe<Scalars['String']['input']>;
    sourceAdministratorId?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAdministratorInput = {
    customFields?: InputMaybe<UpdateAdministratorCustomFieldsInput>;
    emailAddress?: InputMaybe<Scalars['String']['input']>;
    firstName?: InputMaybe<Scalars['String']['input']>;
    id: Scalars['ID']['input'];
    lastName?: InputMaybe<Scalars['String']['input']>;
    password?: InputMaybe<Scalars['String']['input']>;
    roleIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type UpdateApiKeyInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    /** ID of the ApiKey */
    id: Scalars['ID']['input'];
    /**
     * Which roles to attach to this ApiKey.
     * You may only grant roles which you, yourself have.
     */
    roleIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    translations?: InputMaybe<Array<UpdateApiKeyTranslationInput>>;
};

export type UpdateApiKeyTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    /** A descriptive name so you can remind yourself where the API-Key gets used */
    name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAssetInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    focalPoint?: InputMaybe<CoordinateInput>;
    id: Scalars['ID']['input'];
    name?: InputMaybe<Scalars['String']['input']>;
    tags?: InputMaybe<Array<Scalars['String']['input']>>;
    translations?: InputMaybe<Array<AssetTranslationInput>>;
};

export type UpdateChannelInput = {
    availableCurrencyCodes?: InputMaybe<Array<CurrencyCode>>;
    availableLanguageCodes?: InputMaybe<Array<LanguageCode>>;
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    defaultCurrencyCode?: InputMaybe<CurrencyCode>;
    defaultLanguageCode?: InputMaybe<LanguageCode>;
    defaultShippingZoneId?: InputMaybe<Scalars['ID']['input']>;
    defaultTaxZoneId?: InputMaybe<Scalars['ID']['input']>;
    id: Scalars['ID']['input'];
    outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
    pricesIncludeTax?: InputMaybe<Scalars['Boolean']['input']>;
    sellerId?: InputMaybe<Scalars['ID']['input']>;
    token?: InputMaybe<Scalars['String']['input']>;
    trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateChannelResult = Channel | LanguageNotAvailableError;

export type UpdateCollectionInput = {
    assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
    filters?: InputMaybe<Array<ConfigurableOperationInput>>;
    id: Scalars['ID']['input'];
    inheritFilters?: InputMaybe<Scalars['Boolean']['input']>;
    isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
    parentId?: InputMaybe<Scalars['ID']['input']>;
    translations?: InputMaybe<Array<UpdateCollectionTranslationInput>>;
};

export type UpdateCollectionTranslationInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    description?: InputMaybe<Scalars['String']['input']>;
    id?: InputMaybe<Scalars['ID']['input']>;
    languageCode: LanguageCode;
    name?: InputMaybe<Scalars['String']['input']>;
    slug?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCountryInput = {
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    id: Scalars['ID']['input'];
    translations?: InputMaybe<Array<CountryTranslationInput>>;
};

export type UpdateCustomerCustomFieldsInput = {
    counterpartyId?: InputMaybe<Scalars['String']['input']>;
    portalRole?: InputMaybe<Scalars['String']['input']>;
    preferredTradingPointId?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerGroupInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id: Scalars['ID']['input'];
    name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerInput = {
    customFields?: InputMaybe<UpdateCustomerCustomFieldsInput>;
    emailAddress?: InputMaybe<Scalars['String']['input']>;
    firstName?: InputMaybe<Scalars['String']['input']>;
    id: Scalars['ID']['input'];
    lastName?: InputMaybe<Scalars['String']['input']>;
    phoneNumber?: InputMaybe<Scalars['String']['input']>;
    title?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerNoteInput = {
    note: Scalars['String']['input'];
    noteId: Scalars['ID']['input'];
};

export type UpdateCustomerResult = Customer | EmailAddressConflictError;

export type UpdateFacetInput = {
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id: Scalars['ID']['input'];
    isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
    translations?: InputMaybe<Array<FacetTranslationInput>>;
};

export type UpdateFacetValueInput = {
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id: Scalars['ID']['input'];
    translations?: InputMaybe<Array<FacetValueTranslationInput>>;
};

export type UpdateGlobalSettingsCustomFieldsInput = {
    defaultBranchId?: InputMaybe<Scalars['String']['input']>;
    organizationSplitEnabled?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateGlobalSettingsInput = {
    availableLanguages?: InputMaybe<Array<LanguageCode>>;
    customFields?: InputMaybe<UpdateGlobalSettingsCustomFieldsInput>;
    outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
    trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateGlobalSettingsResult = ChannelDefaultLanguageError | GlobalSettings;

export type UpdateOrderAddressInput = {
    city?: InputMaybe<Scalars['String']['input']>;
    company?: InputMaybe<Scalars['String']['input']>;
    countryCode?: InputMaybe<Scalars['String']['input']>;
    fullName?: InputMaybe<Scalars['String']['input']>;
    phoneNumber?: InputMaybe<Scalars['String']['input']>;
    postalCode?: InputMaybe<Scalars['String']['input']>;
    province?: InputMaybe<Scalars['String']['input']>;
    streetLine1?: InputMaybe<Scalars['String']['input']>;
    streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrderCustomFieldsInput = {
    branchId?: InputMaybe<Scalars['String']['input']>;
    erpOrderId?: InputMaybe<Scalars['String']['input']>;
    erpStatus?: InputMaybe<Scalars['String']['input']>;
    erpStatusAt?: InputMaybe<Scalars['DateTime']['input']>;
    latestFulfillmentState?: InputMaybe<Scalars['String']['input']>;
    paymentStatus?: InputMaybe<Scalars['String']['input']>;
    placedByAdministratorId?: InputMaybe<Scalars['String']['input']>;
    reservationDays?: InputMaybe<Scalars['Int']['input']>;
    reservationState?: InputMaybe<Scalars['String']['input']>;
    sourceOrderId?: InputMaybe<Scalars['String']['input']>;
    tradingPointId?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrderInput = {
    customFields?: InputMaybe<UpdateOrderCustomFieldsInput>;
    id: Scalars['ID']['input'];
};

/** Union type of all possible errors that can occur when adding or removing items from an Order. */
export type UpdateOrderItemErrorResult =
    | InsufficientStockError
    | NegativeQuantityError
    | OrderInterceptorError
    | OrderLimitError
    | OrderModificationError;

export type UpdateOrderItemsResult =
    | InsufficientStockError
    | NegativeQuantityError
    | Order
    | OrderInterceptorError
    | OrderLimitError
    | OrderModificationError;

export type UpdateOrderNoteInput = {
    isPublic?: InputMaybe<Scalars['Boolean']['input']>;
    note?: InputMaybe<Scalars['String']['input']>;
    noteId: Scalars['ID']['input'];
};

export type UpdatePaymentMethodCustomFieldsInput = {
    paymentClassification?: InputMaybe<Scalars['String']['input']>;
    reservationTtlDays?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdatePaymentMethodInput = {
    checker?: InputMaybe<ConfigurableOperationInput>;
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<UpdatePaymentMethodCustomFieldsInput>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    handler?: InputMaybe<ConfigurableOperationInput>;
    id: Scalars['ID']['input'];
    translations?: InputMaybe<Array<PaymentMethodTranslationInput>>;
};

export type UpdateProductCustomFieldsInput = {
    externalId?: InputMaybe<Scalars['String']['input']>;
    fullName?: InputMaybe<Scalars['String']['input']>;
    onSale?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateProductInput = {
    assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    customFields?: InputMaybe<UpdateProductCustomFieldsInput>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
    id: Scalars['ID']['input'];
    translations?: InputMaybe<Array<ProductTranslationInput>>;
};

export type UpdateProductOptionGroupInput = {
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id: Scalars['ID']['input'];
    translations?: InputMaybe<Array<ProductOptionGroupTranslationInput>>;
};

export type UpdateProductOptionInput = {
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id: Scalars['ID']['input'];
    translations?: InputMaybe<Array<ProductOptionGroupTranslationInput>>;
};

export type UpdateProductVariantCustomFieldsInput = {
    multiplicity?: InputMaybe<Scalars['Int']['input']>;
    organizationId?: InputMaybe<Scalars['Int']['input']>;
    organizationPriority?: InputMaybe<Scalars['Int']['input']>;
    organizationSourceEntityId?: InputMaybe<Scalars['String']['input']>;
    weight?: InputMaybe<Scalars['Float']['input']>;
};

export type UpdateProductVariantInput = {
    assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    customFields?: InputMaybe<UpdateProductVariantCustomFieldsInput>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
    id: Scalars['ID']['input'];
    optionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
    /** Sets the price for the ProductVariant in the Channel's default currency */
    price?: InputMaybe<Scalars['Money']['input']>;
    /** Allows multiple prices to be set for the ProductVariant in different currencies. */
    prices?: InputMaybe<Array<UpdateProductVariantPriceInput>>;
    sku?: InputMaybe<Scalars['String']['input']>;
    stockLevels?: InputMaybe<Array<StockLevelInput>>;
    stockOnHand?: InputMaybe<Scalars['Int']['input']>;
    taxCategoryId?: InputMaybe<Scalars['ID']['input']>;
    trackInventory?: InputMaybe<GlobalFlag>;
    translations?: InputMaybe<Array<ProductVariantTranslationInput>>;
    useGlobalOutOfStockThreshold?: InputMaybe<Scalars['Boolean']['input']>;
};

/**
 * Used to set up update the price of a ProductVariant in a particular Channel.
 * If the `delete` flag is `true`, the price will be deleted for the given Channel.
 */
export type UpdateProductVariantPriceInput = {
    currencyCode: CurrencyCode;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    delete?: InputMaybe<Scalars['Boolean']['input']>;
    price: Scalars['Money']['input'];
};

export type UpdatePromotionInput = {
    actions?: InputMaybe<Array<ConfigurableOperationInput>>;
    conditions?: InputMaybe<Array<ConfigurableOperationInput>>;
    couponCode?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    endsAt?: InputMaybe<Scalars['DateTime']['input']>;
    id: Scalars['ID']['input'];
    perCustomerUsageLimit?: InputMaybe<Scalars['Int']['input']>;
    startsAt?: InputMaybe<Scalars['DateTime']['input']>;
    translations?: InputMaybe<Array<PromotionTranslationInput>>;
    usageLimit?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdatePromotionResult = MissingConditionsError | Promotion;

export type UpdateProvinceInput = {
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    id: Scalars['ID']['input'];
    translations?: InputMaybe<Array<ProvinceTranslationInput>>;
};

export type UpdateRoleInput = {
    channelIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    code?: InputMaybe<Scalars['String']['input']>;
    description?: InputMaybe<Scalars['String']['input']>;
    id: Scalars['ID']['input'];
    permissions?: InputMaybe<Array<Permission>>;
};

export type UpdateScheduledTaskInput = {
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    id: Scalars['String']['input'];
};

export type UpdateSellerInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id: Scalars['ID']['input'];
    name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateShippingMethodInput = {
    calculator?: InputMaybe<ConfigurableOperationInput>;
    checker?: InputMaybe<ConfigurableOperationInput>;
    code?: InputMaybe<Scalars['String']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    fulfillmentHandler?: InputMaybe<Scalars['String']['input']>;
    id: Scalars['ID']['input'];
    translations: Array<ShippingMethodTranslationInput>;
};

export type UpdateStockLocationCustomFieldsInput = {
    warehouseErpId?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateStockLocationInput = {
    customFields?: InputMaybe<UpdateStockLocationCustomFieldsInput>;
    description?: InputMaybe<Scalars['String']['input']>;
    id: Scalars['ID']['input'];
    name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTagInput = {
    id: Scalars['ID']['input'];
    value?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTaxCategoryCustomFieldsInput = {
    erpVatCode?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTaxCategoryInput = {
    customFields?: InputMaybe<UpdateTaxCategoryCustomFieldsInput>;
    id: Scalars['ID']['input'];
    isDefault?: InputMaybe<Scalars['Boolean']['input']>;
    name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTaxRateInput = {
    categoryId?: InputMaybe<Scalars['ID']['input']>;
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    customerGroupId?: InputMaybe<Scalars['ID']['input']>;
    enabled?: InputMaybe<Scalars['Boolean']['input']>;
    id: Scalars['ID']['input'];
    name?: InputMaybe<Scalars['String']['input']>;
    value?: InputMaybe<Scalars['Float']['input']>;
    zoneId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateZoneInput = {
    customFields?: InputMaybe<Scalars['JSON']['input']>;
    id: Scalars['ID']['input'];
    name?: InputMaybe<Scalars['String']['input']>;
};

export type User = Node & {
    authenticationMethods: Array<AuthenticationMethod>;
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    identifier: Scalars['String']['output'];
    lastLogin: Maybe<Scalars['DateTime']['output']>;
    roles: Array<Role>;
    updatedAt: Scalars['DateTime']['output'];
    verified: Scalars['Boolean']['output'];
};

export type VariantPriceEntry = {
    price: Scalars['Int']['output'];
    variantId: Scalars['ID']['output'];
};

export type Warehouse = {
    branchId: Maybe<Scalars['String']['output']>;
    erpId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    includedInBranchAtp: Scalars['Boolean']['output'];
    isActive: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
};

export type WorkflowDefinition = {
    displayName: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    requestType: Scalars['String']['output'];
    stepsJson: Scalars['String']['output'];
};

export type WorkflowStepInput = {
    escalatesTo: Array<Scalars['String']['input']>;
    order: Scalars['Int']['input'];
    requiredPermission: Scalars['String']['input'];
    role: Scalars['String']['input'];
};

export type Zone = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    members: Array<Region>;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ZoneFilterParameter = {
    _and?: InputMaybe<Array<ZoneFilterParameter>>;
    _or?: InputMaybe<Array<ZoneFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type ZoneList = PaginatedList & {
    items: Array<Zone>;
    totalItems: Scalars['Int']['output'];
};

export type ZoneListOptions = {
    /** Allows the results to be filtered */
    filter?: InputMaybe<ZoneFilterParameter>;
    /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
    filterOperator?: InputMaybe<LogicalOperator>;
    /** Skips the first n results, for use in pagination */
    skip?: InputMaybe<Scalars['Int']['input']>;
    /** Specifies which properties to sort the results by */
    sort?: InputMaybe<ZoneSortParameter>;
    /** Takes n results, for use in pagination */
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type ZoneSortParameter = {
    createdAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    updatedAt?: InputMaybe<SortOrder>;
};

export type ChangeOwnPasswordMutationVariables = Exact<{
    password: Scalars['String']['input'];
}>;

export type ChangeOwnPasswordMutation = { updateActiveAdministrator: { id: string } };

export type ApprovalStepFieldsFragment = {
    id: string;
    stepIndex: number;
    requiredRole: string;
    approverAdministratorId: string | null;
    wasEscalated: boolean;
    escalatedByAdministratorId: string | null;
    escalatedToAdministratorId: string | null;
    decision: string | null;
    comment: string | null;
    decidedAt: any | null;
};

export type ApprovalRequestSummaryFieldsFragment = {
    id: string;
    requestType: string;
    status: string;
    currentStepIndex: number;
    currentStepRole: string | null;
    stepRoles: Array<string>;
    totalSteps: number;
    requestedByAdministratorId: string | null;
    createdAt: any;
    decidedAt: any | null;
    payload: string;
    steps: Array<{
        id: string;
        stepIndex: number;
        requiredRole: string;
        approverAdministratorId: string | null;
        wasEscalated: boolean;
        escalatedByAdministratorId: string | null;
        escalatedToAdministratorId: string | null;
        decision: string | null;
        comment: string | null;
        decidedAt: any | null;
    }>;
};

export type ApprovalRequestPageFieldsFragment = {
    totalItems: number;
    items: Array<{
        id: string;
        requestType: string;
        status: string;
        currentStepIndex: number;
        currentStepRole: string | null;
        stepRoles: Array<string>;
        totalSteps: number;
        requestedByAdministratorId: string | null;
        createdAt: any;
        decidedAt: any | null;
        payload: string;
        steps: Array<{
            id: string;
            stepIndex: number;
            requiredRole: string;
            approverAdministratorId: string | null;
            wasEscalated: boolean;
            escalatedByAdministratorId: string | null;
            escalatedToAdministratorId: string | null;
            decision: string | null;
            comment: string | null;
            decidedAt: any | null;
        }>;
    }>;
};

export type ApprovalsInboxQueryVariables = Exact<{
    awaitingOptions?: InputMaybe<ApprovalListOptions>;
    allInvolvedOptions?: InputMaybe<ApprovalListOptions>;
}>;

export type ApprovalsInboxQuery = {
    myApprovalsInbox: {
        awaitingMyDecision: {
            totalItems: number;
            items: Array<{
                id: string;
                requestType: string;
                status: string;
                currentStepIndex: number;
                currentStepRole: string | null;
                stepRoles: Array<string>;
                totalSteps: number;
                requestedByAdministratorId: string | null;
                createdAt: any;
                decidedAt: any | null;
                payload: string;
                steps: Array<{
                    id: string;
                    stepIndex: number;
                    requiredRole: string;
                    approverAdministratorId: string | null;
                    wasEscalated: boolean;
                    escalatedByAdministratorId: string | null;
                    escalatedToAdministratorId: string | null;
                    decision: string | null;
                    comment: string | null;
                    decidedAt: any | null;
                }>;
            }>;
        };
        allInvolved: {
            totalItems: number;
            items: Array<{
                id: string;
                requestType: string;
                status: string;
                currentStepIndex: number;
                currentStepRole: string | null;
                stepRoles: Array<string>;
                totalSteps: number;
                requestedByAdministratorId: string | null;
                createdAt: any;
                decidedAt: any | null;
                payload: string;
                steps: Array<{
                    id: string;
                    stepIndex: number;
                    requiredRole: string;
                    approverAdministratorId: string | null;
                    wasEscalated: boolean;
                    escalatedByAdministratorId: string | null;
                    escalatedToAdministratorId: string | null;
                    decision: string | null;
                    comment: string | null;
                    decidedAt: any | null;
                }>;
            }>;
        };
    };
};

export type ApprovalDetailQueryVariables = Exact<{
    id: Scalars['ID']['input'];
}>;

export type ApprovalDetailQuery = {
    approvalRequest: {
        escalatesTo: Array<string>;
        id: string;
        requestType: string;
        status: string;
        currentStepIndex: number;
        currentStepRole: string | null;
        stepRoles: Array<string>;
        totalSteps: number;
        requestedByAdministratorId: string | null;
        createdAt: any;
        decidedAt: any | null;
        payload: string;
        steps: Array<{
            id: string;
            stepIndex: number;
            requiredRole: string;
            approverAdministratorId: string | null;
            wasEscalated: boolean;
            escalatedByAdministratorId: string | null;
            escalatedToAdministratorId: string | null;
            decision: string | null;
            comment: string | null;
            decidedAt: any | null;
        }>;
    } | null;
};

export type DecidePriceAdjustmentRequestMutationVariables = Exact<{
    requestId: Scalars['ID']['input'];
    decision: Scalars['String']['input'];
    comment?: InputMaybe<Scalars['String']['input']>;
}>;

export type DecidePriceAdjustmentRequestMutation = { decidePriceAdjustmentRequest: { id: string } };

export type DecideDiscountGrantRequestMutationVariables = Exact<{
    requestId: Scalars['ID']['input'];
    decision: Scalars['String']['input'];
    comment?: InputMaybe<Scalars['String']['input']>;
}>;

export type DecideDiscountGrantRequestMutation = { decideDiscountGrantRequest: { id: string } };

export type DecideCreditTermRequestMutationVariables = Exact<{
    requestId: Scalars['ID']['input'];
    decision: Scalars['String']['input'];
    comment?: InputMaybe<Scalars['String']['input']>;
}>;

export type DecideCreditTermRequestMutation = { decideCreditTermRequest: { id: string } };

export type ApprovalOrderReferencesQueryVariables = Exact<{
    ids: Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;

export type ApprovalOrderReferencesQuery = {
    visibleOrders: {
        items: Array<{
            id: string;
            code: string;
            customer: { firstName: string; lastName: string } | null;
            lines: Array<{
                id: string;
                quantity: number;
                unitPriceWithTax: any;
                productVariant: { name: string; sku: string };
            }>;
        }>;
    };
};

export type ApprovalCounterpartiesQueryVariables = Exact<{ [key: string]: never }>;

export type ApprovalCounterpartiesQuery = {
    counterparties: { items: Array<{ erpId: string; shortName: string }> };
};

export type EscalateApprovalRequestMutationVariables = Exact<{
    requestId: Scalars['ID']['input'];
    escalateToAdministratorId: Scalars['ID']['input'];
}>;

export type EscalateApprovalRequestMutation = { escalateApprovalRequest: { id: string } };

export type WarehouseFieldsFragment = {
    id: string;
    erpId: string;
    name: string;
    branchId: string | null;
    isActive: boolean;
    includedInBranchAtp: boolean;
};

export type BranchSettingsFieldsFragment = {
    id: string;
    branchId: string;
    defaultPriceTypeId: string;
    visiblePriceTypeIds: Array<string> | null;
    defaultWarehouseId: string;
    visibleWarehouseIds: Array<string> | null;
};

export type WarehousesQueryVariables = Exact<{ [key: string]: never }>;

export type WarehousesQuery = {
    warehouses: Array<{
        id: string;
        erpId: string;
        name: string;
        branchId: string | null;
        isActive: boolean;
        includedInBranchAtp: boolean;
    }>;
};

export type BranchOptionsQueryVariables = Exact<{ [key: string]: never }>;

export type BranchOptionsQuery = { branches: Array<{ id: string; erpId: string; name: string }> };

export type PriceTypeOptionsQueryVariables = Exact<{ [key: string]: never }>;

export type PriceTypeOptionsQuery = {
    priceTypes: Array<{ id: string; code: string; name: string }>;
};

export type UpdateWarehouseBranchAssignmentMutationVariables = Exact<{
    warehouseId: Scalars['ID']['input'];
    branchId: Scalars['String']['input'];
    includedInBranchAtp: Scalars['Boolean']['input'];
}>;

export type UpdateWarehouseBranchAssignmentMutation = {
    updateWarehouseBranchAssignment: {
        id: string;
        erpId: string;
        name: string;
        branchId: string | null;
        isActive: boolean;
        includedInBranchAtp: boolean;
    };
};

export type BranchSettingsForBranchQueryVariables = Exact<{
    branchId: Scalars['String']['input'];
}>;

export type BranchSettingsForBranchQuery = {
    branchSettings: {
        id: string;
        branchId: string;
        defaultPriceTypeId: string;
        visiblePriceTypeIds: Array<string> | null;
        defaultWarehouseId: string;
        visibleWarehouseIds: Array<string> | null;
    } | null;
};

export type SetBranchSettingsMutationVariables = Exact<{
    branchId: Scalars['String']['input'];
    defaultPriceTypeId: Scalars['String']['input'];
    visiblePriceTypeIds?: InputMaybe<
        Array<Scalars['String']['input']> | Scalars['String']['input']
    >;
    defaultWarehouseId: Scalars['String']['input'];
    visibleWarehouseIds?: InputMaybe<
        Array<Scalars['String']['input']> | Scalars['String']['input']
    >;
}>;

export type SetBranchSettingsMutation = {
    setBranchSettings: {
        id: string;
        branchId: string;
        defaultPriceTypeId: string;
        visiblePriceTypeIds: Array<string> | null;
        defaultWarehouseId: string;
        visibleWarehouseIds: Array<string> | null;
    };
};

export type MySessionsQueryVariables = Exact<{ [key: string]: never }>;

export type MySessionsQuery = {
    mySessions: Array<{
        id: string;
        userAgent: string | null;
        deviceLabel: string;
        createdAt: any;
        expires: any;
        current: boolean;
    }>;
};

export type EndSessionMutationVariables = Exact<{
    id: Scalars['ID']['input'];
}>;

export type EndSessionMutation = { endSession: boolean };

export type EndAllSessionsMutationVariables = Exact<{ [key: string]: never }>;

export type EndAllSessionsMutation = { endAllSessions: boolean };

export class TypedDocumentString<TResult, TVariables>
    extends String
    implements DocumentTypeDecoration<TResult, TVariables>
{
    __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
    private value: string;
    public __meta__?: Record<string, any> | undefined;

    constructor(value: string, __meta__?: Record<string, any> | undefined) {
        super(value);
        this.value = value;
        this.__meta__ = __meta__;
    }

    override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
        return this.value;
    }
}
export const ApprovalStepFieldsFragmentDoc = new TypedDocumentString(
    `
    fragment ApprovalStepFields on ApprovalStep {
  id
  stepIndex
  requiredRole
  approverAdministratorId
  wasEscalated
  escalatedByAdministratorId
  escalatedToAdministratorId
  decision
  comment
  decidedAt
}
    `,
    { fragmentName: 'ApprovalStepFields' },
) as unknown as TypedDocumentString<ApprovalStepFieldsFragment, unknown>;
export const ApprovalRequestSummaryFieldsFragmentDoc = new TypedDocumentString(
    `
    fragment ApprovalRequestSummaryFields on ApprovalRequest {
  id
  requestType
  status
  currentStepIndex
  currentStepRole
  stepRoles
  totalSteps
  requestedByAdministratorId
  createdAt
  decidedAt
  payload
  steps {
    ...ApprovalStepFields
  }
}
    fragment ApprovalStepFields on ApprovalStep {
  id
  stepIndex
  requiredRole
  approverAdministratorId
  wasEscalated
  escalatedByAdministratorId
  escalatedToAdministratorId
  decision
  comment
  decidedAt
}`,
    { fragmentName: 'ApprovalRequestSummaryFields' },
) as unknown as TypedDocumentString<ApprovalRequestSummaryFieldsFragment, unknown>;
export const ApprovalRequestPageFieldsFragmentDoc = new TypedDocumentString(
    `
    fragment ApprovalRequestPageFields on ApprovalRequestList {
  items {
    ...ApprovalRequestSummaryFields
  }
  totalItems
}
    fragment ApprovalStepFields on ApprovalStep {
  id
  stepIndex
  requiredRole
  approverAdministratorId
  wasEscalated
  escalatedByAdministratorId
  escalatedToAdministratorId
  decision
  comment
  decidedAt
}
fragment ApprovalRequestSummaryFields on ApprovalRequest {
  id
  requestType
  status
  currentStepIndex
  currentStepRole
  stepRoles
  totalSteps
  requestedByAdministratorId
  createdAt
  decidedAt
  payload
  steps {
    ...ApprovalStepFields
  }
}`,
    { fragmentName: 'ApprovalRequestPageFields' },
) as unknown as TypedDocumentString<ApprovalRequestPageFieldsFragment, unknown>;
export const WarehouseFieldsFragmentDoc = new TypedDocumentString(
    `
    fragment WarehouseFields on Warehouse {
  id
  erpId
  name
  branchId
  isActive
  includedInBranchAtp
}
    `,
    { fragmentName: 'WarehouseFields' },
) as unknown as TypedDocumentString<WarehouseFieldsFragment, unknown>;
export const BranchSettingsFieldsFragmentDoc = new TypedDocumentString(
    `
    fragment BranchSettingsFields on BranchSettings {
  id
  branchId
  defaultPriceTypeId
  visiblePriceTypeIds
  defaultWarehouseId
  visibleWarehouseIds
}
    `,
    { fragmentName: 'BranchSettingsFields' },
) as unknown as TypedDocumentString<BranchSettingsFieldsFragment, unknown>;
export const ChangeOwnPasswordDocument = new TypedDocumentString(`
    mutation ChangeOwnPassword($password: String!) {
  updateActiveAdministrator(input: {password: $password}) {
    id
  }
}
    `) as unknown as TypedDocumentString<
    ChangeOwnPasswordMutation,
    ChangeOwnPasswordMutationVariables
>;
export const ApprovalsInboxDocument = new TypedDocumentString(`
    query ApprovalsInbox($awaitingOptions: ApprovalListOptions, $allInvolvedOptions: ApprovalListOptions) {
  myApprovalsInbox(
    awaitingOptions: $awaitingOptions
    allInvolvedOptions: $allInvolvedOptions
  ) {
    awaitingMyDecision {
      ...ApprovalRequestPageFields
    }
    allInvolved {
      ...ApprovalRequestPageFields
    }
  }
}
    fragment ApprovalStepFields on ApprovalStep {
  id
  stepIndex
  requiredRole
  approverAdministratorId
  wasEscalated
  escalatedByAdministratorId
  escalatedToAdministratorId
  decision
  comment
  decidedAt
}
fragment ApprovalRequestSummaryFields on ApprovalRequest {
  id
  requestType
  status
  currentStepIndex
  currentStepRole
  stepRoles
  totalSteps
  requestedByAdministratorId
  createdAt
  decidedAt
  payload
  steps {
    ...ApprovalStepFields
  }
}
fragment ApprovalRequestPageFields on ApprovalRequestList {
  items {
    ...ApprovalRequestSummaryFields
  }
  totalItems
}`) as unknown as TypedDocumentString<ApprovalsInboxQuery, ApprovalsInboxQueryVariables>;
export const ApprovalDetailDocument = new TypedDocumentString(`
    query ApprovalDetail($id: ID!) {
  approvalRequest(id: $id) {
    ...ApprovalRequestSummaryFields
    escalatesTo
  }
}
    fragment ApprovalStepFields on ApprovalStep {
  id
  stepIndex
  requiredRole
  approverAdministratorId
  wasEscalated
  escalatedByAdministratorId
  escalatedToAdministratorId
  decision
  comment
  decidedAt
}
fragment ApprovalRequestSummaryFields on ApprovalRequest {
  id
  requestType
  status
  currentStepIndex
  currentStepRole
  stepRoles
  totalSteps
  requestedByAdministratorId
  createdAt
  decidedAt
  payload
  steps {
    ...ApprovalStepFields
  }
}`) as unknown as TypedDocumentString<ApprovalDetailQuery, ApprovalDetailQueryVariables>;
export const DecidePriceAdjustmentRequestDocument = new TypedDocumentString(`
    mutation DecidePriceAdjustmentRequest($requestId: ID!, $decision: String!, $comment: String) {
  decidePriceAdjustmentRequest(
    requestId: $requestId
    decision: $decision
    comment: $comment
  ) {
    id
  }
}
    `) as unknown as TypedDocumentString<
    DecidePriceAdjustmentRequestMutation,
    DecidePriceAdjustmentRequestMutationVariables
>;
export const DecideDiscountGrantRequestDocument = new TypedDocumentString(`
    mutation DecideDiscountGrantRequest($requestId: ID!, $decision: String!, $comment: String) {
  decideDiscountGrantRequest(
    requestId: $requestId
    decision: $decision
    comment: $comment
  ) {
    id
  }
}
    `) as unknown as TypedDocumentString<
    DecideDiscountGrantRequestMutation,
    DecideDiscountGrantRequestMutationVariables
>;
export const DecideCreditTermRequestDocument = new TypedDocumentString(`
    mutation DecideCreditTermRequest($requestId: ID!, $decision: String!, $comment: String) {
  decideCreditTermRequest(
    requestId: $requestId
    decision: $decision
    comment: $comment
  ) {
    id
  }
}
    `) as unknown as TypedDocumentString<
    DecideCreditTermRequestMutation,
    DecideCreditTermRequestMutationVariables
>;
export const ApprovalOrderReferencesDocument = new TypedDocumentString(`
    query ApprovalOrderReferences($ids: [String!]!) {
  visibleOrders(options: {take: 200, filter: {id: {in: $ids}}}) {
    items {
      id
      code
      customer {
        firstName
        lastName
      }
      lines {
        id
        quantity
        unitPriceWithTax
        productVariant {
          name
          sku
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<
    ApprovalOrderReferencesQuery,
    ApprovalOrderReferencesQueryVariables
>;
export const ApprovalCounterpartiesDocument = new TypedDocumentString(`
    query ApprovalCounterparties {
  counterparties(options: {take: 500}) {
    items {
      erpId
      shortName
    }
  }
}
    `) as unknown as TypedDocumentString<
    ApprovalCounterpartiesQuery,
    ApprovalCounterpartiesQueryVariables
>;
export const EscalateApprovalRequestDocument = new TypedDocumentString(`
    mutation EscalateApprovalRequest($requestId: ID!, $escalateToAdministratorId: ID!) {
  escalateApprovalRequest(
    requestId: $requestId
    escalateToAdministratorId: $escalateToAdministratorId
  ) {
    id
  }
}
    `) as unknown as TypedDocumentString<
    EscalateApprovalRequestMutation,
    EscalateApprovalRequestMutationVariables
>;
export const WarehousesDocument = new TypedDocumentString(`
    query Warehouses {
  warehouses {
    ...WarehouseFields
  }
}
    fragment WarehouseFields on Warehouse {
  id
  erpId
  name
  branchId
  isActive
  includedInBranchAtp
}`) as unknown as TypedDocumentString<WarehousesQuery, WarehousesQueryVariables>;
export const BranchOptionsDocument = new TypedDocumentString(`
    query BranchOptions {
  branches {
    id
    erpId
    name
  }
}
    `) as unknown as TypedDocumentString<BranchOptionsQuery, BranchOptionsQueryVariables>;
export const PriceTypeOptionsDocument = new TypedDocumentString(`
    query PriceTypeOptions {
  priceTypes {
    id
    code
    name
  }
}
    `) as unknown as TypedDocumentString<PriceTypeOptionsQuery, PriceTypeOptionsQueryVariables>;
export const UpdateWarehouseBranchAssignmentDocument = new TypedDocumentString(`
    mutation UpdateWarehouseBranchAssignment($warehouseId: ID!, $branchId: String!, $includedInBranchAtp: Boolean!) {
  updateWarehouseBranchAssignment(
    warehouseId: $warehouseId
    branchId: $branchId
    includedInBranchAtp: $includedInBranchAtp
  ) {
    ...WarehouseFields
  }
}
    fragment WarehouseFields on Warehouse {
  id
  erpId
  name
  branchId
  isActive
  includedInBranchAtp
}`) as unknown as TypedDocumentString<
    UpdateWarehouseBranchAssignmentMutation,
    UpdateWarehouseBranchAssignmentMutationVariables
>;
export const BranchSettingsForBranchDocument = new TypedDocumentString(`
    query BranchSettingsForBranch($branchId: String!) {
  branchSettings(branchId: $branchId) {
    ...BranchSettingsFields
  }
}
    fragment BranchSettingsFields on BranchSettings {
  id
  branchId
  defaultPriceTypeId
  visiblePriceTypeIds
  defaultWarehouseId
  visibleWarehouseIds
}`) as unknown as TypedDocumentString<
    BranchSettingsForBranchQuery,
    BranchSettingsForBranchQueryVariables
>;
export const SetBranchSettingsDocument = new TypedDocumentString(`
    mutation SetBranchSettings($branchId: String!, $defaultPriceTypeId: String!, $visiblePriceTypeIds: [String!], $defaultWarehouseId: String!, $visibleWarehouseIds: [String!]) {
  setBranchSettings(
    branchId: $branchId
    defaultPriceTypeId: $defaultPriceTypeId
    visiblePriceTypeIds: $visiblePriceTypeIds
    defaultWarehouseId: $defaultWarehouseId
    visibleWarehouseIds: $visibleWarehouseIds
  ) {
    ...BranchSettingsFields
  }
}
    fragment BranchSettingsFields on BranchSettings {
  id
  branchId
  defaultPriceTypeId
  visiblePriceTypeIds
  defaultWarehouseId
  visibleWarehouseIds
}`) as unknown as TypedDocumentString<
    SetBranchSettingsMutation,
    SetBranchSettingsMutationVariables
>;
export const MySessionsDocument = new TypedDocumentString(`
    query MySessions {
  mySessions {
    id
    userAgent
    deviceLabel
    createdAt
    expires
    current
  }
}
    `) as unknown as TypedDocumentString<MySessionsQuery, MySessionsQueryVariables>;
export const EndSessionDocument = new TypedDocumentString(`
    mutation EndSession($id: ID!) {
  endSession(id: $id)
}
    `) as unknown as TypedDocumentString<EndSessionMutation, EndSessionMutationVariables>;
export const EndAllSessionsDocument = new TypedDocumentString(`
    mutation EndAllSessions {
  endAllSessions
}
    `) as unknown as TypedDocumentString<EndAllSessionsMutation, EndAllSessionsMutationVariables>;

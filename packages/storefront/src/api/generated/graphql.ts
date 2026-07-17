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

export type ActiveOrderResult = NoActiveOrderError | Order;

export type AddItemInput = {
    customFields?: InputMaybe<OrderLineCustomFieldsInput>;
    productVariantId: Scalars['ID']['input'];
    quantity: Scalars['Int']['input'];
};

export type AddPaymentToOrderResult =
    | IneligiblePaymentMethodError
    | NoActiveOrderError
    | Order
    | OrderPaymentStateError
    | OrderStateTransitionError
    | PaymentDeclinedError
    | PaymentFailedError;

export type Address = Node & {
    city?: Maybe<Scalars['String']['output']>;
    company?: Maybe<Scalars['String']['output']>;
    country: Country;
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    defaultBillingAddress?: Maybe<Scalars['Boolean']['output']>;
    defaultShippingAddress?: Maybe<Scalars['Boolean']['output']>;
    fullName?: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    phoneNumber?: Maybe<Scalars['String']['output']>;
    postalCode?: Maybe<Scalars['String']['output']>;
    province?: Maybe<Scalars['String']['output']>;
    streetLine1: Scalars['String']['output'];
    streetLine2?: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

export type Adjustment = {
    adjustmentSource: Scalars['String']['output'];
    amount: Scalars['Money']['output'];
    data?: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    type: AdjustmentType;
};

export enum AdjustmentType {
    DistributedOrderPromotion = 'DISTRIBUTED_ORDER_PROMOTION',
    Other = 'OTHER',
    Promotion = 'PROMOTION',
}

/** Returned when attempting to set the Customer for an Order when already logged in. */
export type AlreadyLoggedInError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type ApplyCouponCodeResult =
    | CouponCodeExpiredError
    | CouponCodeInvalidError
    | CouponCodeLimitError
    | Order;

export type Asset = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    fileSize: Scalars['Int']['output'];
    focalPoint?: Maybe<Coordinate>;
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

export type AssetList = PaginatedList & {
    items: Array<Asset>;
    totalItems: Scalars['Int']['output'];
};

export type AssetTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export enum AssetType {
    Binary = 'BINARY',
    Image = 'IMAGE',
    Video = 'VIDEO',
}

export type AuthenticationInput = {
    native?: InputMaybe<NativeAuthInput>;
};

export type AuthenticationMethod = Node & {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    strategy: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type AuthenticationResult = CurrentUser | InvalidCredentialsError | NotVerifiedError;

export type BooleanCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
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
    description?: Maybe<Array<LocalizedString>>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type Channel = Node & {
    availableCurrencyCodes: Array<CurrencyCode>;
    availableLanguageCodes?: Maybe<Array<LanguageCode>>;
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    /** @deprecated Use defaultCurrencyCode instead */
    currencyCode: CurrencyCode;
    customFields?: Maybe<Scalars['JSON']['output']>;
    defaultCurrencyCode: CurrencyCode;
    defaultLanguageCode: LanguageCode;
    defaultShippingZone?: Maybe<Zone>;
    defaultTaxZone?: Maybe<Zone>;
    id: Scalars['ID']['output'];
    /** Not yet used - will be implemented in a future release. */
    outOfStockThreshold?: Maybe<Scalars['Int']['output']>;
    pricesIncludeTax: Scalars['Boolean']['output'];
    seller?: Maybe<Seller>;
    token: Scalars['String']['output'];
    /** Not yet used - will be implemented in a future release. */
    trackInventory?: Maybe<Scalars['Boolean']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

export type Collection = Node & {
    assets: Array<Asset>;
    breadcrumbs: Array<CollectionBreadcrumb>;
    children?: Maybe<Array<Collection>>;
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    featuredAsset?: Maybe<Asset>;
    filters: Array<ConfigurableOperation>;
    id: Scalars['ID']['output'];
    languageCode?: Maybe<LanguageCode>;
    name: Scalars['String']['output'];
    parent?: Maybe<Collection>;
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
    defaultValue?: Maybe<Scalars['JSON']['output']>;
    description?: Maybe<Scalars['String']['output']>;
    label?: Maybe<Scalars['String']['output']>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    required: Scalars['Boolean']['output'];
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
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
    email?: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    isPrimary: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    phone?: Maybe<Scalars['String']['output']>;
};

export type Coordinate = {
    x: Scalars['Float']['output'];
    y: Scalars['Float']['output'];
};

export type Counterparty = {
    creditBalance: Scalars['Int']['output'];
    creditLimit: Scalars['Int']['output'];
    erpId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    inn?: Maybe<Scalars['String']['output']>;
    isActive: Scalars['Boolean']['output'];
    legalName: Scalars['String']['output'];
    paymentDelayDays: Scalars['Int']['output'];
    priceType: Scalars['String']['output'];
    shortName: Scalars['String']['output'];
    tradingPoints: Array<TradingPoint>;
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
        customFields?: Maybe<Scalars['JSON']['output']>;
        enabled: Scalars['Boolean']['output'];
        id: Scalars['ID']['output'];
        languageCode: LanguageCode;
        name: Scalars['String']['output'];
        parent?: Maybe<Region>;
        parentId?: Maybe<Scalars['ID']['output']>;
        translations: Array<RegionTranslation>;
        type: Scalars['String']['output'];
        updatedAt: Scalars['DateTime']['output'];
    };

export type CountryList = PaginatedList & {
    items: Array<Country>;
    totalItems: Scalars['Int']['output'];
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

export type CreateCustomerCustomFieldsInput = {
    counterpartyId?: InputMaybe<Scalars['String']['input']>;
    portalRole?: InputMaybe<Scalars['String']['input']>;
    preferredTradingPointId?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCustomerInput = {
    customFields?: InputMaybe<CreateCustomerCustomFieldsInput>;
    emailAddress: Scalars['String']['input'];
    firstName: Scalars['String']['input'];
    lastName: Scalars['String']['input'];
    phoneNumber?: InputMaybe<Scalars['String']['input']>;
    title?: InputMaybe<Scalars['String']['input']>;
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
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
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

export type CustomProductMappings = {
    fullName?: Maybe<Scalars['String']['output']>;
    oemCodes?: Maybe<Array<Scalars['String']['output']>>;
};

export type Customer = Node & {
    addresses?: Maybe<Array<Address>>;
    counterparty?: Maybe<Counterparty>;
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<CustomerCustomFields>;
    emailAddress: Scalars['String']['output'];
    firstName: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    lastName: Scalars['String']['output'];
    orders: OrderList;
    phoneNumber?: Maybe<Scalars['String']['output']>;
    preferredTradingPoint?: Maybe<TradingPoint>;
    title?: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
    user?: Maybe<User>;
};

export type CustomerOrdersArgs = {
    options?: InputMaybe<OrderListOptions>;
};

export type CustomerCustomFields = {
    counterpartyId?: Maybe<Scalars['String']['output']>;
    portalRole?: Maybe<Scalars['String']['output']>;
    preferredTradingPointId?: Maybe<Scalars['String']['output']>;
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
    preferredTradingPointId?: InputMaybe<StringOperators>;
    title?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
};

export type CustomerGroup = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    customers: CustomerList;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type CustomerGroupCustomersArgs = {
    options?: InputMaybe<CustomerListOptions>;
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
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max?: Maybe<Scalars['String']['output']>;
    min?: Maybe<Scalars['String']['output']>;
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    step?: Maybe<Scalars['Int']['output']>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

/**
 * Expects the same validation formats as the `<input type="datetime-local">` HTML element.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local#Additional_attributes
 */
export type DateTimeStructFieldConfig = StructField & {
    description?: Maybe<Array<LocalizedString>>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max?: Maybe<Scalars['String']['output']>;
    min?: Maybe<Scalars['String']['output']>;
    name: Scalars['String']['output'];
    step?: Maybe<Scalars['Int']['output']>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type DeletionResponse = {
    message?: Maybe<Scalars['String']['output']>;
    result: DeletionResult;
};

export enum DeletionResult {
    /** The entity was successfully deleted */
    Deleted = 'DELETED',
    /** Deletion did not take place, reason given in message */
    NotDeleted = 'NOT_DELETED',
}

export type Discount = {
    adjustmentSource: Scalars['String']['output'];
    amount: Scalars['Money']['output'];
    amountWithTax: Scalars['Money']['output'];
    description: Scalars['String']['output'];
    type: AdjustmentType;
};

export type DiscountTier = {
    minAmount?: Maybe<Scalars['Int']['output']>;
    minWeightKg?: Maybe<Scalars['Float']['output']>;
    percent: Scalars['Int']['output'];
};

export type Dispute = {
    amount: Scalars['Int']['output'];
    id: Scalars['ID']['output'];
    openedAt: Scalars['DateTime']['output'];
    status: Scalars['String']['output'];
    type: Scalars['String']['output'];
};

export type Document = {
    amount?: Maybe<Scalars['Int']['output']>;
    asset?: Maybe<Asset>;
    currencyCode?: Maybe<Scalars['String']['output']>;
    fileUrl?: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    issueDate: Scalars['DateTime']['output'];
    number: Scalars['String']['output'];
    orderId?: Maybe<Scalars['ID']['output']>;
    status: Scalars['String']['output'];
    type: Scalars['String']['output'];
};

export type DocumentList = {
    items: Array<Document>;
    totalItems: Scalars['Int']['output'];
};

export type DocumentListOptions = {
    search?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
    type?: InputMaybe<Scalars['String']['input']>;
};

/** Returned when attempting to create a Customer with an email address already registered to an existing User. */
export type EmailAddressConflictError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export enum ErrorCode {
    AlreadyLoggedInError = 'ALREADY_LOGGED_IN_ERROR',
    CouponCodeExpiredError = 'COUPON_CODE_EXPIRED_ERROR',
    CouponCodeInvalidError = 'COUPON_CODE_INVALID_ERROR',
    CouponCodeLimitError = 'COUPON_CODE_LIMIT_ERROR',
    EmailAddressConflictError = 'EMAIL_ADDRESS_CONFLICT_ERROR',
    GuestCheckoutError = 'GUEST_CHECKOUT_ERROR',
    IdentifierChangeTokenExpiredError = 'IDENTIFIER_CHANGE_TOKEN_EXPIRED_ERROR',
    IdentifierChangeTokenInvalidError = 'IDENTIFIER_CHANGE_TOKEN_INVALID_ERROR',
    IneligiblePaymentMethodError = 'INELIGIBLE_PAYMENT_METHOD_ERROR',
    IneligibleShippingMethodError = 'INELIGIBLE_SHIPPING_METHOD_ERROR',
    InsufficientStockError = 'INSUFFICIENT_STOCK_ERROR',
    InvalidCredentialsError = 'INVALID_CREDENTIALS_ERROR',
    MissingPasswordError = 'MISSING_PASSWORD_ERROR',
    NativeAuthStrategyError = 'NATIVE_AUTH_STRATEGY_ERROR',
    NegativeQuantityError = 'NEGATIVE_QUANTITY_ERROR',
    NotVerifiedError = 'NOT_VERIFIED_ERROR',
    NoActiveOrderError = 'NO_ACTIVE_ORDER_ERROR',
    OrderInterceptorError = 'ORDER_INTERCEPTOR_ERROR',
    OrderLimitError = 'ORDER_LIMIT_ERROR',
    OrderModificationError = 'ORDER_MODIFICATION_ERROR',
    OrderPaymentStateError = 'ORDER_PAYMENT_STATE_ERROR',
    OrderStateTransitionError = 'ORDER_STATE_TRANSITION_ERROR',
    PasswordAlreadySetError = 'PASSWORD_ALREADY_SET_ERROR',
    PasswordResetTokenExpiredError = 'PASSWORD_RESET_TOKEN_EXPIRED_ERROR',
    PasswordResetTokenInvalidError = 'PASSWORD_RESET_TOKEN_INVALID_ERROR',
    PasswordValidationError = 'PASSWORD_VALIDATION_ERROR',
    PaymentDeclinedError = 'PAYMENT_DECLINED_ERROR',
    PaymentFailedError = 'PAYMENT_FAILED_ERROR',
    UnknownError = 'UNKNOWN_ERROR',
    VerificationTokenExpiredError = 'VERIFICATION_TOKEN_EXPIRED_ERROR',
    VerificationTokenInvalidError = 'VERIFICATION_TOKEN_INVALID_ERROR',
}

export type ErrorResult = {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Facet = Node & {
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
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
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
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

export type FacetValue = Node & {
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
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

export type FloatCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max?: Maybe<Scalars['Float']['output']>;
    min?: Maybe<Scalars['Float']['output']>;
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    step?: Maybe<Scalars['Float']['output']>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type FloatStructFieldConfig = StructField & {
    description?: Maybe<Array<LocalizedString>>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max?: Maybe<Scalars['Float']['output']>;
    min?: Maybe<Scalars['Float']['output']>;
    name: Scalars['String']['output'];
    step?: Maybe<Scalars['Float']['output']>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type Fulfillment = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    lines: Array<FulfillmentLine>;
    method: Scalars['String']['output'];
    state: Scalars['String']['output'];
    /** @deprecated Use the `lines` field instead */
    summary: Array<FulfillmentLine>;
    trackingCode?: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

export type FulfillmentLine = {
    fulfillment: Fulfillment;
    fulfillmentId: Scalars['ID']['output'];
    orderLine: OrderLine;
    orderLineId: Scalars['ID']['output'];
    quantity: Scalars['Int']['output'];
};

export enum GlobalFlag {
    False = 'FALSE',
    Inherit = 'INHERIT',
    True = 'TRUE',
}

/** Returned when attempting to set the Customer on a guest checkout when the configured GuestCheckoutStrategy does not allow it. */
export type GuestCheckoutError = ErrorResult & {
    errorCode: ErrorCode;
    errorDetail: Scalars['String']['output'];
    message: Scalars['String']['output'];
};

export type HistoryEntry = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    data: Scalars['JSON']['output'];
    id: Scalars['ID']['output'];
    type: HistoryEntryType;
    updatedAt: Scalars['DateTime']['output'];
};

export type HistoryEntryFilterParameter = {
    _and?: InputMaybe<Array<HistoryEntryFilterParameter>>;
    _or?: InputMaybe<Array<HistoryEntryFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
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

/**
 * Returned if the token used to change a Customer's email address is valid, but has
 * expired according to the `verificationTokenDuration` setting in the AuthOptions.
 */
export type IdentifierChangeTokenExpiredError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/**
 * Returned if the token used to change a Customer's email address is either
 * invalid or does not match any expected tokens.
 */
export type IdentifierChangeTokenInvalidError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned when attempting to add a Payment using a PaymentMethod for which the Order is not eligible. */
export type IneligiblePaymentMethodError = ErrorResult & {
    eligibilityCheckerMessage?: Maybe<Scalars['String']['output']>;
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
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

export type IntCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max?: Maybe<Scalars['Int']['output']>;
    min?: Maybe<Scalars['Int']['output']>;
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    step?: Maybe<Scalars['Int']['output']>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type IntStructFieldConfig = StructField & {
    description?: Maybe<Array<LocalizedString>>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    max?: Maybe<Scalars['Int']['output']>;
    min?: Maybe<Scalars['Int']['output']>;
    name: Scalars['String']['output'];
    step?: Maybe<Scalars['Int']['output']>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

/** Returned if the user authentication credentials are not valid */
export type InvalidCredentialsError = ErrorResult & {
    authenticationError: Scalars['String']['output'];
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type Invoice = {
    amount: Scalars['Int']['output'];
    currencyCode: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    lines: Array<InvoiceLine>;
    order: InvoiceOrder;
    orderId: Scalars['ID']['output'];
    organizationId: Scalars['ID']['output'];
    status: Scalars['String']['output'];
};

export type InvoiceLine = {
    linePriceWithTax: Scalars['Int']['output'];
    productVariant: InvoiceLineProductVariant;
    quantity: Scalars['Int']['output'];
    unitPriceWithTax: Scalars['Int']['output'];
};

export type InvoiceLineProductVariant = {
    name: Scalars['String']['output'];
    sku: Scalars['String']['output'];
};

export type InvoiceList = {
    items: Array<Invoice>;
    totalItems: Scalars['Int']['output'];
};

export type InvoiceListOptions = {
    skip?: InputMaybe<Scalars['Int']['input']>;
    status?: InputMaybe<Scalars['String']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type InvoiceOrder = {
    code: Scalars['String']['output'];
    id: Scalars['ID']['output'];
};

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

export type LocaleStringCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    length?: Maybe<Scalars['Int']['output']>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    pattern?: Maybe<Scalars['String']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type LocaleTextCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type LocalizedString = {
    languageCode: LanguageCode;
    value: Scalars['String']['output'];
};

export enum LogicalOperator {
    And = 'AND',
    Or = 'OR',
}

/** Returned when attempting to register or verify a customer account without a password, when one is required. */
export type MissingPasswordError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type MoneyAmount = {
    amount: Scalars['Int']['output'];
    currencyCode: Scalars['String']['output'];
};

export type Mutation = {
    /** Adds an item to the Order. If custom fields are defined on the OrderLine entity, a third argument 'customFields' will be available. */
    addItemToOrder: UpdateOrderItemsResult;
    /** Adds mutliple items to the Order. Returns a list of errors for each item that failed to add. It will still add successful items. */
    addItemsToOrder: UpdateMultipleOrderItemsResult;
    /** Add a Payment to the Order */
    addPaymentToOrder: AddPaymentToOrderResult;
    /** Adjusts an OrderLine. If custom fields are defined on the OrderLine entity, a third argument 'customFields' of type `OrderLineCustomFieldsInput` will be available. */
    adjustOrderLine: UpdateOrderItemsResult;
    /** Applies the given coupon code to the active Order */
    applyCouponCode: ApplyCouponCodeResult;
    /** Authenticates the user using a named authentication strategy */
    authenticate: AuthenticationResult;
    /** Create a new Customer Address */
    createCustomerAddress: Address;
    customerAddTradingPoint?: Maybe<TradingPoint>;
    customerDeleteTradingPoint: Scalars['Boolean']['output'];
    customerEditTradingPoint?: Maybe<TradingPoint>;
    customerRestoreTradingPoint?: Maybe<TradingPoint>;
    /** Delete an existing Address */
    deleteCustomerAddress: Success;
    endAllSessions: Scalars['Boolean']['output'];
    endOtherSessions: Scalars['Boolean']['output'];
    endSession: Scalars['Boolean']['output'];
    /**
     * Authenticates the user using the native authentication strategy. This mutation is an alias for authenticate({ native: { ... }})
     *
     * The `rememberMe` option applies when using cookie-based sessions, and if `true` it will set the maxAge of the session cookie
     * to 1 year.
     */
    login: NativeAuthenticationResult;
    /** End the current authenticated session */
    logout: Success;
    payInvoice: Invoice;
    /** Regenerate and send a verification token for a new Customer registration. Only applicable if `authOptions.requireVerification` is set to true. */
    refreshCustomerVerification: RefreshCustomerVerificationResult;
    /**
     * Register a Customer account with the given credentials. There are three possible registration flows:
     *
     * _If `authOptions.requireVerification` is set to `true`:_
     *
     * 1. **The Customer is registered _with_ a password**. A verificationToken will be created (and typically emailed to the Customer). That
     *    verificationToken would then be passed to the `verifyCustomerAccount` mutation _without_ a password. The Customer is then
     *    verified and authenticated in one step.
     * 2. **The Customer is registered _without_ a password**. A verificationToken will be created (and typically emailed to the Customer). That
     *    verificationToken would then be passed to the `verifyCustomerAccount` mutation _with_ the chosen password of the Customer. The Customer is then
     *    verified and authenticated in one step.
     *
     * _If `authOptions.requireVerification` is set to `false`:_
     *
     * 3. The Customer _must_ be registered _with_ a password. No further action is needed - the Customer is able to authenticate immediately.
     */
    registerCustomerAccount: RegisterCustomerAccountResult;
    /** Remove all OrderLine from the Order */
    removeAllOrderLines: RemoveOrderItemsResult;
    /** Removes the given coupon code from the active Order */
    removeCouponCode?: Maybe<Order>;
    /** Remove an OrderLine from the Order */
    removeOrderLine: RemoveOrderItemsResult;
    /** Requests a password reset email to be sent */
    requestPasswordReset?: Maybe<RequestPasswordResetResult>;
    /**
     * Request to update the emailAddress of the active Customer. If `authOptions.requireVerification` is enabled
     * (as is the default), then the `identifierChangeToken` will be assigned to the current User and
     * a IdentifierChangeRequestEvent will be raised. This can then be used e.g. by the EmailPlugin to email
     * that verification token to the Customer, which is then used to verify the change of email address.
     */
    requestUpdateCustomerEmailAddress: RequestUpdateCustomerEmailAddressResult;
    /** Resets a Customer's password based on the provided token */
    resetPassword: ResetPasswordResult;
    /** Sets the currency code for the active Order */
    setCurrencyCodeForOrder: UpdateOrderItemsResult;
    /** Set the Customer for the Order. Required only if the Customer is not currently logged in */
    setCustomerForOrder: SetCustomerForOrderResult;
    /** Sets the billing address for the active Order */
    setOrderBillingAddress: ActiveOrderResult;
    /** Allows any custom fields to be set for the active Order */
    setOrderCustomFields: ActiveOrderResult;
    /** Sets the shipping address for the active Order */
    setOrderShippingAddress: ActiveOrderResult;
    /**
     * Sets the shipping method by id, which can be obtained with the `eligibleShippingMethods` query.
     * An Order can have multiple shipping methods, in which case you can pass an array of ids. In this case,
     * you should configure a custom ShippingLineAssignmentStrategy in order to know which OrderLines each
     * shipping method will apply to.
     */
    setOrderShippingMethod: SetOrderShippingMethodResult;
    setPreferredTradingPoint: Scalars['Boolean']['output'];
    /** Transitions an Order to a new state. Valid next states can be found by querying `nextOrderStates` */
    transitionOrderToState?: Maybe<TransitionOrderToStateResult>;
    /** Unsets the billing address for the active Order. Available since version 3.1.0 */
    unsetOrderBillingAddress: ActiveOrderResult;
    /** Unsets the shipping address for the active Order. Available since version 3.1.0 */
    unsetOrderShippingAddress: ActiveOrderResult;
    /** Update an existing Customer */
    updateCustomer: Customer;
    /** Update an existing Address */
    updateCustomerAddress: Address;
    /**
     * Confirm the update of the emailAddress with the provided token, which has been generated by the
     * `requestUpdateCustomerEmailAddress` mutation.
     */
    updateCustomerEmailAddress: UpdateCustomerEmailAddressResult;
    /** Update the password of the active Customer */
    updateCustomerPassword: UpdateCustomerPasswordResult;
    updateTradingPointComment: TradingPoint;
    /**
     * Verify a Customer email address with the token sent to that address. Only applicable if `authOptions.requireVerification` is set to true.
     *
     * If the Customer was not registered with a password in the `registerCustomerAccount` mutation, the password _must_ be
     * provided here.
     */
    verifyCustomerAccount: VerifyCustomerAccountResult;
};

export type MutationAddItemToOrderArgs = {
    customFields?: InputMaybe<OrderLineCustomFieldsInput>;
    productVariantId: Scalars['ID']['input'];
    quantity: Scalars['Int']['input'];
};

export type MutationAddItemsToOrderArgs = {
    inputs: Array<AddItemInput>;
};

export type MutationAddPaymentToOrderArgs = {
    input: PaymentInput;
};

export type MutationAdjustOrderLineArgs = {
    customFields?: InputMaybe<OrderLineCustomFieldsInput>;
    orderLineId: Scalars['ID']['input'];
    quantity: Scalars['Int']['input'];
};

export type MutationApplyCouponCodeArgs = {
    couponCode: Scalars['String']['input'];
};

export type MutationAuthenticateArgs = {
    input: AuthenticationInput;
    rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationCreateCustomerAddressArgs = {
    input: CreateAddressInput;
};

export type MutationCustomerAddTradingPointArgs = {
    address: Scalars['String']['input'];
    contactName?: InputMaybe<Scalars['String']['input']>;
    contactPhone?: InputMaybe<Scalars['String']['input']>;
    deliveryComment?: InputMaybe<Scalars['String']['input']>;
    name: Scalars['String']['input'];
    workingHours?: InputMaybe<Scalars['String']['input']>;
};

export type MutationCustomerDeleteTradingPointArgs = {
    id: Scalars['ID']['input'];
};

export type MutationCustomerEditTradingPointArgs = {
    address: Scalars['String']['input'];
    contactName?: InputMaybe<Scalars['String']['input']>;
    contactPhone?: InputMaybe<Scalars['String']['input']>;
    deliveryComment?: InputMaybe<Scalars['String']['input']>;
    id: Scalars['ID']['input'];
    name: Scalars['String']['input'];
    workingHours?: InputMaybe<Scalars['String']['input']>;
};

export type MutationCustomerRestoreTradingPointArgs = {
    id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerAddressArgs = {
    id: Scalars['ID']['input'];
};

export type MutationEndSessionArgs = {
    id: Scalars['ID']['input'];
};

export type MutationLoginArgs = {
    password: Scalars['String']['input'];
    rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
    username: Scalars['String']['input'];
};

export type MutationPayInvoiceArgs = {
    channel?: InputMaybe<Scalars['String']['input']>;
    invoiceId: Scalars['ID']['input'];
    status: Scalars['String']['input'];
};

export type MutationRefreshCustomerVerificationArgs = {
    emailAddress: Scalars['String']['input'];
};

export type MutationRegisterCustomerAccountArgs = {
    input: RegisterCustomerInput;
};

export type MutationRemoveCouponCodeArgs = {
    couponCode: Scalars['String']['input'];
};

export type MutationRemoveOrderLineArgs = {
    orderLineId: Scalars['ID']['input'];
};

export type MutationRequestPasswordResetArgs = {
    emailAddress: Scalars['String']['input'];
};

export type MutationRequestUpdateCustomerEmailAddressArgs = {
    newEmailAddress: Scalars['String']['input'];
    password: Scalars['String']['input'];
};

export type MutationResetPasswordArgs = {
    password: Scalars['String']['input'];
    token: Scalars['String']['input'];
};

export type MutationSetCurrencyCodeForOrderArgs = {
    currencyCode: CurrencyCode;
};

export type MutationSetCustomerForOrderArgs = {
    input: CreateCustomerInput;
};

export type MutationSetOrderBillingAddressArgs = {
    input: CreateAddressInput;
};

export type MutationSetOrderCustomFieldsArgs = {
    input: UpdateOrderInput;
};

export type MutationSetOrderShippingAddressArgs = {
    input: CreateAddressInput;
};

export type MutationSetOrderShippingMethodArgs = {
    shippingMethodId: Array<Scalars['ID']['input']>;
};

export type MutationSetPreferredTradingPointArgs = {
    tradingPointId: Scalars['ID']['input'];
};

export type MutationTransitionOrderToStateArgs = {
    state: Scalars['String']['input'];
};

export type MutationUpdateCustomerArgs = {
    input: UpdateCustomerInput;
};

export type MutationUpdateCustomerAddressArgs = {
    input: UpdateAddressInput;
};

export type MutationUpdateCustomerEmailAddressArgs = {
    token: Scalars['String']['input'];
};

export type MutationUpdateCustomerPasswordArgs = {
    currentPassword: Scalars['String']['input'];
    newPassword: Scalars['String']['input'];
};

export type MutationUpdateTradingPointCommentArgs = {
    comment?: InputMaybe<Scalars['String']['input']>;
    tradingPointId: Scalars['ID']['input'];
};

export type MutationVerifyCustomerAccountArgs = {
    password?: InputMaybe<Scalars['String']['input']>;
    token: Scalars['String']['input'];
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
    | NativeAuthStrategyError
    | NotVerifiedError;

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

export type Node = {
    id: Scalars['ID']['output'];
};

/**
 * Returned if `authOptions.requireVerification` is set to `true` (which is the default)
 * and an unverified user attempts to authenticate.
 */
export type NotVerifiedError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

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

export type Order = Node & {
    /** An order is active as long as the payment process has not been completed */
    active: Scalars['Boolean']['output'];
    billingAddress?: Maybe<OrderAddress>;
    /** A unique code for the Order */
    code: Scalars['String']['output'];
    /** An array of all coupon codes applied to the Order */
    couponCodes: Array<Scalars['String']['output']>;
    createdAt: Scalars['DateTime']['output'];
    currencyCode: CurrencyCode;
    customFields?: Maybe<OrderCustomFields>;
    customer?: Maybe<Customer>;
    discounts: Array<Discount>;
    fulfillments?: Maybe<Array<Fulfillment>>;
    history: HistoryEntryList;
    id: Scalars['ID']['output'];
    lines: Array<OrderLine>;
    /**
     * The date & time that the Order was placed, i.e. the Customer
     * completed the checkout and the Order is no longer "active"
     */
    orderPlacedAt?: Maybe<Scalars['DateTime']['output']>;
    payments?: Maybe<Array<Payment>>;
    /** Promotions applied to the order. Only gets populated after the payment process has completed. */
    promotions: Array<Promotion>;
    shipping: Scalars['Money']['output'];
    shippingAddress?: Maybe<OrderAddress>;
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
    city?: Maybe<Scalars['String']['output']>;
    company?: Maybe<Scalars['String']['output']>;
    country?: Maybe<Scalars['String']['output']>;
    countryCode?: Maybe<Scalars['String']['output']>;
    customFields?: Maybe<Scalars['JSON']['output']>;
    fullName?: Maybe<Scalars['String']['output']>;
    phoneNumber?: Maybe<Scalars['String']['output']>;
    postalCode?: Maybe<Scalars['String']['output']>;
    province?: Maybe<Scalars['String']['output']>;
    streetLine1?: Maybe<Scalars['String']['output']>;
    streetLine2?: Maybe<Scalars['String']['output']>;
};

export type OrderCustomFields = {
    branchId?: Maybe<Scalars['String']['output']>;
    erpOrderId?: Maybe<Scalars['String']['output']>;
    erpStatus?: Maybe<Scalars['String']['output']>;
    erpStatusAt?: Maybe<Scalars['DateTime']['output']>;
    paymentStatus?: Maybe<Scalars['String']['output']>;
    sourceOrderId?: Maybe<Scalars['String']['output']>;
    tradingPointId?: Maybe<Scalars['String']['output']>;
};

export type OrderFilterParameter = {
    _and?: InputMaybe<Array<OrderFilterParameter>>;
    _or?: InputMaybe<Array<OrderFilterParameter>>;
    active?: InputMaybe<BooleanOperators>;
    branchId?: InputMaybe<StringOperators>;
    code?: InputMaybe<StringOperators>;
    createdAt?: InputMaybe<DateOperators>;
    currencyCode?: InputMaybe<StringOperators>;
    erpOrderId?: InputMaybe<StringOperators>;
    erpStatus?: InputMaybe<StringOperators>;
    erpStatusAt?: InputMaybe<DateOperators>;
    id?: InputMaybe<IdOperators>;
    orderPlacedAt?: InputMaybe<DateOperators>;
    paymentStatus?: InputMaybe<StringOperators>;
    shipping?: InputMaybe<NumberOperators>;
    shippingWithTax?: InputMaybe<NumberOperators>;
    sourceOrderId?: InputMaybe<StringOperators>;
    state?: InputMaybe<StringOperators>;
    subTotal?: InputMaybe<NumberOperators>;
    subTotalWithTax?: InputMaybe<NumberOperators>;
    total?: InputMaybe<NumberOperators>;
    totalQuantity?: InputMaybe<NumberOperators>;
    totalWithTax?: InputMaybe<NumberOperators>;
    tradingPointId?: InputMaybe<StringOperators>;
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
    compareAtPrice?: Maybe<Scalars['Int']['output']>;
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<OrderLineCustomFields>;
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
    featuredAsset?: Maybe<Asset>;
    fulfillmentLines?: Maybe<Array<FulfillmentLine>>;
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
    tierProgress?: Maybe<TierProgress>;
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
    manualPriceReason?: Maybe<Scalars['String']['output']>;
    manualUnitPrice?: Maybe<Scalars['Int']['output']>;
};

export type OrderLineCustomFieldsInput = {
    manualPriceReason?: InputMaybe<Scalars['String']['input']>;
    manualUnitPrice?: InputMaybe<Scalars['Int']['input']>;
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

/** Returned when attempting to modify the contents of an Order that is not in the `AddingItems` state. */
export type OrderModificationError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned when attempting to add a Payment to an Order that is not in the `ArrangingPayment` state. */
export type OrderPaymentStateError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type OrderSortParameter = {
    branchId?: InputMaybe<SortOrder>;
    code?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    erpOrderId?: InputMaybe<SortOrder>;
    erpStatus?: InputMaybe<SortOrder>;
    erpStatusAt?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    orderPlacedAt?: InputMaybe<SortOrder>;
    paymentStatus?: InputMaybe<SortOrder>;
    shipping?: InputMaybe<SortOrder>;
    shippingWithTax?: InputMaybe<SortOrder>;
    sourceOrderId?: InputMaybe<SortOrder>;
    state?: InputMaybe<SortOrder>;
    subTotal?: InputMaybe<SortOrder>;
    subTotalWithTax?: InputMaybe<SortOrder>;
    total?: InputMaybe<SortOrder>;
    totalQuantity?: InputMaybe<SortOrder>;
    totalWithTax?: InputMaybe<SortOrder>;
    tradingPointId?: InputMaybe<SortOrder>;
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

export type PaginatedList = {
    items: Array<Node>;
    totalItems: Scalars['Int']['output'];
};

/** Returned when attempting to verify a customer account with a password, when a password has already been set. */
export type PasswordAlreadySetError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/**
 * Returned if the token used to reset a Customer's password is valid, but has
 * expired according to the `verificationTokenDuration` setting in the AuthOptions.
 */
export type PasswordResetTokenExpiredError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/**
 * Returned if the token used to reset a Customer's password is either
 * invalid or does not match any expected tokens.
 */
export type PasswordResetTokenInvalidError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/** Returned when attempting to register or verify a customer account where the given password fails password validation. */
export type PasswordValidationError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    validationErrorMessage: Scalars['String']['output'];
};

export type Payment = Node & {
    amount: Scalars['Money']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    errorMessage?: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    metadata?: Maybe<Scalars['JSON']['output']>;
    method: Scalars['String']['output'];
    refunds: Array<Refund>;
    state: Scalars['String']['output'];
    transactionId?: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

export type PaymentAllocation = {
    amount: Scalars['Int']['output'];
    invoice?: Maybe<Invoice>;
    isAdvance: Scalars['Boolean']['output'];
};

export type PaymentAttempt = {
    allocations: Array<PaymentAllocation>;
    amount: Scalars['Int']['output'];
    channel: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    currencyCode: Scalars['String']['output'];
    disputes: Array<Dispute>;
    externalReference?: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    invoice?: Maybe<Invoice>;
    invoiceId?: Maybe<Scalars['ID']['output']>;
    order?: Maybe<InvoiceOrder>;
    orderId?: Maybe<Scalars['ID']['output']>;
    processingEvents: Array<PaymentProcessingEvent>;
    refunds: Array<PaymentRefund>;
    status: Scalars['String']['output'];
};

export type PaymentAttemptList = {
    items: Array<PaymentAttempt>;
    totalItems: Scalars['Int']['output'];
};

/** Returned when a Payment is declined by the payment provider. */
export type PaymentDeclinedError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    paymentErrorMessage: Scalars['String']['output'];
};

/** Returned when a Payment fails due to an error. */
export type PaymentFailedError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
    paymentErrorMessage: Scalars['String']['output'];
};

/** Passed as input to the `addPaymentToOrder` mutation. */
export type PaymentInput = {
    /**
     * This field should contain arbitrary data passed to the specified PaymentMethodHandler's `createPayment()` method
     * as the "metadata" argument. For example, it could contain an ID for the payment and other
     * data generated by the payment provider.
     */
    metadata: Scalars['JSON']['input'];
    /** This field should correspond to the `code` property of a PaymentMethod. */
    method: Scalars['String']['input'];
};

export type PaymentListOptions = {
    channel?: InputMaybe<Scalars['String']['input']>;
    skip?: InputMaybe<Scalars['Int']['input']>;
    status?: InputMaybe<Scalars['String']['input']>;
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type PaymentMethod = Node & {
    checker?: Maybe<ConfigurableOperation>;
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    enabled: Scalars['Boolean']['output'];
    handler: ConfigurableOperation;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    translations: Array<PaymentMethodTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type PaymentMethodQuote = {
    code: Scalars['String']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    eligibilityMessage?: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    isEligible: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
};

export type PaymentMethodTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type PaymentProcessingEvent = {
    note?: Maybe<Scalars['String']['output']>;
    occurredAt: Scalars['DateTime']['output'];
    stage: Scalars['String']['output'];
};

export type PaymentRefund = {
    amount: Scalars['Int']['output'];
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    providerRefundId?: Maybe<Scalars['String']['output']>;
    reason: Scalars['String']['output'];
    status: Scalars['String']['output'];
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
    /** Read the generic entity-version audit trail (who changed what, when) — leadership roles only, distinct from the operational edit permissions on the versioned entities themselves */
    ReadEntityHistory = 'ReadEntityHistory',
    /** Grants permission to read Facet */
    ReadFacet = 'ReadFacet',
    /** Read the raw floor-price threshold for a variant (financial data, layer 4 redaction) */
    ReadFloorPrice = 'ReadFloorPrice',
    /** Grants permission to read Order */
    ReadOrder = 'ReadOrder',
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
}

/** The price range where the result has more than one price */
export type PriceRange = {
    max: Scalars['Money']['output'];
    min: Scalars['Money']['output'];
};

export type PriceRangeBucket = {
    count: Scalars['Int']['output'];
    to: Scalars['Int']['output'];
};

export type PriceRangeInput = {
    max: Scalars['Int']['input'];
    min: Scalars['Int']['input'];
};

export type Product = Node & {
    assets: Array<Asset>;
    collections: Array<Collection>;
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<ProductCustomFields>;
    description: Scalars['String']['output'];
    enabled: Scalars['Boolean']['output'];
    facetValues: Array<FacetValue>;
    featuredAsset?: Maybe<Asset>;
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

export type ProductCustomFields = {
    externalId?: Maybe<Scalars['String']['output']>;
    fullName?: Maybe<Scalars['String']['output']>;
    onSale?: Maybe<Scalars['Boolean']['output']>;
};

export type ProductFilterParameter = {
    _and?: InputMaybe<Array<ProductFilterParameter>>;
    _or?: InputMaybe<Array<ProductFilterParameter>>;
    createdAt?: InputMaybe<DateOperators>;
    description?: InputMaybe<StringOperators>;
    enabled?: InputMaybe<BooleanOperators>;
    externalId?: InputMaybe<StringOperators>;
    fullName?: InputMaybe<StringOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    name?: InputMaybe<StringOperators>;
    onSale?: InputMaybe<BooleanOperators>;
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
    customFields?: Maybe<Scalars['JSON']['output']>;
    group: ProductOptionGroup;
    groupId: Scalars['ID']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    translations: Array<ProductOptionTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionGroup = Node & {
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    options: Array<ProductOption>;
    /** The number of products that use this option group */
    productCount: Scalars['Int']['output'];
    translations: Array<ProductOptionGroupTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionGroupTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionTranslation = {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
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

export type ProductTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    slug: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductVariant = Node & {
    assets: Array<Asset>;
    compareAtPrice?: Maybe<Scalars['Int']['output']>;
    createdAt: Scalars['DateTime']['output'];
    currencyCode: CurrencyCode;
    customFields?: Maybe<ProductVariantCustomFields>;
    customerPrice?: Maybe<Scalars['Int']['output']>;
    discountTiers: Array<DiscountTier>;
    facetValues: Array<FacetValue>;
    featuredAsset?: Maybe<Asset>;
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    options: Array<ProductOption>;
    price: Scalars['Money']['output'];
    priceWithTax: Scalars['Money']['output'];
    product: Product;
    productId: Scalars['ID']['output'];
    sku: Scalars['String']['output'];
    stockLevel: Scalars['String']['output'];
    taxCategory: TaxCategory;
    taxRateApplied: TaxRate;
    translations: Array<ProductVariantTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type ProductVariantCustomFields = {
    multiplicity?: Maybe<Scalars['Int']['output']>;
    organizationId?: Maybe<Scalars['Int']['output']>;
    weight?: Maybe<Scalars['Float']['output']>;
};

export type ProductVariantFilterParameter = {
    _and?: InputMaybe<Array<ProductVariantFilterParameter>>;
    _or?: InputMaybe<Array<ProductVariantFilterParameter>>;
    compareAtPrice?: InputMaybe<NumberOperators>;
    createdAt?: InputMaybe<DateOperators>;
    currencyCode?: InputMaybe<StringOperators>;
    customerPrice?: InputMaybe<NumberOperators>;
    id?: InputMaybe<IdOperators>;
    languageCode?: InputMaybe<StringOperators>;
    multiplicity?: InputMaybe<NumberOperators>;
    name?: InputMaybe<StringOperators>;
    organizationId?: InputMaybe<NumberOperators>;
    price?: InputMaybe<NumberOperators>;
    priceWithTax?: InputMaybe<NumberOperators>;
    productId?: InputMaybe<IdOperators>;
    sku?: InputMaybe<StringOperators>;
    stockLevel?: InputMaybe<StringOperators>;
    updatedAt?: InputMaybe<DateOperators>;
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

export type ProductVariantSortParameter = {
    compareAtPrice?: InputMaybe<SortOrder>;
    createdAt?: InputMaybe<SortOrder>;
    customerPrice?: InputMaybe<SortOrder>;
    id?: InputMaybe<SortOrder>;
    multiplicity?: InputMaybe<SortOrder>;
    name?: InputMaybe<SortOrder>;
    organizationId?: InputMaybe<SortOrder>;
    price?: InputMaybe<SortOrder>;
    priceWithTax?: InputMaybe<SortOrder>;
    productId?: InputMaybe<SortOrder>;
    sku?: InputMaybe<SortOrder>;
    stockLevel?: InputMaybe<SortOrder>;
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

export type Promotion = Node & {
    actions: Array<ConfigurableOperation>;
    conditions: Array<ConfigurableOperation>;
    couponCode?: Maybe<Scalars['String']['output']>;
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    enabled: Scalars['Boolean']['output'];
    endsAt?: Maybe<Scalars['DateTime']['output']>;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    perCustomerUsageLimit?: Maybe<Scalars['Int']['output']>;
    startsAt?: Maybe<Scalars['DateTime']['output']>;
    translations: Array<PromotionTranslation>;
    updatedAt: Scalars['DateTime']['output'];
    usageLimit?: Maybe<Scalars['Int']['output']>;
};

export type PromotionList = PaginatedList & {
    items: Array<Promotion>;
    totalItems: Scalars['Int']['output'];
};

export type PromotionTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type Province = Node &
    Region & {
        code: Scalars['String']['output'];
        createdAt: Scalars['DateTime']['output'];
        customFields?: Maybe<Scalars['JSON']['output']>;
        enabled: Scalars['Boolean']['output'];
        id: Scalars['ID']['output'];
        languageCode: LanguageCode;
        name: Scalars['String']['output'];
        parent?: Maybe<Region>;
        parentId?: Maybe<Scalars['ID']['output']>;
        translations: Array<RegionTranslation>;
        type: Scalars['String']['output'];
        updatedAt: Scalars['DateTime']['output'];
    };

export type ProvinceList = PaginatedList & {
    items: Array<Province>;
    totalItems: Scalars['Int']['output'];
};

export type PublicPaymentMethod = {
    code: Scalars['String']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    description?: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    translations: Array<PaymentMethodTranslation>;
};

export type PublicShippingMethod = {
    code: Scalars['String']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    description?: Maybe<Scalars['String']['output']>;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    translations: Array<ShippingMethodTranslation>;
};

export type Query = {
    /** The active Channel */
    activeChannel: Channel;
    /** The active Customer */
    activeCustomer?: Maybe<Customer>;
    /**
     * The active Order. Will be `null` until an Order is created via `addItemToOrder`. Once an Order reaches the
     * state of `PaymentAuthorized` or `PaymentSettled`, then that Order is no longer considered "active" and this
     * query will once again return `null`.
     */
    activeOrder?: Maybe<Order>;
    /** Get active payment methods */
    activePaymentMethods: Array<Maybe<PublicPaymentMethod>>;
    /** Get active shipping methods */
    activeShippingMethods: Array<Maybe<PublicShippingMethod>>;
    /** An array of supported Countries */
    availableCountries: Array<Country>;
    /** Returns a Collection either by its id or slug. If neither 'id' nor 'slug' is specified, an error will result. */
    collection?: Maybe<Collection>;
    /** A list of Collections available to the shop */
    collections: CollectionList;
    /** Returns a list of payment methods and their eligibility based on the current active Order */
    eligiblePaymentMethods: Array<PaymentMethodQuote>;
    /** Returns a list of eligible shipping methods based on the current active Order */
    eligibleShippingMethods: Array<ShippingMethodQuote>;
    /** Returns a Facet by its id */
    facet?: Maybe<Facet>;
    /** A list of Facets available to the shop */
    facets: FacetList;
    invoice?: Maybe<Invoice>;
    /** Returns information about the current authenticated User */
    me?: Maybe<CurrentUser>;
    myAdvanceBalance: Array<MoneyAmount>;
    myDocuments: DocumentList;
    myHiddenTradingPoints: Array<TradingPoint>;
    myInvoices: InvoiceList;
    myOrders: OrderList;
    myPayments: PaymentAttemptList;
    mySessions: Array<SessionSummary>;
    myTradingPoints: Array<TradingPoint>;
    /** Returns the possible next states that the activeOrder can transition to */
    nextOrderStates: Array<Scalars['String']['output']>;
    /**
     * Returns an Order based on the id. Note that in the Shop API, only orders belonging to the
     * currently-authenticated User may be queried.
     */
    order?: Maybe<Order>;
    /**
     * Returns an Order based on the order `code`. For guest Orders (i.e. Orders placed by non-authenticated Customers)
     * this query will only return the Order within 2 hours of the Order being placed. This allows an Order confirmation
     * screen to be shown immediately after completion of a guest checkout, yet prevents security risks of allowing
     * general anonymous access to Order data.
     */
    orderByCode?: Maybe<Order>;
    payment?: Maybe<PaymentAttempt>;
    popularProductIds: Array<Scalars['ID']['output']>;
    /** Get a Product either by id or slug. If neither 'id' nor 'slug' is specified, an error will result. */
    product?: Maybe<Product>;
    /** Get a list of Products */
    products: ProductList;
    /** Search Products based on the criteria set by the `SearchInput` */
    search: SearchResponse;
    tradingPoint?: Maybe<TradingPoint>;
};

export type QueryCollectionArgs = {
    id?: InputMaybe<Scalars['ID']['input']>;
    slug?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCollectionsArgs = {
    options?: InputMaybe<CollectionListOptions>;
};

export type QueryFacetArgs = {
    id: Scalars['ID']['input'];
};

export type QueryFacetsArgs = {
    options?: InputMaybe<FacetListOptions>;
};

export type QueryInvoiceArgs = {
    id: Scalars['ID']['input'];
};

export type QueryMyDocumentsArgs = {
    options?: InputMaybe<DocumentListOptions>;
};

export type QueryMyInvoicesArgs = {
    options?: InputMaybe<InvoiceListOptions>;
};

export type QueryMyOrdersArgs = {
    options?: InputMaybe<OrderListOptions>;
    search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryMyPaymentsArgs = {
    options?: InputMaybe<PaymentListOptions>;
};

export type QueryOrderArgs = {
    id: Scalars['ID']['input'];
};

export type QueryOrderByCodeArgs = {
    code: Scalars['String']['input'];
};

export type QueryPaymentArgs = {
    id: Scalars['ID']['input'];
};

export type QueryPopularProductIdsArgs = {
    take?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryProductArgs = {
    id?: InputMaybe<Scalars['ID']['input']>;
    slug?: InputMaybe<Scalars['String']['input']>;
};

export type QueryProductsArgs = {
    options?: InputMaybe<ProductListOptions>;
};

export type QuerySearchArgs = {
    input: SearchInput;
};

export type QueryTradingPointArgs = {
    id: Scalars['ID']['input'];
};

export type RefreshCustomerVerificationResult = NativeAuthStrategyError | Success;

export type Refund = Node & {
    adjustment: Scalars['Money']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    items: Scalars['Money']['output'];
    lines: Array<RefundLine>;
    metadata?: Maybe<Scalars['JSON']['output']>;
    method?: Maybe<Scalars['String']['output']>;
    paymentId: Scalars['ID']['output'];
    reason?: Maybe<Scalars['String']['output']>;
    shipping: Scalars['Money']['output'];
    state: Scalars['String']['output'];
    total: Scalars['Money']['output'];
    transactionId?: Maybe<Scalars['String']['output']>;
    updatedAt: Scalars['DateTime']['output'];
};

export type RefundLine = {
    orderLine: OrderLine;
    orderLineId: Scalars['ID']['output'];
    quantity: Scalars['Int']['output'];
    refund: Refund;
    refundId: Scalars['ID']['output'];
};

export type Region = {
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    enabled: Scalars['Boolean']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    parent?: Maybe<Region>;
    parentId?: Maybe<Scalars['ID']['output']>;
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

export type RegisterCustomerAccountResult =
    | MissingPasswordError
    | NativeAuthStrategyError
    | PasswordValidationError
    | Success;

export type RegisterCustomerCustomFieldsInput = {
    counterpartyId?: InputMaybe<Scalars['String']['input']>;
    portalRole?: InputMaybe<Scalars['String']['input']>;
    preferredTradingPointId?: InputMaybe<Scalars['String']['input']>;
};

export type RegisterCustomerInput = {
    customFields?: InputMaybe<RegisterCustomerCustomFieldsInput>;
    emailAddress: Scalars['String']['input'];
    firstName?: InputMaybe<Scalars['String']['input']>;
    lastName?: InputMaybe<Scalars['String']['input']>;
    password?: InputMaybe<Scalars['String']['input']>;
    phoneNumber?: InputMaybe<Scalars['String']['input']>;
    title?: InputMaybe<Scalars['String']['input']>;
};

export type RelationCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    entity: Scalars['String']['output'];
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    scalarFields: Array<Scalars['String']['output']>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type RemoveOrderItemsResult = Order | OrderInterceptorError | OrderModificationError;

export type RequestPasswordResetResult = NativeAuthStrategyError | Success;

export type RequestUpdateCustomerEmailAddressResult =
    | EmailAddressConflictError
    | InvalidCredentialsError
    | NativeAuthStrategyError
    | Success;

export type ResetPasswordResult =
    | CurrentUser
    | NativeAuthStrategyError
    | NotVerifiedError
    | PasswordResetTokenExpiredError
    | PasswordResetTokenInvalidError
    | PasswordValidationError;

export type Role = Node & {
    channels: Array<Channel>;
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    permissions: Array<Permission>;
    updatedAt: Scalars['DateTime']['output'];
};

export type RoleList = PaginatedList & {
    items: Array<Role>;
    totalItems: Scalars['Int']['output'];
};

export type SearchInput = {
    collectionId?: InputMaybe<Scalars['ID']['input']>;
    collectionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
    collectionSlug?: InputMaybe<Scalars['String']['input']>;
    collectionSlugs?: InputMaybe<Array<Scalars['String']['input']>>;
    facetValueFilters?: InputMaybe<Array<FacetValueFilterInput>>;
    groupByProduct?: InputMaybe<Scalars['Boolean']['input']>;
    groupBySKU?: InputMaybe<Scalars['Boolean']['input']>;
    inStock?: InputMaybe<Scalars['Boolean']['input']>;
    priceRange?: InputMaybe<PriceRangeInput>;
    priceRangeWithTax?: InputMaybe<PriceRangeInput>;
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
    prices: SearchResponsePriceData;
    totalItems: Scalars['Int']['output'];
};

export type SearchResponsePriceData = {
    buckets: Array<PriceRangeBucket>;
    bucketsWithTax: Array<PriceRangeBucket>;
    range: PriceRange;
    rangeWithTax: PriceRange;
};

export type SearchResult = {
    /** An array of ids of the Collections in which this result appears */
    collectionIds: Array<Scalars['ID']['output']>;
    compareAtPrice?: Maybe<Scalars['Int']['output']>;
    currencyCode: CurrencyCode;
    /** @deprecated Use customProductMappings or customProductVariantMappings */
    customMappings: CustomProductMappings;
    customProductMappings: CustomProductMappings;
    customerPrice?: Maybe<Scalars['Int']['output']>;
    description: Scalars['String']['output'];
    discountTiers: Array<DiscountTier>;
    facetIds: Array<Scalars['ID']['output']>;
    facetValueIds: Array<Scalars['ID']['output']>;
    inStock?: Maybe<Scalars['Boolean']['output']>;
    price: SearchResultPrice;
    priceWithTax: SearchResultPrice;
    productAsset?: Maybe<SearchResultAsset>;
    productId: Scalars['ID']['output'];
    productName: Scalars['String']['output'];
    productVariantAsset?: Maybe<SearchResultAsset>;
    productVariantId: Scalars['ID']['output'];
    productVariantName: Scalars['String']['output'];
    /** A relevance score for the result. Differs between database implementations */
    score: Scalars['Float']['output'];
    sku: Scalars['String']['output'];
    slug: Scalars['String']['output'];
};

export type SearchResultAsset = {
    focalPoint?: Maybe<Coordinate>;
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
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type SessionSummary = {
    createdAt: Scalars['DateTime']['output'];
    current: Scalars['Boolean']['output'];
    deviceLabel: Scalars['String']['output'];
    expires: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    userAgent?: Maybe<Scalars['String']['output']>;
};

export type SetCustomerForOrderResult =
    | AlreadyLoggedInError
    | EmailAddressConflictError
    | GuestCheckoutError
    | NoActiveOrderError
    | Order;

export type SetOrderShippingMethodResult =
    | IneligibleShippingMethodError
    | NoActiveOrderError
    | Order
    | OrderModificationError;

export type ShippingLine = {
    customFields?: Maybe<Scalars['JSON']['output']>;
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
    customFields?: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    fulfillmentHandlerCode: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    translations: Array<ShippingMethodTranslation>;
    updatedAt: Scalars['DateTime']['output'];
};

export type ShippingMethodList = PaginatedList & {
    items: Array<ShippingMethod>;
    totalItems: Scalars['Int']['output'];
};

export type ShippingMethodQuote = {
    code: Scalars['String']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    /** Any optional metadata returned by the ShippingCalculator in the ShippingCalculationResult */
    metadata?: Maybe<Scalars['JSON']['output']>;
    name: Scalars['String']['output'];
    price: Scalars['Money']['output'];
    priceWithTax: Scalars['Money']['output'];
};

export type ShippingMethodTranslation = {
    createdAt: Scalars['DateTime']['output'];
    description: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

/** The price value where the result has a single price */
export type SinglePrice = {
    value: Scalars['Money']['output'];
};

export enum SortOrder {
    Asc = 'ASC',
    Desc = 'DESC',
}

export type StringCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    length?: Maybe<Scalars['Int']['output']>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    options?: Maybe<Array<StringFieldOption>>;
    pattern?: Maybe<Scalars['String']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type StringFieldOption = {
    label?: Maybe<Array<LocalizedString>>;
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
    description?: Maybe<Array<LocalizedString>>;
    label?: Maybe<Array<LocalizedString>>;
    length?: Maybe<Scalars['Int']['output']>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    options?: Maybe<Array<StringFieldOption>>;
    pattern?: Maybe<Scalars['String']['output']>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    fields: Array<StructFieldConfig>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructField = {
    description?: Maybe<Array<LocalizedString>>;
    label?: Maybe<Array<LocalizedString>>;
    list?: Maybe<Scalars['Boolean']['output']>;
    name: Scalars['String']['output'];
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructFieldConfig =
    | BooleanStructFieldConfig
    | DateTimeStructFieldConfig
    | FloatStructFieldConfig
    | IntStructFieldConfig
    | StringStructFieldConfig
    | TextStructFieldConfig;

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
    sku?: Maybe<Scalars['String']['output']>;
    taxLines: Array<TaxLine>;
    taxRate: Scalars['Float']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type Tag = Node & {
    createdAt: Scalars['DateTime']['output'];
    id: Scalars['ID']['output'];
    updatedAt: Scalars['DateTime']['output'];
    value: Scalars['String']['output'];
};

export type TagList = PaginatedList & {
    items: Array<Tag>;
    totalItems: Scalars['Int']['output'];
};

export type TaxCategory = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    isDefault: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type TaxLine = {
    description: Scalars['String']['output'];
    taxRate: Scalars['Float']['output'];
};

export type TaxRate = Node & {
    category: TaxCategory;
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    customerGroup?: Maybe<CustomerGroup>;
    enabled: Scalars['Boolean']['output'];
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
    value: Scalars['Float']['output'];
    zone: Zone;
};

export type TaxRateList = PaginatedList & {
    items: Array<TaxRate>;
    totalItems: Scalars['Int']['output'];
};

export type TextCustomFieldConfig = CustomField & {
    deprecated?: Maybe<Scalars['Boolean']['output']>;
    deprecationReason?: Maybe<Scalars['String']['output']>;
    description?: Maybe<Array<LocalizedString>>;
    internal?: Maybe<Scalars['Boolean']['output']>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    nullable?: Maybe<Scalars['Boolean']['output']>;
    readonly?: Maybe<Scalars['Boolean']['output']>;
    requiresPermission?: Maybe<Array<Permission>>;
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export type TextStructFieldConfig = StructField & {
    description?: Maybe<Array<LocalizedString>>;
    label?: Maybe<Array<LocalizedString>>;
    list: Scalars['Boolean']['output'];
    name: Scalars['String']['output'];
    type: Scalars['String']['output'];
    ui?: Maybe<Scalars['JSON']['output']>;
};

export enum TierMetric {
    Amount = 'AMOUNT',
    Weight = 'WEIGHT',
}

export type TierProgress = {
    current: Scalars['Float']['output'];
    currentPercent?: Maybe<Scalars['Int']['output']>;
    facetName: Scalars['String']['output'];
    metric: TierMetric;
    nextPercent?: Maybe<Scalars['Int']['output']>;
    nextThreshold?: Maybe<Scalars['Float']['output']>;
};

export type TradingPoint = {
    address: Scalars['String']['output'];
    contacts: Array<ContactPerson>;
    customerOwned: Scalars['Boolean']['output'];
    customerStatus: Scalars['String']['output'];
    deliveryComment?: Maybe<Scalars['String']['output']>;
    erpId: Scalars['String']['output'];
    id: Scalars['ID']['output'];
    isActive: Scalars['Boolean']['output'];
    latitude?: Maybe<Scalars['Float']['output']>;
    longitude?: Maybe<Scalars['Float']['output']>;
    name: Scalars['String']['output'];
    servicingBranchId?: Maybe<Scalars['String']['output']>;
    workingHours?: Maybe<Scalars['String']['output']>;
};

export type TransitionOrderToStateResult = Order | OrderStateTransitionError;

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

export type UpdateCustomerCustomFieldsInput = {
    counterpartyId?: InputMaybe<Scalars['String']['input']>;
    portalRole?: InputMaybe<Scalars['String']['input']>;
    preferredTradingPointId?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerEmailAddressResult =
    | IdentifierChangeTokenExpiredError
    | IdentifierChangeTokenInvalidError
    | NativeAuthStrategyError
    | Success;

export type UpdateCustomerInput = {
    customFields?: InputMaybe<UpdateCustomerCustomFieldsInput>;
    firstName?: InputMaybe<Scalars['String']['input']>;
    lastName?: InputMaybe<Scalars['String']['input']>;
    phoneNumber?: InputMaybe<Scalars['String']['input']>;
    title?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerPasswordResult =
    | InvalidCredentialsError
    | NativeAuthStrategyError
    | PasswordValidationError
    | Success;

/**
 * Returned when multiple items are added to an Order.
 * The errorResults array contains the errors that occurred for each item, if any.
 */
export type UpdateMultipleOrderItemsResult = {
    errorResults: Array<UpdateOrderItemErrorResult>;
    order: Order;
};

export type UpdateOrderCustomFieldsInput = {
    branchId?: InputMaybe<Scalars['String']['input']>;
    erpOrderId?: InputMaybe<Scalars['String']['input']>;
    erpStatus?: InputMaybe<Scalars['String']['input']>;
    erpStatusAt?: InputMaybe<Scalars['DateTime']['input']>;
    paymentStatus?: InputMaybe<Scalars['String']['input']>;
    sourceOrderId?: InputMaybe<Scalars['String']['input']>;
    tradingPointId?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrderInput = {
    customFields?: InputMaybe<UpdateOrderCustomFieldsInput>;
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

export type User = Node & {
    authenticationMethods: Array<AuthenticationMethod>;
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    identifier: Scalars['String']['output'];
    lastLogin?: Maybe<Scalars['DateTime']['output']>;
    roles: Array<Role>;
    updatedAt: Scalars['DateTime']['output'];
    verified: Scalars['Boolean']['output'];
};

/**
 * Returned if the verification token (used to verify a Customer's email address) is valid, but has
 * expired according to the `verificationTokenDuration` setting in the AuthOptions.
 */
export type VerificationTokenExpiredError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

/**
 * Returned if the verification token (used to verify a Customer's email address) is either
 * invalid or does not match any expected tokens.
 */
export type VerificationTokenInvalidError = ErrorResult & {
    errorCode: ErrorCode;
    message: Scalars['String']['output'];
};

export type VerifyCustomerAccountResult =
    | CurrentUser
    | MissingPasswordError
    | NativeAuthStrategyError
    | PasswordAlreadySetError
    | PasswordValidationError
    | VerificationTokenExpiredError
    | VerificationTokenInvalidError;

export type Zone = Node & {
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    members: Array<Region>;
    name: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
};

export type MySessionsQueryVariables = Exact<{ [key: string]: never }>;

export type MySessionsQuery = {
    mySessions: Array<{
        id: string;
        userAgent?: string | null;
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

export type CatalogProductsQueryVariables = Exact<{
    term?: InputMaybe<Scalars['String']['input']>;
    take: Scalars['Int']['input'];
    skip: Scalars['Int']['input'];
    facetValueFilters?: InputMaybe<Array<FacetValueFilterInput> | FacetValueFilterInput>;
    inStock?: InputMaybe<Scalars['Boolean']['input']>;
    priceRangeWithTax?: InputMaybe<PriceRangeInput>;
}>;

export type CatalogProductsQuery = {
    search: {
        totalItems: number;
        items: Array<{
            productId: string;
            productVariantId: string;
            productName: string;
            slug: string;
            sku: string;
            currencyCode: CurrencyCode;
            inStock?: boolean | null;
            facetValueIds: Array<string>;
            customerPrice?: number | null;
            compareAtPrice?: number | null;
            priceWithTax: { min: any } | { value: any };
            discountTiers: Array<{
                percent: number;
                minWeightKg?: number | null;
                minAmount?: number | null;
            }>;
        }>;
        facetValues: Array<{
            count: number;
            facetValue: {
                id: string;
                code: string;
                name: string;
                facet: { code: string; name: string };
            };
        }>;
    };
};

export type CatalogFacetsQueryVariables = Exact<{
    term?: InputMaybe<Scalars['String']['input']>;
    inStock?: InputMaybe<Scalars['Boolean']['input']>;
    priceRangeWithTax?: InputMaybe<PriceRangeInput>;
}>;

export type CatalogFacetsQuery = {
    search: {
        facetValues: Array<{
            count: number;
            facetValue: {
                id: string;
                code: string;
                name: string;
                facet: { code: string; name: string };
            };
        }>;
    };
};

export type ProductWidgetFieldsFragment = {
    id: string;
    name: string;
    slug: string;
    variants: Array<{
        id: string;
        sku: string;
        price: any;
        customerPrice?: number | null;
        compareAtPrice?: number | null;
        currencyCode: CurrencyCode;
        stockLevel: string;
        discountTiers: Array<{
            percent: number;
            minWeightKg?: number | null;
            minAmount?: number | null;
        }>;
    }>;
    facetValues: Array<{ id: string; name: string; facet: { code: string; name: string } }>;
};

export type NewArrivalsQueryVariables = Exact<{
    since: Scalars['DateTime']['input'];
}>;

export type NewArrivalsQuery = {
    products: {
        items: Array<{
            id: string;
            name: string;
            slug: string;
            variants: Array<{
                id: string;
                sku: string;
                price: any;
                customerPrice?: number | null;
                compareAtPrice?: number | null;
                currencyCode: CurrencyCode;
                stockLevel: string;
                discountTiers: Array<{
                    percent: number;
                    minWeightKg?: number | null;
                    minAmount?: number | null;
                }>;
            }>;
            facetValues: Array<{ id: string; name: string; facet: { code: string; name: string } }>;
        }>;
    };
};

export type SaleProductsQueryVariables = Exact<{ [key: string]: never }>;

export type SaleProductsQuery = {
    products: {
        items: Array<{
            id: string;
            name: string;
            slug: string;
            variants: Array<{
                id: string;
                sku: string;
                price: any;
                customerPrice?: number | null;
                compareAtPrice?: number | null;
                currencyCode: CurrencyCode;
                stockLevel: string;
                discountTiers: Array<{
                    percent: number;
                    minWeightKg?: number | null;
                    minAmount?: number | null;
                }>;
            }>;
            facetValues: Array<{ id: string; name: string; facet: { code: string; name: string } }>;
        }>;
    };
};

export type PopularProductIdsQueryVariables = Exact<{ [key: string]: never }>;

export type PopularProductIdsQuery = { popularProductIds: Array<string> };

export type PopularProductsQueryVariables = Exact<{
    ids: Array<Scalars['String']['input']> | Scalars['String']['input'];
    take: Scalars['Int']['input'];
}>;

export type PopularProductsQuery = {
    products: {
        items: Array<{
            id: string;
            name: string;
            slug: string;
            variants: Array<{
                id: string;
                sku: string;
                price: any;
                customerPrice?: number | null;
                compareAtPrice?: number | null;
                currencyCode: CurrencyCode;
                stockLevel: string;
                discountTiers: Array<{
                    percent: number;
                    minWeightKg?: number | null;
                    minAmount?: number | null;
                }>;
            }>;
            facetValues: Array<{ id: string; name: string; facet: { code: string; name: string } }>;
        }>;
    };
};

export type ProductDetailQueryVariables = Exact<{
    slug: Scalars['String']['input'];
}>;

export type ProductDetailQuery = {
    product?: {
        id: string;
        name: string;
        slug: string;
        description: string;
        variants: Array<{
            id: string;
            sku: string;
            price: any;
            customerPrice?: number | null;
            compareAtPrice?: number | null;
            currencyCode: CurrencyCode;
            stockLevel: string;
        }>;
        facetValues: Array<{ name: string; facet: { code: string } }>;
    } | null;
};

export type RelatedProductsQueryVariables = Exact<{ [key: string]: never }>;

export type RelatedProductsQuery = {
    products: {
        items: Array<{
            id: string;
            name: string;
            slug: string;
            variants: Array<{ price: any; currencyCode: CurrencyCode; stockLevel: string }>;
            facetValues: Array<{ name: string; facet: { code: string } }>;
        }>;
    };
};

export type MyTradingPointsForDeliverySelectorQueryVariables = Exact<{ [key: string]: never }>;

export type MyTradingPointsForDeliverySelectorQuery = {
    myTradingPoints: Array<{ id: string; name: string; address: string }>;
};

export type SetPreferredTradingPointForDeliverySelectorMutationVariables = Exact<{
    id: Scalars['ID']['input'];
}>;

export type SetPreferredTradingPointForDeliverySelectorMutation = {
    setPreferredTradingPoint: boolean;
};

export type MyDocumentsQueryVariables = Exact<{
    options?: InputMaybe<DocumentListOptions>;
}>;

export type MyDocumentsQuery = {
    myDocuments: {
        totalItems: number;
        items: Array<{
            id: string;
            type: string;
            number: string;
            issueDate: any;
            amount?: number | null;
            currencyCode?: string | null;
            status: string;
            orderId?: string | null;
            fileUrl?: string | null;
            asset?: { source: string } | null;
        }>;
    };
};

export type MyAdvanceBalanceQueryVariables = Exact<{ [key: string]: never }>;

export type MyAdvanceBalanceQuery = {
    myAdvanceBalance: Array<{ amount: number; currencyCode: string }>;
};

export type InvoiceDetailQueryVariables = Exact<{
    id: Scalars['ID']['input'];
}>;

export type InvoiceDetailQuery = {
    invoice?: {
        id: string;
        orderId: string;
        organizationId: string;
        amount: number;
        currencyCode: string;
        status: string;
        order: { id: string; code: string };
        lines: Array<{
            quantity: number;
            unitPriceWithTax: number;
            linePriceWithTax: number;
            productVariant: { name: string; sku: string };
        }>;
    } | null;
};

export type MyInvoicesQueryVariables = Exact<{
    options?: InputMaybe<InvoiceListOptions>;
}>;

export type MyInvoicesQuery = {
    myInvoices: {
        totalItems: number;
        items: Array<{
            id: string;
            orderId: string;
            organizationId: string;
            amount: number;
            currencyCode: string;
            status: string;
            order: { id: string; code: string };
        }>;
    };
};

export type PayInvoiceMutationVariables = Exact<{
    invoiceId: Scalars['ID']['input'];
    status: Scalars['String']['input'];
}>;

export type PayInvoiceMutation = { payInvoice: { id: string; status: string } };

export type MyOrdersQueryVariables = Exact<{
    options?: InputMaybe<OrderListOptions>;
    search?: InputMaybe<Scalars['String']['input']>;
}>;

export type MyOrdersQuery = {
    myOrders: {
        totalItems: number;
        items: Array<{
            id: string;
            code: string;
            state: string;
            createdAt: any;
            totalWithTax: any;
            currencyCode: CurrencyCode;
            lines: Array<{
                id: string;
                quantity: number;
                linePriceWithTax: any;
                productVariant: {
                    id: string;
                    sku: string;
                    name: string;
                    product: { name: string; slug: string };
                };
            }>;
            shippingAddress?: {
                fullName?: string | null;
                streetLine1?: string | null;
                city?: string | null;
            } | null;
            customFields?: {
                erpStatus?: string | null;
                erpOrderId?: string | null;
                erpStatusAt?: any | null;
            } | null;
        }>;
    };
};

export type OrderDetailQueryVariables = Exact<{
    id: Scalars['ID']['input'];
}>;

export type OrderDetailQuery = {
    order?: {
        id: string;
        code: string;
        state: string;
        createdAt: any;
        totalWithTax: any;
        subTotalWithTax: any;
        shippingWithTax: any;
        currencyCode: CurrencyCode;
        lines: Array<{
            id: string;
            quantity: number;
            unitPriceWithTax: any;
            linePriceWithTax: any;
            productVariant: {
                id: string;
                sku: string;
                name: string;
                product: { name: string; slug: string };
            };
        }>;
        shippingAddress?: {
            fullName?: string | null;
            streetLine1?: string | null;
            streetLine2?: string | null;
            city?: string | null;
            postalCode?: string | null;
            country?: string | null;
        } | null;
        customFields?: {
            erpStatus?: string | null;
            erpOrderId?: string | null;
            erpStatusAt?: any | null;
        } | null;
    } | null;
};

export type MyPaymentsQueryVariables = Exact<{
    options?: InputMaybe<PaymentListOptions>;
}>;

export type MyPaymentsQuery = {
    myPayments: {
        totalItems: number;
        items: Array<{
            id: string;
            amount: number;
            currencyCode: string;
            channel: string;
            status: string;
            createdAt: any;
            invoiceId?: string | null;
            order?: { id: string; code: string } | null;
            allocations: Array<{
                amount: number;
                isAdvance: boolean;
                invoice?: { id: string } | null;
            }>;
            refunds: Array<{ amount: number; status: string }>;
        }>;
    };
};

export type PaymentDetailQueryVariables = Exact<{
    id: Scalars['ID']['input'];
}>;

export type PaymentDetailQuery = {
    payment?: {
        id: string;
        amount: number;
        currencyCode: string;
        channel: string;
        status: string;
        createdAt: any;
        invoiceId?: string | null;
        orderId?: string | null;
        externalReference?: string | null;
        refunds: Array<{
            id: string;
            amount: number;
            status: string;
            providerRefundId?: string | null;
            reason: string;
            createdAt: any;
        }>;
        disputes: Array<{
            id: string;
            type: string;
            status: string;
            amount: number;
            openedAt: any;
        }>;
        processingEvents: Array<{ stage: string; occurredAt: any; note?: string | null }>;
        invoice?: { id: string; status: string } | null;
        order?: { id: string; code: string } | null;
        allocations: Array<{
            amount: number;
            isAdvance: boolean;
            invoice?: {
                id: string;
                amount: number;
                currencyCode: string;
                status: string;
                order: { id: string; code: string };
            } | null;
        }>;
    } | null;
};

export type ActiveCustomerForAuthQueryVariables = Exact<{ [key: string]: never }>;

export type ActiveCustomerForAuthQuery = {
    activeCustomer?: {
        id: string;
        firstName: string;
        lastName: string;
        emailAddress: string;
        customFields?: {
            portalRole?: string | null;
            preferredTradingPointId?: string | null;
        } | null;
        counterparty?: {
            id: string;
            erpId: string;
            legalName: string;
            shortName: string;
            inn?: string | null;
            creditLimit: number;
            creditBalance: number;
            paymentDelayDays: number;
            priceType: string;
        } | null;
        preferredTradingPoint?: {
            id: string;
            name: string;
            address: string;
            workingHours?: string | null;
            deliveryComment?: string | null;
        } | null;
    } | null;
};

export type LoginMutationVariables = Exact<{
    username: Scalars['String']['input'];
    password: Scalars['String']['input'];
    rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type LoginMutation = {
    login:
        | { __typename: 'CurrentUser'; id: string }
        | { __typename: 'InvalidCredentialsError'; errorCode: ErrorCode }
        | { __typename: 'NativeAuthStrategyError' }
        | { __typename: 'NotVerifiedError' };
};

export type LogoutFromAuthStoreMutationVariables = Exact<{ [key: string]: never }>;

export type LogoutFromAuthStoreMutation = { logout: { success: boolean } };

export type ActiveOrderQueryVariables = Exact<{ [key: string]: never }>;

export type ActiveOrderQuery = {
    activeOrder?: {
        id: string;
        state: string;
        totalWithTax: any;
        subTotalWithTax: any;
        lines: Array<{
            id: string;
            quantity: number;
            linePrice: any;
            linePriceWithTax: any;
            unitPrice: any;
            compareAtPrice?: number | null;
            tierProgress?: {
                facetName: string;
                metric: TierMetric;
                current: number;
                currentPercent?: number | null;
                nextThreshold?: number | null;
                nextPercent?: number | null;
            } | null;
            productVariant: {
                id: string;
                sku: string;
                name: string;
                price: any;
                currencyCode: CurrencyCode;
                stockLevel: string;
                customFields?: { weight?: number | null } | null;
                product: {
                    id: string;
                    name: string;
                    slug: string;
                    facetValues: Array<{ name: string; facet: { code: string } }>;
                };
            };
        }>;
    } | null;
};

export type AddToCartMutationVariables = Exact<{
    variantId: Scalars['ID']['input'];
    qty: Scalars['Int']['input'];
}>;

export type AddToCartMutation = {
    addItemToOrder:
        | {
              __typename: 'InsufficientStockError';
              errorCode: ErrorCode;
              message: string;
              quantityAvailable: number;
          }
        | { __typename: 'NegativeQuantityError'; errorCode: ErrorCode; message: string }
        | {
              __typename: 'Order';
              id: string;
              totalWithTax: any;
              lines: Array<{
                  id: string;
                  quantity: number;
                  unitPrice: any;
                  compareAtPrice?: number | null;
                  productVariant: {
                      id: string;
                      product: { facetValues: Array<{ name: string; facet: { code: string } }> };
                  };
              }>;
          }
        | { __typename: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderLimitError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type ResumeAddingItemsMutationVariables = Exact<{ [key: string]: never }>;

export type ResumeAddingItemsMutation = {
    transitionOrderToState?:
        | { __typename: 'Order' }
        | { __typename: 'OrderStateTransitionError' }
        | null;
};

export type AdjustCartLineMutationVariables = Exact<{
    lineId: Scalars['ID']['input'];
    qty: Scalars['Int']['input'];
}>;

export type AdjustCartLineMutation = {
    adjustOrderLine:
        | {
              __typename: 'InsufficientStockError';
              errorCode: ErrorCode;
              message: string;
              quantityAvailable: number;
          }
        | { __typename: 'NegativeQuantityError'; errorCode: ErrorCode; message: string }
        | {
              __typename: 'Order';
              id: string;
              totalWithTax: any;
              lines: Array<{ id: string; quantity: number }>;
          }
        | { __typename: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderLimitError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type RemoveCartLineMutationVariables = Exact<{
    lineId: Scalars['ID']['input'];
}>;

export type RemoveCartLineMutation = {
    removeOrderLine:
        | {
              __typename: 'Order';
              id: string;
              totalWithTax: any;
              lines: Array<{ id: string; quantity: number }>;
          }
        | { __typename: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type RemoveAllCartLinesMutationVariables = Exact<{ [key: string]: never }>;

export type RemoveAllCartLinesMutation = {
    removeAllOrderLines:
        | { __typename: 'Order'; id: string; totalWithTax: any }
        | { __typename: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type EligibleShippingMethodsForCheckoutQueryVariables = Exact<{ [key: string]: never }>;

export type EligibleShippingMethodsForCheckoutQuery = {
    eligibleShippingMethods: Array<{ id: string }>;
};

export type SetOrderShippingMethodForCheckoutMutationVariables = Exact<{
    id: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;

export type SetOrderShippingMethodForCheckoutMutation = {
    setOrderShippingMethod:
        | { __typename: 'IneligibleShippingMethodError'; errorCode: ErrorCode; message: string }
        | { __typename: 'NoActiveOrderError'; errorCode: ErrorCode; message: string }
        | { __typename: 'Order' }
        | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type TransitionToArrangingPaymentMutationVariables = Exact<{ [key: string]: never }>;

export type TransitionToArrangingPaymentMutation = {
    transitionOrderToState?:
        | { __typename: 'Order' }
        | { __typename: 'OrderStateTransitionError'; errorCode: ErrorCode; message: string }
        | null;
};

export type CompleteOfflinePaymentMutationVariables = Exact<{ [key: string]: never }>;

export type CompleteOfflinePaymentMutation = {
    addPaymentToOrder:
        | { __typename: 'IneligiblePaymentMethodError'; errorCode: ErrorCode; message: string }
        | { __typename: 'NoActiveOrderError'; errorCode: ErrorCode; message: string }
        | { __typename: 'Order' }
        | { __typename: 'OrderPaymentStateError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderStateTransitionError'; errorCode: ErrorCode; message: string }
        | { __typename: 'PaymentDeclinedError'; errorCode: ErrorCode; message: string }
        | { __typename: 'PaymentFailedError'; errorCode: ErrorCode; message: string };
};

export type CompleteOnlinePaymentMutationVariables = Exact<{
    status: Scalars['JSON']['input'];
}>;

export type CompleteOnlinePaymentMutation = {
    addPaymentToOrder:
        | { __typename: 'IneligiblePaymentMethodError'; errorCode: ErrorCode; message: string }
        | { __typename: 'NoActiveOrderError'; errorCode: ErrorCode; message: string }
        | { __typename: 'Order' }
        | { __typename: 'OrderPaymentStateError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderStateTransitionError'; errorCode: ErrorCode; message: string }
        | { __typename: 'PaymentDeclinedError'; errorCode: ErrorCode; message: string }
        | { __typename: 'PaymentFailedError'; errorCode: ErrorCode; message: string };
};

export type RemoveCartLineInBatchMutationVariables = Exact<{
    lineId: Scalars['ID']['input'];
}>;

export type RemoveCartLineInBatchMutation = {
    removeOrderLine:
        | { __typename: 'Order' }
        | { __typename: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
        | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type CatalogCollectionsQueryVariables = Exact<{ [key: string]: never }>;

export type CatalogCollectionsQuery = {
    collections: {
        items: Array<{
            id: string;
            name: string;
            slug: string;
            breadcrumbs: Array<{ id: string; name: string; slug: string }>;
            children?: Array<{ id: string; name: string; slug: string }> | null;
        }>;
    };
};

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
export const ProductWidgetFieldsFragmentDoc = new TypedDocumentString(
    `
    fragment ProductWidgetFields on Product {
  id
  name
  slug
  variants {
    id
    sku
    price
    customerPrice
    compareAtPrice
    discountTiers {
      percent
      minWeightKg
      minAmount
    }
    currencyCode
    stockLevel
  }
  facetValues {
    id
    name
    facet {
      code
      name
    }
  }
}
    `,
    { fragmentName: 'ProductWidgetFields' },
) as unknown as TypedDocumentString<ProductWidgetFieldsFragment, unknown>;
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
export const CatalogProductsDocument = new TypedDocumentString(`
    query CatalogProducts($term: String, $take: Int!, $skip: Int!, $facetValueFilters: [FacetValueFilterInput!], $inStock: Boolean, $priceRangeWithTax: PriceRangeInput) {
  search(
    input: {term: $term, take: $take, skip: $skip, groupByProduct: true, facetValueFilters: $facetValueFilters, inStock: $inStock, priceRangeWithTax: $priceRangeWithTax}
  ) {
    totalItems
    items {
      productId
      productVariantId
      productName
      slug
      sku
      priceWithTax {
        ... on SinglePrice {
          value
        }
        ... on PriceRange {
          min
        }
      }
      currencyCode
      inStock
      facetValueIds
      customerPrice
      compareAtPrice
      discountTiers {
        percent
        minWeightKg
        minAmount
      }
    }
    facetValues {
      facetValue {
        id
        code
        name
        facet {
          code
          name
        }
      }
      count
    }
  }
}
    `) as unknown as TypedDocumentString<CatalogProductsQuery, CatalogProductsQueryVariables>;
export const CatalogFacetsDocument = new TypedDocumentString(`
    query CatalogFacets($term: String, $inStock: Boolean, $priceRangeWithTax: PriceRangeInput) {
  search(
    input: {term: $term, take: 0, skip: 0, groupByProduct: true, inStock: $inStock, priceRangeWithTax: $priceRangeWithTax}
  ) {
    facetValues {
      facetValue {
        id
        code
        name
        facet {
          code
          name
        }
      }
      count
    }
  }
}
    `) as unknown as TypedDocumentString<CatalogFacetsQuery, CatalogFacetsQueryVariables>;
export const NewArrivalsDocument = new TypedDocumentString(`
    query NewArrivals($since: DateTime!) {
  products(
    options: {take: 12, sort: {createdAt: DESC}, filter: {createdAt: {after: $since}}}
  ) {
    items {
      ...ProductWidgetFields
    }
  }
}
    fragment ProductWidgetFields on Product {
  id
  name
  slug
  variants {
    id
    sku
    price
    customerPrice
    compareAtPrice
    discountTiers {
      percent
      minWeightKg
      minAmount
    }
    currencyCode
    stockLevel
  }
  facetValues {
    id
    name
    facet {
      code
      name
    }
  }
}`) as unknown as TypedDocumentString<NewArrivalsQuery, NewArrivalsQueryVariables>;
export const SaleProductsDocument = new TypedDocumentString(`
    query SaleProducts {
  products(options: {take: 40, filter: {onSale: {eq: true}}}) {
    items {
      ...ProductWidgetFields
    }
  }
}
    fragment ProductWidgetFields on Product {
  id
  name
  slug
  variants {
    id
    sku
    price
    customerPrice
    compareAtPrice
    discountTiers {
      percent
      minWeightKg
      minAmount
    }
    currencyCode
    stockLevel
  }
  facetValues {
    id
    name
    facet {
      code
      name
    }
  }
}`) as unknown as TypedDocumentString<SaleProductsQuery, SaleProductsQueryVariables>;
export const PopularProductIdsDocument = new TypedDocumentString(`
    query PopularProductIds {
  popularProductIds(take: 12)
}
    `) as unknown as TypedDocumentString<PopularProductIdsQuery, PopularProductIdsQueryVariables>;
export const PopularProductsDocument = new TypedDocumentString(`
    query PopularProducts($ids: [String!]!, $take: Int!) {
  products(options: {take: $take, filter: {id: {in: $ids}}}) {
    items {
      ...ProductWidgetFields
    }
  }
}
    fragment ProductWidgetFields on Product {
  id
  name
  slug
  variants {
    id
    sku
    price
    customerPrice
    compareAtPrice
    discountTiers {
      percent
      minWeightKg
      minAmount
    }
    currencyCode
    stockLevel
  }
  facetValues {
    id
    name
    facet {
      code
      name
    }
  }
}`) as unknown as TypedDocumentString<PopularProductsQuery, PopularProductsQueryVariables>;
export const ProductDetailDocument = new TypedDocumentString(`
    query ProductDetail($slug: String!) {
  product(slug: $slug) {
    id
    name
    slug
    description
    variants {
      id
      sku
      price
      customerPrice
      compareAtPrice
      currencyCode
      stockLevel
    }
    facetValues {
      name
      facet {
        code
      }
    }
  }
}
    `) as unknown as TypedDocumentString<ProductDetailQuery, ProductDetailQueryVariables>;
export const RelatedProductsDocument = new TypedDocumentString(`
    query RelatedProducts {
  products(options: {take: 5}) {
    items {
      id
      name
      slug
      variants {
        price
        currencyCode
        stockLevel
      }
      facetValues {
        name
        facet {
          code
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<RelatedProductsQuery, RelatedProductsQueryVariables>;
export const MyTradingPointsForDeliverySelectorDocument = new TypedDocumentString(`
    query MyTradingPointsForDeliverySelector {
  myTradingPoints {
    id
    name
    address
  }
}
    `) as unknown as TypedDocumentString<
    MyTradingPointsForDeliverySelectorQuery,
    MyTradingPointsForDeliverySelectorQueryVariables
>;
export const SetPreferredTradingPointForDeliverySelectorDocument = new TypedDocumentString(`
    mutation SetPreferredTradingPointForDeliverySelector($id: ID!) {
  setPreferredTradingPoint(tradingPointId: $id)
}
    `) as unknown as TypedDocumentString<
    SetPreferredTradingPointForDeliverySelectorMutation,
    SetPreferredTradingPointForDeliverySelectorMutationVariables
>;
export const MyDocumentsDocument = new TypedDocumentString(`
    query MyDocuments($options: DocumentListOptions) {
  myDocuments(options: $options) {
    items {
      id
      type
      number
      issueDate
      amount
      currencyCode
      status
      orderId
      fileUrl
      asset {
        source
      }
    }
    totalItems
  }
}
    `) as unknown as TypedDocumentString<MyDocumentsQuery, MyDocumentsQueryVariables>;
export const MyAdvanceBalanceDocument = new TypedDocumentString(`
    query MyAdvanceBalance {
  myAdvanceBalance {
    amount
    currencyCode
  }
}
    `) as unknown as TypedDocumentString<MyAdvanceBalanceQuery, MyAdvanceBalanceQueryVariables>;
export const InvoiceDetailDocument = new TypedDocumentString(`
    query InvoiceDetail($id: ID!) {
  invoice(id: $id) {
    id
    orderId
    organizationId
    amount
    currencyCode
    status
    order {
      id
      code
    }
    lines {
      quantity
      unitPriceWithTax
      linePriceWithTax
      productVariant {
        name
        sku
      }
    }
  }
}
    `) as unknown as TypedDocumentString<InvoiceDetailQuery, InvoiceDetailQueryVariables>;
export const MyInvoicesDocument = new TypedDocumentString(`
    query MyInvoices($options: InvoiceListOptions) {
  myInvoices(options: $options) {
    items {
      id
      orderId
      organizationId
      amount
      currencyCode
      status
      order {
        id
        code
      }
    }
    totalItems
  }
}
    `) as unknown as TypedDocumentString<MyInvoicesQuery, MyInvoicesQueryVariables>;
export const PayInvoiceDocument = new TypedDocumentString(`
    mutation PayInvoice($invoiceId: ID!, $status: String!) {
  payInvoice(invoiceId: $invoiceId, status: $status) {
    id
    status
  }
}
    `) as unknown as TypedDocumentString<PayInvoiceMutation, PayInvoiceMutationVariables>;
export const MyOrdersDocument = new TypedDocumentString(`
    query MyOrders($options: OrderListOptions, $search: String) {
  myOrders(options: $options, search: $search) {
    items {
      id
      code
      state
      createdAt
      totalWithTax
      currencyCode
      lines {
        id
        quantity
        linePriceWithTax
        productVariant {
          id
          sku
          name
          product {
            name
            slug
          }
        }
      }
      shippingAddress {
        fullName
        streetLine1
        city
      }
      customFields {
        erpStatus
        erpOrderId
        erpStatusAt
      }
    }
    totalItems
  }
}
    `) as unknown as TypedDocumentString<MyOrdersQuery, MyOrdersQueryVariables>;
export const OrderDetailDocument = new TypedDocumentString(`
    query OrderDetail($id: ID!) {
  order(id: $id) {
    id
    code
    state
    createdAt
    totalWithTax
    subTotalWithTax
    shippingWithTax
    currencyCode
    lines {
      id
      quantity
      unitPriceWithTax
      linePriceWithTax
      productVariant {
        id
        sku
        name
        product {
          name
          slug
        }
      }
    }
    shippingAddress {
      fullName
      streetLine1
      streetLine2
      city
      postalCode
      country
    }
    customFields {
      erpStatus
      erpOrderId
      erpStatusAt
    }
  }
}
    `) as unknown as TypedDocumentString<OrderDetailQuery, OrderDetailQueryVariables>;
export const MyPaymentsDocument = new TypedDocumentString(`
    query MyPayments($options: PaymentListOptions) {
  myPayments(options: $options) {
    items {
      id
      amount
      currencyCode
      channel
      status
      createdAt
      invoiceId
      order {
        id
        code
      }
      allocations {
        amount
        isAdvance
        invoice {
          id
        }
      }
      refunds {
        amount
        status
      }
    }
    totalItems
  }
}
    `) as unknown as TypedDocumentString<MyPaymentsQuery, MyPaymentsQueryVariables>;
export const PaymentDetailDocument = new TypedDocumentString(`
    query PaymentDetail($id: ID!) {
  payment(id: $id) {
    id
    amount
    currencyCode
    channel
    status
    createdAt
    invoiceId
    orderId
    externalReference
    refunds {
      id
      amount
      status
      providerRefundId
      reason
      createdAt
    }
    disputes {
      id
      type
      status
      amount
      openedAt
    }
    processingEvents {
      stage
      occurredAt
      note
    }
    invoice {
      id
      status
    }
    order {
      id
      code
    }
    allocations {
      amount
      isAdvance
      invoice {
        id
        amount
        currencyCode
        status
        order {
          id
          code
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<PaymentDetailQuery, PaymentDetailQueryVariables>;
export const ActiveCustomerForAuthDocument = new TypedDocumentString(`
    query ActiveCustomerForAuth {
  activeCustomer {
    id
    firstName
    lastName
    emailAddress
    customFields {
      portalRole
      preferredTradingPointId
    }
    counterparty {
      id
      erpId
      legalName
      shortName
      inn
      creditLimit
      creditBalance
      paymentDelayDays
      priceType
    }
    preferredTradingPoint {
      id
      name
      address
      workingHours
      deliveryComment
    }
  }
}
    `) as unknown as TypedDocumentString<
    ActiveCustomerForAuthQuery,
    ActiveCustomerForAuthQueryVariables
>;
export const LoginDocument = new TypedDocumentString(`
    mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {
  login(username: $username, password: $password, rememberMe: $rememberMe) {
    __typename
    ... on CurrentUser {
      id
    }
    ... on InvalidCredentialsError {
      errorCode
    }
  }
}
    `) as unknown as TypedDocumentString<LoginMutation, LoginMutationVariables>;
export const LogoutFromAuthStoreDocument = new TypedDocumentString(`
    mutation LogoutFromAuthStore {
  logout {
    success
  }
}
    `) as unknown as TypedDocumentString<
    LogoutFromAuthStoreMutation,
    LogoutFromAuthStoreMutationVariables
>;
export const ActiveOrderDocument = new TypedDocumentString(`
    query ActiveOrder {
  activeOrder {
    id
    state
    totalWithTax
    subTotalWithTax
    lines {
      id
      quantity
      linePrice
      linePriceWithTax
      unitPrice
      compareAtPrice
      tierProgress {
        facetName
        metric
        current
        currentPercent
        nextThreshold
        nextPercent
      }
      productVariant {
        id
        sku
        name
        price
        currencyCode
        stockLevel
        customFields {
          weight
        }
        product {
          id
          name
          slug
          facetValues {
            name
            facet {
              code
            }
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<ActiveOrderQuery, ActiveOrderQueryVariables>;
export const AddToCartDocument = new TypedDocumentString(`
    mutation AddToCart($variantId: ID!, $qty: Int!) {
  addItemToOrder(productVariantId: $variantId, quantity: $qty) {
    __typename
    ... on Order {
      id
      totalWithTax
      lines {
        id
        quantity
        unitPrice
        compareAtPrice
        productVariant {
          id
          product {
            facetValues {
              name
              facet {
                code
              }
            }
          }
        }
      }
    }
    ... on InsufficientStockError {
      errorCode
      message
      quantityAvailable
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<AddToCartMutation, AddToCartMutationVariables>;
export const ResumeAddingItemsDocument = new TypedDocumentString(`
    mutation ResumeAddingItems {
  transitionOrderToState(state: "AddingItems") {
    __typename
  }
}
    `) as unknown as TypedDocumentString<
    ResumeAddingItemsMutation,
    ResumeAddingItemsMutationVariables
>;
export const AdjustCartLineDocument = new TypedDocumentString(`
    mutation AdjustCartLine($lineId: ID!, $qty: Int!) {
  adjustOrderLine(orderLineId: $lineId, quantity: $qty) {
    __typename
    ... on Order {
      id
      totalWithTax
      lines {
        id
        quantity
      }
    }
    ... on InsufficientStockError {
      errorCode
      message
      quantityAvailable
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<AdjustCartLineMutation, AdjustCartLineMutationVariables>;
export const RemoveCartLineDocument = new TypedDocumentString(`
    mutation RemoveCartLine($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) {
    __typename
    ... on Order {
      id
      totalWithTax
      lines {
        id
        quantity
      }
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<RemoveCartLineMutation, RemoveCartLineMutationVariables>;
export const RemoveAllCartLinesDocument = new TypedDocumentString(`
    mutation RemoveAllCartLines {
  removeAllOrderLines {
    __typename
    ... on Order {
      id
      totalWithTax
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<
    RemoveAllCartLinesMutation,
    RemoveAllCartLinesMutationVariables
>;
export const EligibleShippingMethodsForCheckoutDocument = new TypedDocumentString(`
    query EligibleShippingMethodsForCheckout {
  eligibleShippingMethods {
    id
  }
}
    `) as unknown as TypedDocumentString<
    EligibleShippingMethodsForCheckoutQuery,
    EligibleShippingMethodsForCheckoutQueryVariables
>;
export const SetOrderShippingMethodForCheckoutDocument = new TypedDocumentString(`
    mutation SetOrderShippingMethodForCheckout($id: [ID!]!) {
  setOrderShippingMethod(shippingMethodId: $id) {
    __typename
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<
    SetOrderShippingMethodForCheckoutMutation,
    SetOrderShippingMethodForCheckoutMutationVariables
>;
export const TransitionToArrangingPaymentDocument = new TypedDocumentString(`
    mutation TransitionToArrangingPayment {
  transitionOrderToState(state: "ArrangingPayment") {
    __typename
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<
    TransitionToArrangingPaymentMutation,
    TransitionToArrangingPaymentMutationVariables
>;
export const CompleteOfflinePaymentDocument = new TypedDocumentString(`
    mutation CompleteOfflinePayment {
  addPaymentToOrder(input: {method: "offline-terms", metadata: {}}) {
    __typename
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<
    CompleteOfflinePaymentMutation,
    CompleteOfflinePaymentMutationVariables
>;
export const CompleteOnlinePaymentDocument = new TypedDocumentString(`
    mutation CompleteOnlinePayment($status: JSON!) {
  addPaymentToOrder(input: {method: "online-stub", metadata: $status}) {
    __typename
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<
    CompleteOnlinePaymentMutation,
    CompleteOnlinePaymentMutationVariables
>;
export const RemoveCartLineInBatchDocument = new TypedDocumentString(`
    mutation RemoveCartLineInBatch($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) {
    __typename
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
    `) as unknown as TypedDocumentString<
    RemoveCartLineInBatchMutation,
    RemoveCartLineInBatchMutationVariables
>;
export const CatalogCollectionsDocument = new TypedDocumentString(`
    query CatalogCollections {
  collections(options: {take: 100}) {
    items {
      id
      name
      slug
      breadcrumbs {
        id
        name
        slug
      }
      children {
        id
        name
        slug
      }
    }
  }
}
    `) as unknown as TypedDocumentString<CatalogCollectionsQuery, CatalogCollectionsQueryVariables>;

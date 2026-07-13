import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import {
    ProductRecordDto,
    CrossReferenceRecordDto,
    PriceRecordDto,
    StockRecordDto,
    CustomerRecordDto,
    CounterpartyRecordDto,
    CustomerCounterpartyRecordDto,
    TradingPointRecordDto,
    CategoryRecordDto,
    DiscountRuleRecordDto,
    DocumentRecordDto,
    OrganizationRequisitesRecordDto,
    DepartmentRecordDto,
    BranchRecordDto,
    EmployeeRecordDto,
} from './records';

const RECORD_TYPE_DTOS = [
    ProductRecordDto,
    PriceRecordDto,
    StockRecordDto,
    CustomerRecordDto,
    CounterpartyRecordDto,
    CustomerCounterpartyRecordDto,
    TradingPointRecordDto,
    CategoryRecordDto,
    CrossReferenceRecordDto,
    DiscountRuleRecordDto,
    DocumentRecordDto,
    OrganizationRequisitesRecordDto,
    DepartmentRecordDto,
    BranchRecordDto,
    EmployeeRecordDto,
] as const;

// `type` -> which of RECORD_TYPE_DTOS is the shape of `data`. Keep in sync
// with the ImportRecord union in ../types.ts.
const TYPE_TO_SCHEMA: Record<string, (typeof RECORD_TYPE_DTOS)[number]> = {
    product: ProductRecordDto,
    price: PriceRecordDto,
    stock: StockRecordDto,
    customer: CustomerRecordDto,
    counterparty: CounterpartyRecordDto,
    customerCounterparty: CustomerCounterpartyRecordDto,
    tradingPoint: TradingPointRecordDto,
    category: CategoryRecordDto,
    crossReference: CrossReferenceRecordDto,
    discountRule: DiscountRuleRecordDto,
    document: DocumentRecordDto,
    organizationRequisites: OrganizationRequisitesRecordDto,
    department: DepartmentRecordDto,
    branch: BranchRecordDto,
    employee: EmployeeRecordDto,
};

@ApiExtraModels(...RECORD_TYPE_DTOS)
export class ImportRecordDto {
    @ApiProperty({
        description: `One of: ${Object.keys(TYPE_TO_SCHEMA).join(', ')}. Determines which shape "data" must match — see the discriminator mapping below.`,
        enum: Object.keys(TYPE_TO_SCHEMA),
        example: 'price',
    })
    type!: string;

    @ApiProperty({
        description:
            "Payload matching the shape for this record's type (see the \"type\" field's enum and this schema's discriminator mapping).",
        oneOf: RECORD_TYPE_DTOS.map(dto => ({ $ref: getSchemaPath(dto) })),
        discriminator: {
            propertyName: 'type',
            mapping: Object.fromEntries(
                Object.entries(TYPE_TO_SCHEMA).map(([type, dto]) => [type, getSchemaPath(dto)]),
            ),
        },
    })
    data!: Record<string, unknown>;
}

export class BatchImportRequestDto {
    @ApiProperty({
        description:
            'Idempotency key. Submitting the same exchangeId twice returns the original ' +
            'result without reprocessing.',
        example: 'sync-2026-07-05-001',
    })
    exchangeId!: string;

    @ApiProperty({ type: [ImportRecordDto] })
    records!: ImportRecordDto[];
}

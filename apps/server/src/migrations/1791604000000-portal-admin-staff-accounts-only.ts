import { MigrationInterface, QueryRunner } from 'typeorm';

const KEPT = ['ReadAdministrator', 'ManageAdministratorLifecycle', 'ReadSettings'];
const PREVIOUS = [
    'ReadCatalog',
    'ReadOrder',
    'ReadProformaInvoice',
    'ReadPayment',
    'ReadSettlementDocument',
    'ReadCustomer',
    'ReadCounterparty',
    'ReadCounterpartyCredit',
    'ReadConfidentialPriceTypes',
    'ReadAllCustomerPriceTypes',
    'ManageAccessControl',
    'ManageAdministratorLifecycle',
    'ManageApprovalWorkflows',
    'ManageSharedTableViews',
    'ReadCheckResults',
    'ManageCheckPolicies',
    'ManageDiscountLimits',
    'ReassignCounterpartyManager',
    'ManageCounterpartyTeam',
    'ManageCounterpartyPortalAccess',
    'ManageVisibilityGrants',
    'ReadEntityHistory',
    'ReadChangeJournal',
    'ReadAdministrator',
    'CreateOrder',
    'UpdateOrder',
    'ConfirmOrder',
    'ConfirmPaymentReceived',
    'CancelOrder',
    'AdjustPriceWithinLimit',
    'RequestPriceAdjustmentApproval',
    'RequestDiscountGrantApproval',
    'RequestCreditTermApproval',
    'ApproveDiscountRequest',
    'ApproveSecurityLimit',
    'ReadSettings',
    'ReadManagerCard',
    'ReadAnalytics',
    'RemoveCounterpartyManager',
    'UpdateCatalog',
    'ReadDeletedContractPowerOfAttorney',
];

export class PortalAdminStaffAccountsOnly1791604000000 implements MigrationInterface {
    name = 'PortalAdminStaffAccountsOnly1791604000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "role" SET "permissions" = array_to_string(ARRAY(SELECT p FROM unnest(string_to_array("permissions", ',')) AS p WHERE p = 'Authenticated' OR p = ANY ($1)), ',') WHERE "code" = 'portal-admin'`,
            [KEPT],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "role" SET "permissions" = array_to_string(ARRAY(SELECT DISTINCT p FROM unnest(string_to_array("permissions", ',') || $1::text[]) AS p), ',') WHERE "code" = 'portal-admin'`,
            [PREVIOUS],
        );
    }
}

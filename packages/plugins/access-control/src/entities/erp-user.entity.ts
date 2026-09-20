import { DeepPartial, ID } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ErpUserStatus = 'unlinked' | 'linked';

// Issue #119: a 1C "user" (UserChanged) mirrored into mivend, in one of two states — `unlinked`
// (a candidate, no Vendure Administrator login exists yet) or `linked` (a human has created one,
// see AdministratorProvisioningService.createFromPending, or UserEnrichmentService matched one
// by email). Surfaced to a human while `unlinked` so they can decide whether it becomes a real
// Administrator login.
//
// One row per erpId for the user's entire lifetime — never deleted on link (see
// ErpUserService.markLinked's own comment for why: this row is the only place
// `counterparty.handler.ts` and any other manager-erpId-dependent handler can distinguish "no
// info yet, real race, retry" from "known, will never link, do not retry" — deleting it on link
// made every consumer of this table indistinguishable from a row that had simply never been
// seen). Previously named `PendingErpUser`; renamed because "pending" stopped describing what
// the row means once linked rows stick around too — see the mivend.audit.common cross-session
// diagnosis of issue #104's `counterparty` stream inbox backlog (2026-09-20) for the incident
// this fixes.
@Entity()
export class ErpUser extends VendureEntity {
    constructor(input?: DeepPartial<ErpUser>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    fullName!: string | null;

    @Column({ type: 'varchar', nullable: true })
    email!: string | null;

    @Column({ type: 'varchar', nullable: true })
    departmentId!: string | null;

    @Column({ type: 'timestamp' })
    firstSeenAt!: Date;

    @Column({ type: 'timestamp' })
    lastSeenAt!: Date;

    @Column({ type: 'varchar', default: 'unlinked' })
    status!: ErpUserStatus;

    // Set only by ErpUserService.markLinked, in the same transaction as the Administrator that
    // now owns this erpId — never set independently of `status` flipping to 'linked'.
    @Column({ type: 'varchar', nullable: true })
    administratorId!: ID | null;

    // Last known 1C isActive/isDeleted signal for this user, distinct from `status` (which only
    // tracks the Administrator link, not the 1C-side lifecycle). `null` means "never told either
    // way". Used only to keep an inactive/deleted 1C user from showing a "Create administrator"
    // action while `unlinked` — see ErpUserService.findAllPaginated's own comment. Never itself
    // drives the counterparty.handler.ts manager-resolution decision, which only looks at
    // `status`/`administratorId`.
    @Column({ type: 'boolean', nullable: true })
    active!: boolean | null;
}

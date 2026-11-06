import { Injectable } from '@nestjs/common';
import {
    Administrator,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';

import { AccessScopeService } from './access-scope.service';
import { DepartmentService } from './department.service';
import { ErpUserService } from './erp-user.service';
import { PositionService } from './position.service';
import { TeamAdministratorService } from './team-administrator.service';

// Disjoint: inactive (soft-deleted), unassigned (live, no department), active (live, in a department).
export type TeamDirectoryStatus = 'active' | 'inactive' | 'unassigned';

export interface TeamDirectoryListOptions {
    skip?: number | null;
    take?: number | null;
    search?: string | null;
    filter?: {
        departmentId?: string | null;
        branchId?: string | null;
        status?: TeamDirectoryStatus | null;
    } | null;
}

export interface TeamDirectoryMember {
    id: string;
    erpId: string | null;
    firstName: string | null;
    lastName: string | null;
    active: boolean;
    roleCodes: string[];
    departmentId: string | null;
    departmentName: string | null;
    branchId: string | null;
    positionId: string | null;
    position: string | null;
}

interface AdministratorCustomFields {
    departmentId?: string | null;
    branchId?: string | null;
    erpId?: string | null;
}

const DEPARTMENT = 'a.customFields.departmentId';

@Injectable()
export class TeamDirectoryService {
    constructor(
        private connection: TransactionalConnection,
        private teamAdministratorService: TeamAdministratorService,
        private accessScopeService: AccessScopeService,
        private departmentService: DepartmentService,
        private erpUserService: ErpUserService,
        private positionService: PositionService,
    ) {}

    // Names outside the caller's department are null unless teamVisibility is 'all'; search never
    // matches a name the caller cannot see. take: 0 is a lean count (no joins, no rows).
    async findPage(
        ctx: RequestContext,
        options: TeamDirectoryListOptions = {},
    ): Promise<PaginatedList<TeamDirectoryMember>> {
        const branch = await this.teamAdministratorService.resolveBranch(ctx);
        if (branch.kind === 'none') return { items: [], totalItems: 0 };
        const [ownDepartmentId, visibility] = await Promise.all([
            this.accessScopeService.getOwnDepartmentId(ctx),
            this.accessScopeService.resolveTeamVisibilityScope(ctx),
        ]);
        const nameVisibleToAll = visibility.kind === 'all';
        const qb = this.connection
            .getRepository(ctx, Administrator)
            .createQueryBuilder('a')
            .withDeleted();
        if (branch.kind === 'branch') {
            qb.andWhere('a.customFields.branchId = :scopeBranch', { scopeBranch: branch.branchId });
        }
        this.applyFilter(qb, options);
        this.applySearch(qb, options.search, nameVisibleToAll, ownDepartmentId);
        const take = options.take ?? 20;
        if (take === 0) return { items: [], totalItems: await qb.getCount() };
        qb.leftJoinAndSelect('a.user', 'user')
            .leftJoinAndSelect('user.roles', 'role')
            .orderBy('a.id', 'ASC')
            .skip(options.skip ?? 0)
            .take(take);
        const [admins, totalItems] = await qb.getManyAndCount();
        const items = await this.toMembers(ctx, admins, nameVisibleToAll, ownDepartmentId);
        return { items, totalItems };
    }

    private applyFilter(
        qb: SelectQueryBuilder<Administrator>,
        options: TeamDirectoryListOptions,
    ): void {
        const { departmentId, branchId, status } = options.filter ?? {};
        if (departmentId) qb.andWhere(`${DEPARTMENT} = :departmentId`, { departmentId });
        if (branchId) qb.andWhere('a.customFields.branchId = :branchId', { branchId });
        if (status === 'inactive') qb.andWhere('a.deletedAt IS NOT NULL');
        if (status === 'active' || status === 'unassigned') qb.andWhere('a.deletedAt IS NULL');
        if (status === 'active') qb.andWhere(`${DEPARTMENT} IS NOT NULL`);
        if (status === 'unassigned') qb.andWhere(`${DEPARTMENT} IS NULL`);
    }

    private applySearch(
        qb: SelectQueryBuilder<Administrator>,
        search: string | null | undefined,
        nameVisibleToAll: boolean,
        ownDepartmentId: string | null,
    ): void {
        const term = search?.trim();
        if (!term) return;
        const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
        const nameVisible = nameVisibleToAll
            ? 'TRUE'
            : ownDepartmentId != null
              ? `${DEPARTMENT} = :ownDepartmentId`
              : 'FALSE';
        qb.andWhere(
            `(a.customFields.erpId ILIKE :pattern OR (${nameVisible} AND ` +
                `concat_ws(' ', a.firstName, a.lastName) ILIKE :pattern))`,
            { pattern, ownDepartmentId },
        );
    }

    private async toMembers(
        ctx: RequestContext,
        admins: Administrator[],
        nameVisibleToAll: boolean,
        ownDepartmentId: string | null,
    ): Promise<TeamDirectoryMember[]> {
        const erpIds = admins.flatMap(a => {
            const erpId = (a.customFields as AdministratorCustomFields | undefined)?.erpId;
            return erpId ? [erpId] : [];
        });
        const positionByErpId = await this.erpUserService.findPositionErpIds(ctx, erpIds);
        const [positionNames, departments] = await Promise.all([
            this.positionService.findNamesByErpIds(ctx, [...new Set(positionByErpId.values())]),
            this.departmentService.findAll(ctx),
        ]);
        const departmentNames = new Map(departments.map(d => [d.erpId, d.name]));
        return admins.map(a => {
            const fields = (a.customFields ?? {}) as AdministratorCustomFields;
            const departmentId = fields.departmentId ?? null;
            const nameVisible =
                nameVisibleToAll || (ownDepartmentId != null && departmentId === ownDepartmentId);
            const positionId = positionByErpId.get(fields.erpId ?? '') ?? null;
            return {
                id: String(a.id),
                erpId: fields.erpId ?? null,
                firstName: nameVisible ? a.firstName : null,
                lastName: nameVisible ? a.lastName : null,
                active: a.deletedAt == null,
                roleCodes: a.user?.roles?.map(r => r.code) ?? [],
                departmentId,
                departmentName: departmentId ? (departmentNames.get(departmentId) ?? null) : null,
                branchId: fields.branchId ?? null,
                positionId,
                position: positionId ? (positionNames.get(positionId) ?? null) : null,
            };
        });
    }
}

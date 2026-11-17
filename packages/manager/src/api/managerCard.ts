import { adminApi } from './client';
import { ManagerCardDocument, type ManagerCardQuery } from './generated/graphql';

export type ManagerCard = NonNullable<ManagerCardQuery['managerCard']>;
export type ManagerDynamicsPoint = ManagerCard['dynamics']['current'];

export const LOST_THRESHOLDS = [60, 90, 180] as const;

// Null for a manager outside the caller's scope or without the right.
export async function fetchManagerCard(
    administratorId: string,
    lostAfterDays: number,
): Promise<ManagerCard | null> {
    return (await adminApi(ManagerCardDocument, { administratorId, lostAfterDays })).managerCard;
}

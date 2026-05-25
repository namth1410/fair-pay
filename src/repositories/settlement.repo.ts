// Settlement repository — settlements là server-computed, client chỉ read-only.

import type { SettlementRow } from '../types/database.types';
import { getDatabase, upsertRow } from './_shared';

export interface Settlement {
  id: string;
  tripId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  generatedAt: string;
}

function mapRow(row: SettlementRow): Settlement {
  return {
    id: row.id,
    tripId: row.trip_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amount: row.amount,
    generatedAt: row.generated_at,
  };
}

export async function listByTrip(tripId: string): Promise<Settlement[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<SettlementRow>(
    `SELECT * FROM settlements WHERE trip_id = ?`,
    [tripId]
  );
  return rows.map(mapRow);
}

export async function upsertFromServer(row: SettlementRow): Promise<void> {
  await upsertRow('settlements', {
    id: row.id,
    trip_id: row.trip_id,
    from_member_id: row.from_member_id,
    to_member_id: row.to_member_id,
    amount: row.amount,
    generated_at: row.generated_at,
  });
}

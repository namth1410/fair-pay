import type { GroupWithMemberCount } from '../services/group.service';
import type { Trip } from '../services/trip.service';

export interface TripWithGroup {
  trip: Trip;
  groupName: string;
  groupAvatarUrl: string | null;
}

/**
 * Pick top N trips for "Gần đây" suggestions.
 * Strategy (no expense-tracking infra yet): use trip.created_at as proxy for
 * recency — the most recently created trip is likely where active spending
 * happens. Filter status='open' only (closed trips don't accept new expenses).
 */
export function getRecentTrips(
  allTrips: Trip[],
  groups: GroupWithMemberCount[],
  limit = 3
): TripWithGroup[] {
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  return allTrips
    .filter((t) => t.status === 'open' && groupMap.has(t.group_id))
    .slice(0, limit)
    .map((trip) => {
      const g = groupMap.get(trip.group_id)!;
      return {
        trip,
        groupName: g.name,
        groupAvatarUrl: g.avatar_url ?? null,
      };
    });
}

/** Group trips by group_id for the "Tất cả nhóm" section. */
export function groupTripsByGroup(
  allTrips: Trip[],
  groups: GroupWithMemberCount[]
): Array<{ group: GroupWithMemberCount; trips: Trip[] }> {
  const tripsByGroup = new Map<string, Trip[]>();
  for (const t of allTrips) {
    const arr = tripsByGroup.get(t.group_id) ?? [];
    arr.push(t);
    tripsByGroup.set(t.group_id, arr);
  }

  return groups.map((group) => ({
    group,
    trips: tripsByGroup.get(group.id) ?? [],
  }));
}

/**
 * Search filter: case-insensitive, accent-insensitive match across group name
 * and trip name. Returns trips whose own name OR whose group name matches.
 */
export function filterTripsBySearch(
  allTrips: Trip[],
  groups: GroupWithMemberCount[],
  query: string
): Trip[] {
  const q = normalize(query.trim());
  if (!q) return allTrips;

  const groupMap = new Map(groups.map((g) => [g.id, g]));
  return allTrips.filter((t) => {
    const g = groupMap.get(t.group_id);
    if (!g) return false;
    return normalize(t.name).includes(q) || normalize(g.name).includes(q);
  });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

import type { Trip } from '../services/trip.service';
import type { TripWithGroup } from '../types/database.types';

/**
 * Context tối thiểu cần để thao tác trên 1 trip mà không phải có cả object trong tay:
 * group_id (load-bearing — mọi mutation cần), tên + trạng thái cho hiển thị.
 * `groupName` optional vì chỉ pinnedTrips/allUserTrips (TripWithGroup) mới mang.
 */
export interface TripContext {
  tripId: string;
  groupId: string;
  tripName: string;
  status: Trip['status'];
  groupName?: string;
}

/**
 * 4 collection trong trip.store cùng mang trip data. Gom lại để resolve tripId → context
 * bất kể user vào trip qua đường nào (group detail, pinned card, deep link, notification).
 */
export interface TripCollections {
  currentTrip: Trip | null;
  trips: Trip[];
  pinnedTrips: TripWithGroup[];
  allUserTrips: TripWithGroup[] | null;
}

/**
 * Pure resolver: tìm context của 1 trip từ các collection đang có trong store.
 * Thứ tự ưu tiên CHỈ vì độ tươi (currentTrip hydrate qua fetchTripById là mới nhất);
 * `group_id` của 1 tripId là bất biến nên hit ở collection nào cũng đúng.
 * Trả null khi không collection nào chứa trip → caller fallback async fetchTripById.
 */
export function findTripContext(
  collections: TripCollections,
  tripId: string,
): TripContext | null {
  if (!tripId) return null;
  const { currentTrip, trips, pinnedTrips, allUserTrips } = collections;

  if (currentTrip && currentTrip.id === tripId) return toContext(currentTrip);

  const fromTrips = trips.find((t) => t.id === tripId);
  if (fromTrips) return toContext(fromTrips);

  const fromPinned = pinnedTrips.find((t) => t.id === tripId);
  if (fromPinned) return toContext(fromPinned);

  const fromAll = allUserTrips?.find((t) => t.id === tripId);
  if (fromAll) return toContext(fromAll);

  return null;
}

/** Trip | TripWithGroup → TripContext. `group_name` chỉ có ở TripWithGroup (narrowing, không cast). */
function toContext(trip: Trip | TripWithGroup): TripContext {
  return {
    tripId: trip.id,
    groupId: trip.group_id,
    tripName: trip.name,
    status: trip.status,
    groupName: 'group_name' in trip ? trip.group_name : undefined,
  };
}

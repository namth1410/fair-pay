/**
 * Tests cho findTripContext — pure resolver tripId → group context.
 * Mục đích: đảm bảo form thêm khoản chi (và các action store) resolve được group_id
 * từ tripId bất kể user vào trip qua đường nào (group detail, pinned card, deep link).
 *
 * Bug gốc: ExpenseFormScreen chỉ tra `trips` (chỉ nạp ở group detail) → bypass entry-point
 * để group_id undefined → submit báo "Không tìm thấy chuyến đi".
 */
import type { Trip } from '../services/trip.service';
import { findTripContext, type TripCollections } from '../stores/tripSelectors';
import type { TripWithGroup } from '../types/database.types';

function makeTrip(id: string, groupId: string, name = `Trip ${id}`): Trip {
  return {
    id,
    group_id: groupId,
    name,
    type: 'travel',
    status: 'open',
    created_by: 'user-1',
    version: 1,
    client_request_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    closed_at: null,
    deleted_at: null,
  };
}

function makeTripWithGroup(
  id: string,
  groupId: string,
  groupName: string,
  name = `Trip ${id}`,
): TripWithGroup {
  return { ...makeTrip(id, groupId, name), group_name: groupName };
}

const EMPTY: TripCollections = {
  currentTrip: null,
  trips: [],
  pinnedTrips: [],
  allUserTrips: null,
};

describe('findTripContext', () => {
  it('hit currentTrip → trả context, groupName undefined (Trip không mang group_name)', () => {
    const ctx = findTripContext(
      { ...EMPTY, currentTrip: makeTrip('t1', 'g1', 'Đà Lạt') },
      't1',
    );
    expect(ctx).toEqual({
      tripId: 't1',
      groupId: 'g1',
      tripName: 'Đà Lạt',
      status: 'open',
      groupName: undefined,
    });
  });

  it('currentTrip ưu tiên hơn trips khi cả hai chứa cùng id', () => {
    const ctx = findTripContext(
      {
        ...EMPTY,
        currentTrip: makeTrip('t1', 'g-current'),
        trips: [makeTrip('t1', 'g-stale')],
      },
      't1',
    );
    expect(ctx?.groupId).toBe('g-current');
  });

  it('miss currentTrip → hit trips', () => {
    const ctx = findTripContext(
      { ...EMPTY, currentTrip: makeTrip('other', 'gx'), trips: [makeTrip('t2', 'g2')] },
      't2',
    );
    expect(ctx?.groupId).toBe('g2');
    expect(ctx?.groupName).toBeUndefined();
  });

  it('chỉ pinnedTrips chứa trip → hit + có groupName', () => {
    const ctx = findTripContext(
      { ...EMPTY, pinnedTrips: [makeTripWithGroup('t3', 'g3', 'Nhóm Phượt')] },
      't3',
    );
    expect(ctx?.groupId).toBe('g3');
    expect(ctx?.groupName).toBe('Nhóm Phượt');
  });

  it('chỉ allUserTrips chứa trip → hit + có groupName', () => {
    const ctx = findTripContext(
      { ...EMPTY, allUserTrips: [makeTripWithGroup('t4', 'g4', 'Nhóm Ăn')] },
      't4',
    );
    expect(ctx?.groupId).toBe('g4');
    expect(ctx?.groupName).toBe('Nhóm Ăn');
  });

  it('allUserTrips === null không throw', () => {
    expect(() => findTripContext({ ...EMPTY, allUserTrips: null }, 'tX')).not.toThrow();
    expect(findTripContext({ ...EMPTY, allUserTrips: null }, 'tX')).toBeNull();
  });

  it('miss tất cả collection → null', () => {
    const ctx = findTripContext(
      {
        currentTrip: makeTrip('a', 'ga'),
        trips: [makeTrip('b', 'gb')],
        pinnedTrips: [makeTripWithGroup('c', 'gc', 'GC')],
        allUserTrips: [makeTripWithGroup('d', 'gd', 'GD')],
      },
      'not-exist',
    );
    expect(ctx).toBeNull();
  });

  it('tripId rỗng → null (guard cho useState initializer + resolveTripContext)', () => {
    expect(findTripContext({ ...EMPTY, currentTrip: makeTrip('t1', 'g1') }, '')).toBeNull();
  });
});

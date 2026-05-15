// POST /send-push
// Body: { notification_id: string }
// Called by Postgres trigger AFTER INSERT/UPDATE on notifications via pg_net.
//
// 1. Load notification row + recipient user.fcm_token
// 2. Skip if fcm_token is NULL (user disabled push or never registered)
// 3. Mint FCM v1 OAuth access token (cached ~55min)
// 4. POST FCM v1 send → if UNREGISTERED/INVALID_ARGUMENT, clear fcm_token
//
// Auth: trigger sends Bearer <SUPABASE_SERVICE_ROLE_KEY> in Authorization
// header. We don't verify a per-user JWT — this is server-to-server.
import {
  getFirebaseAccessToken,
  getFirebaseProjectId,
} from '../_shared/firebase.ts';
import {
  HttpError,
  jsonResponse,
  supabaseAdmin,
  withErrorHandling,
} from '../_shared/auth.ts';

interface NotificationRow {
  id: string;
  user_id: string;
  group_id: string | null;
  trip_id: string | null;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

function routeForType(
  type: string,
  groupId: string | null,
  tripId: string | null,
): string | null {
  switch (type) {
    case 'expense.created':
    case 'expense.edited':
    case 'expense.deleted':
    case 'payment.recorded':
    case 'payment.received':
    case 'trip.closed':
    case 'trip.cleared':
    case 'trip.reminder_settle':
      return tripId ? `/trips/${tripId}` : null;
    case 'member.join_requested':
    case 'member.role_change':
    case 'member.invite_accepted':
    case 'member.invite_declined':
    case 'trip.deleted':
      return groupId ? `/groups/${groupId}` : null;
    case 'member.join_approved':
      return groupId ? `/groups/${groupId}` : '/';
    case 'member.join_rejected':
    case 'member.invite_received':
    case 'member.invite_revoked':
      return '/';
    default:
      return null;
  }
}

async function clearFcmToken(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ fcm_token: null })
    .eq('id', userId);
  if (error) console.warn('[send-push] failed to clear token:', error.message);
}

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const body = await req.json().catch(() => null);
    const notificationId = body?.notification_id;
    if (typeof notificationId !== 'string') {
      throw new HttpError(400, 'notification_id required');
    }

    // Load notification + user fcm_token in 2 queries (avoid join — simpler RLS bypass via service role).
    const { data: notif, error: notifErr } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id, group_id, trip_id, type, title, body, data')
      .eq('id', notificationId)
      .maybeSingle();

    if (notifErr) throw new HttpError(500, notifErr.message);
    if (!notif) {
      // Notification already deleted (cleanup cron). Not an error.
      return jsonResponse({ skipped: 'notification_not_found' });
    }
    const notification = notif as NotificationRow;

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('fcm_token')
      .eq('id', notification.user_id)
      .maybeSingle();

    if (userErr) throw new HttpError(500, userErr.message);
    const fcmToken = user?.fcm_token as string | null | undefined;
    if (!fcmToken) {
      return jsonResponse({ skipped: 'no_fcm_token' });
    }

    const route = routeForType(notification.type, notification.group_id, notification.trip_id);
    const fcmData: Record<string, string> = {
      notification_id: notification.id,
      type: notification.type,
    };
    if (notification.group_id) fcmData.group_id = notification.group_id;
    if (notification.trip_id) fcmData.trip_id = notification.trip_id;
    if (route) fcmData.route = route;

    const accessToken = await getFirebaseAccessToken();
    const projectId = getFirebaseProjectId();
    const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const message = {
      message: {
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.body ?? '',
        },
        data: fcmData,
        android: {
          priority: 'HIGH' as const,
          notification: {
            channel_id: 'default',
            click_action: 'OPEN_NOTIFICATION',
          },
        },
      },
    };

    const fcmResp = await fetch(fcmEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (fcmResp.ok) {
      const result = await fcmResp.json();
      return jsonResponse({ ok: true, name: result.name });
    }

    // Error path — FCM v1 returns { error: { code, message, status, details } }.
    const errBody = await fcmResp.json().catch(() => ({}));
    const errStatus = errBody?.error?.status as string | undefined;
    const errMessage = errBody?.error?.message as string | undefined;

    // Token invalid → clear so we don't retry on every future notification.
    if (
      errStatus === 'UNREGISTERED' ||
      errStatus === 'INVALID_ARGUMENT' ||
      fcmResp.status === 404
    ) {
      await clearFcmToken(notification.user_id);
      return jsonResponse(
        { ok: false, cleared: true, status: errStatus, message: errMessage },
        200,
      );
    }

    console.error('[send-push] FCM error', fcmResp.status, errStatus, errMessage);
    return jsonResponse(
      { ok: false, status: errStatus ?? fcmResp.status, message: errMessage },
      200,
    );
  }),
);

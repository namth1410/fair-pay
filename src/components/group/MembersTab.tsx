import Clock from 'lucide-react-native/dist/esm/icons/clock';
import Share2 from 'lucide-react-native/dist/esm/icons/share-2';
import UserPlus from 'lucide-react-native/dist/esm/icons/user-plus';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type {
  GroupInvitation,
  GroupMember,
  JoinRequest,
} from '../../services/group.service';
import { hapticLight } from '../../utils/haptics';
import { isPendingInviteCode } from '../../utils/inviteCode';
import { AppText, Avatar } from '../ui';

// Tab Thành viên (giao diện "Hội thoại" 2026-10): danh sách hàng phẳng kiểu danh bạ chat,
// mã mời là thẻ xanh nhạt chạm để chia sẻ.
function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <AppText variant="meta" weight="bold" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

function TextAction({
  label,
  tone,
  onPress,
  disabled,
}: {
  label: string;
  tone: 'primary' | 'danger' | 'success';
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      style={({ pressed }) => [pressed && { opacity: 0.5 }, disabled && { opacity: 0.5 }]}
    >
      <AppText variant="caption" weight="semibold" tone={tone}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface MembersTabProps {
  members: GroupMember[];
  pendingRequests: JoinRequest[];
  pendingInvitations: GroupInvitation[];
  isLoadingPendingInvitations: boolean;
  inviteCode?: string;
  isAdmin: boolean;
  /** Id của invitation đang được revoke (để disable nút riêng row đó). */
  revokingInvitationId: string | null;
  onShare: () => void;
  onKick: (member: GroupMember) => void;
  onRename: (member: GroupMember) => void;
  onApprove: (req: JoinRequest) => void;
  onReject: (req: JoinRequest) => void;
  onAddMember: () => void;
  onRevokeInvitation: (inv: GroupInvitation) => void;
}

export const MembersTab = React.memo(function MembersTab({
  members, pendingRequests, pendingInvitations, isLoadingPendingInvitations,
  inviteCode, isAdmin, revokingInvitationId,
  onShare, onKick, onRename, onApprove, onReject, onAddMember, onRevokeInvitation,
}: MembersTabProps) {
  const c = useAppTheme();
  const isPendingCode = isPendingInviteCode(inviteCode);

  const header = (
    <View>
      {/* Mã mời — khi nhóm còn chờ đồng bộ thì hiện placeholder + vô hiệu Share để
          tránh user chia sẻ mã giả. */}
      <Pressable
        onPress={isPendingCode ? undefined : () => { hapticLight(); onShare(); }}
        disabled={isPendingCode}
        accessibilityRole="button"
        accessibilityLabel={isPendingCode ? 'Mã mời sẽ hiện sau khi đồng bộ' : `Chia sẻ mã mời ${inviteCode ?? ''}`}
        style={({ pressed }) => [
          styles.inviteCard,
          { backgroundColor: c.brandSoft, borderColor: c.brandBorder, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.inviteText}>
          <AppText variant="meta" weight="semibold" tone="muted">
            Mã mời
          </AppText>
          {isPendingCode ? (
            <AppText variant="body" weight="semibold" tone="muted">
              Sẽ hiện sau khi đồng bộ
            </AppText>
          ) : (
            <AppText variant="title" weight="extrabold" style={[styles.inviteCode, { color: c.foreground }]}>
              {inviteCode}
            </AppText>
          )}
          <AppText variant="meta" tone="muted">
            Gửi mã này cho bạn bè để họ xin vào nhóm
          </AppText>
        </View>
        <View style={[styles.inviteBtn, { backgroundColor: isPendingCode ? c.surfaceAlt : c.primary }]}>
          {isPendingCode ? (
            <Clock size={20} color={c.muted} />
          ) : (
            <Share2 size={20} color={c.inverseForeground} strokeWidth={2.2} />
          )}
        </View>
      </Pressable>

      {/* Admin-only: thêm thành viên (mời email / thành viên ảo) */}
      {isAdmin ? (
        <Pressable
          onPress={() => { hapticLight(); onAddMember(); }}
          accessibilityRole="button"
          accessibilityLabel="Thêm thành viên"
          android_ripple={{ color: c.surfaceAlt }}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceAlt }]}
        >
          <View style={[styles.addCircle, { backgroundColor: c.primarySoft }]}>
            <UserPlus size={20} color={c.primary} strokeWidth={2.2} />
          </View>
          <View style={[styles.rowBody, { borderBottomColor: c.divider }]}>
            <AppText variant="subtitle" weight="bold" style={{ color: c.primary }}>
              Thêm thành viên
            </AppText>
          </View>
        </Pressable>
      ) : null}

      {/* Yêu cầu tham gia đang chờ duyệt */}
      {isAdmin && pendingRequests.length > 0 ? (
        <>
          <AppText variant="caption" weight="bold" tone="muted" style={styles.sectionLabel}>
            Yêu cầu tham gia · {pendingRequests.length}
          </AppText>
          {pendingRequests.map((req) => {
            const claimed = req.claim_member_id
              ? members.find((m) => m.id === req.claim_member_id)
              : null;
            return (
              <View key={req.id} style={styles.row}>
                <Avatar seed={req.user_id} label={req.display_name} size={44} />
                <View style={[styles.rowBody, { borderBottomColor: c.divider }]}>
                  <View style={styles.rowTexts}>
                    <AppText variant="subtitle" weight="bold" numberOfLines={1}>
                      {req.display_name}
                    </AppText>
                    <AppText variant="caption" numberOfLines={1} style={{ color: c.warning }}>
                      {claimed ? `Muốn thay cho: ${claimed.display_name}` : 'Đang chờ duyệt'}
                    </AppText>
                  </View>
                  <View style={styles.actions}>
                    <TextAction label="Duyệt" tone="success" onPress={() => onApprove(req)} />
                    <TextAction label="Từ chối" tone="danger" onPress={() => onReject(req)} />
                  </View>
                </View>
              </View>
            );
          })}
        </>
      ) : null}

      {/* Lời mời admin đã gửi, đợi người được mời chấp nhận */}
      {isAdmin && (pendingInvitations.length > 0 || isLoadingPendingInvitations) ? (
        <>
          <AppText variant="caption" weight="bold" tone="muted" style={styles.sectionLabel}>
            Lời mời đang chờ · {pendingInvitations.length}
          </AppText>
          {isLoadingPendingInvitations && pendingInvitations.length === 0 ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={c.muted} />
            </View>
          ) : (
            pendingInvitations.map((inv) => {
              const isRevoking = revokingInvitationId === inv.id;
              const display = inv.invited_display_name?.trim() || inv.invited_email;
              return (
                <View key={inv.id} style={styles.row}>
                  <Avatar
                    seed={inv.invited_user_id}
                    label={display}
                    photoUrl={inv.invited_photo_url ?? null}
                    size={44}
                  />
                  <View style={[styles.rowBody, { borderBottomColor: c.divider }]}>
                    <View style={styles.rowTexts}>
                      <AppText variant="subtitle" weight="bold" numberOfLines={1}>
                        {display}
                      </AppText>
                      <AppText variant="caption" tone="muted" numberOfLines={1}>
                        {inv.invited_email}
                      </AppText>
                    </View>
                    <TextAction
                      label={isRevoking ? 'Đang thu hồi...' : 'Thu hồi'}
                      tone="danger"
                      disabled={isRevoking}
                      onPress={() => onRevokeInvitation(inv)}
                    />
                  </View>
                </View>
              );
            })
          )}
        </>
      ) : null}

      <AppText variant="caption" weight="bold" tone="muted" style={styles.sectionLabel}>
        Thành viên · {members.length}
      </AppText>
    </View>
  );

  const renderMember = ({ item, index }: { item: GroupMember; index: number }) => {
    const isLast = index === members.length - 1;
    return (
      <View style={styles.row}>
        <Avatar seed={item.id} label={item.display_name} size={44} />
        <View
          style={[
            styles.rowBody,
            isLast ? styles.noBorder : { borderBottomColor: c.divider },
          ]}
        >
          <View style={styles.rowTexts}>
            <View style={styles.nameRow}>
              <AppText variant="subtitle" weight="bold" numberOfLines={1} style={styles.flexShrink}>
                {item.display_name}
              </AppText>
              {item.role === 'admin' ? (
                <Pill label="Quản trị" fg={c.primary} bg={c.primarySoft} />
              ) : null}
              {item.is_virtual ? <Pill label="Ảo" fg={c.muted} bg={c.surfaceAlt} /> : null}
            </View>
          </View>
          {isAdmin && item.role !== 'admin' ? (
            <View style={styles.actions}>
              <TextAction label="Đổi tên" tone="primary" onPress={() => onRename(item)} />
              <TextAction label="Xóa" tone="danger" onPress={() => onKick(item)} />
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={members}
      keyExtractor={(item) => item.id}
      renderItem={renderMember}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
    />
  );
});

const styles = StyleSheet.create({
  list: { paddingBottom: 32 },
  inviteCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteText: { flex: 1, minWidth: 0, gap: 2 },
  inviteCode: { letterSpacing: 2 },
  inviteBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 2,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    minHeight: 64,
  },
  addCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  noBorder: { borderBottomWidth: 0 },
  rowTexts: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flexShrink: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  inlineLoading: { paddingVertical: 12, paddingHorizontal: 20, alignItems: 'flex-start' },
});

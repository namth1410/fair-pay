import { Button } from 'heroui-native';
import Clock from 'lucide-react-native/dist/esm/icons/clock';
import Share2 from 'lucide-react-native/dist/esm/icons/share-2';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type {
  GroupInvitation,
  GroupMember,
  JoinRequest,
} from '../../services/group.service';
import { isPendingInviteCode } from '../../utils/inviteCode';
import { AppCard, AppText, Avatar, GradientHero } from '../ui';

type Role = 'admin' | 'member';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Quản trị',
  member: 'Thành viên',
};

function RolePill({ role, color }: { role: Role; color: string }) {
  return (
    <View style={[styles.rolePill, { backgroundColor: color + '22', borderColor: color }]}>
      <AppText variant="meta" weight="semibold" style={{ color }}>
        {ROLE_LABELS[role]}
      </AppText>
    </View>
  );
}

function VirtualPill({ color }: { color: string }) {
  return (
    <View style={[styles.rolePill, { backgroundColor: color + '22', borderColor: color }]}>
      <AppText variant="meta" weight="semibold" style={{ color }}>
        Ảo
      </AppText>
    </View>
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

  const roleColor: Record<Role, string> = {
    admin: c.primaryStrong,
    member: c.muted,
  };

  const renderMember = ({ item }: { item: GroupMember }) => (
    <AppCard
      title={item.display_name}
      leading={<Avatar seed={item.id} label={item.display_name} size={40} />}
      trailing={
        <View style={styles.memberTrailing}>
          <View style={styles.pillRow}>
            {item.is_virtual ? <VirtualPill color={c.muted} /> : null}
            {item.role === 'admin' ? (
              <RolePill role="admin" color={roleColor.admin} />
            ) : null}
          </View>
          {isAdmin && item.role !== 'admin' ? (
            <View style={styles.memberActions}>
              <Pressable
                onPress={() => onRename(item)}
                accessibilityRole="button"
                accessibilityLabel="Đổi tên"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <AppText variant="meta" weight="medium" tone="primary">Đổi tên</AppText>
              </Pressable>
              <Pressable
                onPress={() => onKick(item)}
                accessibilityRole="button"
                accessibilityLabel="Xóa"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <AppText variant="meta" weight="medium" tone="danger">Xóa</AppText>
              </Pressable>
            </View>
          ) : null}
        </View>
      }
    />
  );

  return (
    <>
      {/* Invite banner — gradient pink. Khi nhóm còn pending sync, hiện placeholder
          UI thay mã thật + vô hiệu Share để tránh user share code giả. */}
      {(() => {
        const isPending = isPendingInviteCode(inviteCode);
        return (
          <Pressable
            onPress={isPending ? undefined : onShare}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel={isPending ? 'Mã mời sẽ hiện sau khi đồng bộ' : 'Chia sẻ mã mời'}
            style={styles.inviteBanner}
          >
            <GradientHero fromColor={c.accentSoft} toColor={c.tint} gradientDirection="horizontal" style={styles.inviteBannerGradient}>
              <View style={styles.inviteInner}>
                <View style={styles.inviteText}>
                  <AppText variant="meta" tone="muted">Mã mời</AppText>
                  {isPending ? (
                    <AppText variant="body" weight="semibold" tone="muted">
                      Sẽ hiện sau khi đồng bộ
                    </AppText>
                  ) : (
                    <AppText variant="title" weight="bold" tone="primary" style={styles.inviteCode}>
                      {inviteCode}
                    </AppText>
                  )}
                </View>
                {isPending ? (
                  <Clock size={22} color={c.muted} />
                ) : (
                  <Share2 size={22} color={c.primaryStrong} />
                )}
              </View>
            </GradientHero>
          </Pressable>
        );
      })()}

      {/* Admin-only: thêm thành viên (mời email / thành viên ảo) */}
      {isAdmin && (
        <View style={styles.addVirtualSection}>
          <Button variant="secondary" size="sm" onPress={onAddMember}>
            <Button.Label>+ Thêm thành viên</Button.Label>
          </Button>
        </View>
      )}

      {/* Pending join requests */}
      {isAdmin && pendingRequests.length > 0 && (
        <View style={styles.pendingSection}>
          <AppText variant="label" tone="muted" style={styles.pendingLabel}>
            Yêu cầu tham gia ({pendingRequests.length})
          </AppText>
          {pendingRequests.map((req) => {
            const claimed = req.claim_member_id
              ? members.find((m) => m.id === req.claim_member_id)
              : null;
            return (
            <AppCard
              key={req.id}
              title={req.display_name}
              subtitle={claimed ? `Muốn thay cho: ${claimed.display_name}` : 'Đang chờ duyệt'}
              borderLeft={{ width: 3, color: c.warning }}
              trailing={
                <View style={styles.memberActions}>
                  <Pressable
                    onPress={() => onApprove(req)}
                    accessibilityRole="button"
                    accessibilityLabel="Duyệt"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <AppText variant="caption" weight="semibold" tone="success">Duyệt</AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => onReject(req)}
                    accessibilityRole="button"
                    accessibilityLabel="Từ chối"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <AppText variant="caption" weight="medium" tone="danger">Từ chối</AppText>
                  </Pressable>
                </View>
              }
            />
            );
          })}
        </View>
      )}

      {/* Pending invitations (admin-initiated, đợi user accept) */}
      {isAdmin && (pendingInvitations.length > 0 || isLoadingPendingInvitations) && (
        <View style={styles.pendingSection}>
          <AppText variant="label" tone="muted" style={styles.pendingLabel}>
            Lời mời đang chờ ({pendingInvitations.length})
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
                <AppCard
                  key={inv.id}
                  title={display}
                  subtitle={inv.invited_email}
                  leading={
                    <Avatar
                      seed={inv.invited_user_id}
                      label={display}
                      photoUrl={inv.invited_photo_url ?? null}
                      size={40}
                    />
                  }
                  borderLeft={{ width: 3, color: c.tint }}
                  trailing={
                    <Pressable
                      onPress={() => !isRevoking && onRevokeInvitation(inv)}
                      disabled={isRevoking}
                      accessibilityRole="button"
                      accessibilityLabel="Thu hồi lời mời"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <AppText variant="caption" weight="medium" tone="danger">
                        {isRevoking ? 'Đang thu hồi...' : 'Thu hồi'}
                      </AppText>
                    </Pressable>
                  }
                />
              );
            })
          )}
        </View>
      )}

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
      />
    </>
  );
});

const styles = StyleSheet.create({
  memberActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  memberTrailing: { alignItems: 'flex-end', gap: 6 },
  pillRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  addVirtualSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  inviteBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  inviteBannerGradient: {
    borderRadius: 14,
  },
  inviteInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  inviteText: {
    flex: 1,
  },
  inviteCode: {
    letterSpacing: 2,
  },
  pendingSection: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  pendingLabel: { marginBottom: 8, marginTop: 4 },
  inlineLoading: { paddingVertical: 12, alignItems: 'flex-start' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
});

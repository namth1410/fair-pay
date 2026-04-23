import { LinearGradient } from 'expo-linear-gradient';
import { Button, ScrollShadow } from 'heroui-native';
import { Share2 } from 'lucide-react-native';
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupMember, JoinRequest } from '../../services/group.service';
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
  inviteCode?: string;
  isAdmin: boolean;
  onShare: () => void;
  onKick: (member: GroupMember) => void;
  onApprove: (req: JoinRequest) => void;
  onReject: (req: JoinRequest) => void;
  onAddVirtual: () => void;
}

export const MembersTab = React.memo(function MembersTab({
  members, pendingRequests, inviteCode, isAdmin,
  onShare, onKick, onApprove, onReject, onAddVirtual,
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
            <RolePill role={item.role as Role} color={roleColor[item.role as Role]} />
          </View>
          {isAdmin && item.role !== 'admin' ? (
            <View style={styles.memberActions}>
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
      {/* Invite banner — gradient pink */}
      <Pressable
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel="Chia sẻ mã mời"
        style={styles.inviteBanner}
      >
        <GradientHero fromColor={c.accentSoft} toColor={c.tint} gradientDirection="horizontal" style={styles.inviteBannerGradient}>
          <View style={styles.inviteInner}>
            <View style={styles.inviteText}>
              <AppText variant="meta" tone="muted">Mã mời</AppText>
              <AppText variant="title" weight="bold" tone="primary" style={styles.inviteCode}>
                {inviteCode}
              </AppText>
            </View>
            <Share2 size={22} color={c.primaryStrong} />
          </View>
        </GradientHero>
      </Pressable>

      {/* Admin-only: thêm thành viên ảo */}
      {isAdmin && (
        <View style={styles.addVirtualSection}>
          <Button variant="secondary" size="sm" onPress={onAddVirtual}>
            <Button.Label>+ Thêm thành viên ảo</Button.Label>
          </Button>
        </View>
      )}

      {/* Pending join requests */}
      {isAdmin && pendingRequests.length > 0 && (
        <View style={styles.pendingSection}>
          <AppText variant="label" tone="muted" style={styles.pendingLabel}>
            Yêu cầu tham gia ({pendingRequests.length})
          </AppText>
          {pendingRequests.map((req) => (
            <AppCard
              key={req.id}
              title={req.display_name}
              subtitle="Đang chờ duyệt"
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
          ))}
        </View>
      )}

      <ScrollShadow LinearGradientComponent={LinearGradient}>
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
        />
      </ScrollShadow>
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
  list: { paddingHorizontal: 16, paddingBottom: 24 },
});

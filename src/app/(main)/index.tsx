import { useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import { Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AnimatedEntrance, AppCard, AppTextField, EmptyState, FormReveal, ListSkeleton } from '../../components/ui';
import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupWithMemberCount } from '../../services/group.service';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { formatVND } from '../../utils/format';

export default function HomeScreen() {
  const router = useRouter();
  const c = useAppTheme();

  const { groups, balanceSummary, isLoading, loadGroups, createGroup, joinByCode } =
    useGroupStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joinPendingGroup, setJoinPendingGroup] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroup(newGroupName.trim());
      setNewGroupName('');
      setShowCreate(false);
    } catch (e: any) {
      Alert.alert('L\u1ed7i', getErrorMessage(e));
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    try {
      const result = await joinByCode(inviteCode.trim());
      setInviteCode('');
      setShowJoin(false);
      // Lu\u00f4n l\u00e0 type: 'pending' \u2014 hi\u1ec7n banner th\u00f4ng b\u00e1o ch\u1edd duy\u1ec7t
      setJoinPendingGroup(result.group.name);
    } catch (e: any) {
      Alert.alert('L\u1ed7i', getErrorMessage(e));
    }
  };

  // \u2500\u2500 Badge t\u1ed5ng n\u1ee3 (BR-10) \u2500\u2500
  const renderTotalBadge = () => {
    const { total } = balanceSummary;
    if (total === 0) return null;

    const isPositive = total > 0;
    const badgeBg = isPositive ? c.successSoft : c.dangerSoft;
    const badgeColor = isPositive ? c.success : c.danger;
    const label = isPositive ? 'B\u1ea1n \u0111ang \u0111\u01b0\u1ee3c n\u1ee3' : 'B\u1ea1n \u0111ang n\u1ee3';
    const amount = formatVND(Math.abs(total));

    return (
      <AnimatedEntrance delay={0}>
        <View
          style={[styles.totalBadge, { backgroundColor: badgeBg }]}
          accessibilityLabel={`${label} ${amount} trên tất cả các nhóm`}
        >
          <Text style={[styles.totalBadgeLabel, { color: badgeColor }]}>
            {label}
          </Text>
          <Text style={[styles.totalBadgeAmount, { color: badgeColor }]}>
            {amount}
          </Text>
          <Text style={[styles.totalBadgeHint, { color: badgeColor, opacity: 0.7 }]}>
          tr\u00ean t\u1ea5t c\u1ea3 c\u00e1c nh\u00f3m
          </Text>
        </View>
      </AnimatedEntrance>
    );
  };

  //\u2500\u2500 S\u1ed1 d\u01b0 user trong 1 group (BR-10) \u2500\u2500
  const renderGroupBalance = (groupId: string) => {
    const balance = balanceSummary.groupBalances[groupId];
    if (balance === undefined || balance === 0) return null;

    const isPositive = balance > 0;
    const color = isPositive ? c.success : c.danger;
    const sign = isPositive ? '+' : '';
    return (
      <Text style={[styles.groupBalance, { color }]}>
        {sign}{formatVND(balance)}
      </Text>
    );
  };

  const renderGroup = ({ item, index }: { item: GroupWithMemberCount; index: number }) => (
    <AnimatedEntrance delay={Math.min(index * 50, 500)}>
      <AppCard
        title={item.name}
        subtitle={`${item.member_count} th\u00e0nh vi\u00ean \u00b7 #${item.invite_code}`}
        onPress={() => router.push(`/(main)/groups/${item.id}`)}
        trailing={renderGroupBalance(item.id)}
      />
    </AnimatedEntrance>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Badge t\u1ed5ng n\u1ee3 \u2014 ch\u1ec9 hi\u1ec7n khi c\u00f3 n\u1ee3 (BR-10) */}
      {renderTotalBadge()}

      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          onPress={() => { setShowCreate(true); setShowJoin(false); }}
        >
          <Button.Label>T\u1ea1o nh\u00f3m</Button.Label>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => { setShowJoin(true); setShowCreate(false); }}
        >
          <Button.Label>Nh\u1eadp m\u00e3 m\u1eddi</Button.Label>
        </Button>
      </View>

      {/* Create group form */}
      <FormReveal isOpen={showCreate}>
        <AppTextField
          placeholder="T\u00ean nh\u00f3m m\u1edbi"
          value={newGroupName}
          onChangeText={setNewGroupName}
          autoFocus
        />
        <View style={styles.formActions}>
          <Button variant="ghost" size="sm" onPress={() => setShowCreate(false)}>
            <Button.Label>H\u1ee7y</Button.Label>
          </Button>
          <Button variant="primary" size="sm" onPress={handleCreate}>
            <Button.Label>T\u1ea1o</Button.Label>
          </Button>
        </View>
      </FormReveal>

      {/* Join group form */}
      <FormReveal isOpen={showJoin}>
        <AppTextField
          placeholder="Nh\u1eadp m\u00e3 m\u1eddi (VD: a1b2c3)"
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
          autoFocus
        />
        <View style={styles.formActions}>
          <Button variant="ghost" size="sm" onPress={() => setShowJoin(false)}>
            <Button.Label>H\u1ee7y</Button.Label>
          </Button>
          <Button variant="primary" size="sm" onPress={handleJoin}>
            <Button.Label>Tham gia</Button.Label>
          </Button>
        </View>
      </FormReveal>

      {/* Pending banner \u2014 hi\u1ec7n khi user v\u1eeba g\u1eedi join request (BR-09) */}
      {joinPendingGroup && (
        <View style={[styles.pendingBanner, { backgroundColor: c.accentSoft }]}>
          <Text style={[styles.pendingTitle, { color: c.primary }]}>
            Y\u00eau c\u1ea7u \u0111\u00e3 g\u1eedi \u2014 ch\u1edd duy\u1ec7t
          </Text>
          <Text style={[styles.pendingMeta, { color: c.muted }]}>
            Nh\u00f3m "{joinPendingGroup}" c\u1ea7n x\u00e9t duy\u1ec7t tr\u01b0\u1edbc khi b\u1ea1n tr\u1edf th\u00e0nh th\u00e0nh vi\u00ean.
          </Text>
          <Pressable
            onPress={() => setJoinPendingGroup(null)}
            accessibilityRole="button"
            accessibilityLabel="Đã hiểu"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: c.primary, fontSize: 13, marginTop: 6 }}>
              \u0110\u00e3 hi\u1ec3u
            </Text>
          </Pressable>
        </View>
      )}

      {/* Group list */}
      {isLoading && groups.length === 0 ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={groups.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={loadGroups} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title="Ch\u01b0a c\u00f3 nh\u00f3m n\u00e0o"
              subtitle="T\u1ea1o nh\u00f3m m\u1edbi ho\u1eb7c nh\u1eadp m\u00e3 m\u1eddi \u0111\u1ec3 b\u1eaft \u0111\u1ea7u"
              action={{ label: "T\u1ea1o nh\u00f3m", onPress: () => { setShowCreate(true); setShowJoin(false); } }}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Badge t\u1ed5ng n\u1ee3
  totalBadge: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  totalBadgeLabel: { fontSize: 13, fontWeight: '500', fontFamily: fonts.medium },
  totalBadgeAmount: { fontSize: 26, fontWeight: '700', fontFamily: fonts.bold, marginTop: 2 },
  totalBadgeHint: { fontSize: 12, marginTop: 1 },

  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  groupBalance: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold },
  pendingBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
  },
  pendingTitle: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semibold },
  pendingMeta: { fontSize: 13, marginTop: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});

import { Clock } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import type { AuditLog } from '../../services/audit.service';
import { getActionLabel } from '../../services/audit.service';
import type { GroupMember } from '../../services/group.service';
import { AnimatedEntrance, AppCard, AppText, EmptyState } from '../ui';

interface HistoryTabProps {
  auditLogs: AuditLog[];
  members?: GroupMember[];
}

function getMemberName(id: string, members: GroupMember[]): string {
  return members.find((m) => m.id === id)?.display_name || '?';
}

function getActionDetail(log: AuditLog, members: GroupMember[]): string | undefined {
  const after = log.after_data;
  const before = log.before_data;

  if (log.action === 'expense.create' && after) {
    const title = after.title as string | undefined;
    const amount = after.amount as number | undefined;
    if (title && amount) return `"${title}" ${amount.toLocaleString('vi-VN')}₫`;
  }

  if (log.action === 'expense.delete' && before) {
    const title = before.title as string | undefined;
    const amount = before.amount as number | undefined;
    if (title && amount) return `"${title}" ${amount.toLocaleString('vi-VN')}₫`;
  }

  if (log.action === 'payment.create' && after) {
    const from = after.from as string | undefined;
    const to = after.to as string | undefined;
    const amount = after.amount as number | undefined;
    if (from && to && amount) {
      return `${getMemberName(from, members)} → ${getMemberName(to, members)} ${amount.toLocaleString('vi-VN')}₫`;
    }
  }

  if (log.action === 'payment.delete' && before) {
    const from = before.from as string | undefined;
    const to = before.to as string | undefined;
    const amount = before.amount as number | undefined;
    if (from && to && amount) {
      return `${getMemberName(from, members)} → ${getMemberName(to, members)} ${amount.toLocaleString('vi-VN')}₫`;
    }
  }

  return undefined;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Section {
  title: string;
  data: AuditLog[];
}

export const HistoryTab = React.memo(function HistoryTab({ auditLogs, members = [] }: HistoryTabProps) {
  const sections = useMemo<Section[]>(() => {
    const map = new Map<string, AuditLog[]>();
    for (const log of auditLogs) {
      const key = formatDate(log.created_at);
      const arr = map.get(key);
      if (arr) arr.push(log);
      else map.set(key, [log]);
    }
    return Array.from(map, ([title, data]) => ({ title, data }));
  }, [auditLogs]);

  if (auditLogs.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState icon={Clock} title="Chưa có lịch sử thay đổi" />
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <AppText variant="label" tone="muted">{section.title}</AppText>
        </View>
      )}
      renderItem={({ item, index }) => {
        const detail = getActionDetail(item, members);
        return (
          <AnimatedEntrance delay={Math.min(index * 50, 500)}>
            <AppCard
              title={`${item.actor_name} — ${getActionLabel(item.action)}`}
              subtitle={detail}
              trailing={
                <AppText variant="meta" tone="muted">{formatTime(item.created_at)}</AppText>
              }
            />
          </AnimatedEntrance>
        );
      }}
    />
  );
});

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  sectionHeader: {
    paddingVertical: 8,
    paddingTop: 12,
  },
});

// Barrel export cho repository layer.
// Stores import từ đây: `import { expenseRepo } from '@/repositories';`

export * as userRepo from './user.repo';
export * as groupRepo from './group.repo';
export * as groupMemberRepo from './groupMember.repo';
export * as tripRepo from './trip.repo';
export * as expenseRepo from './expense.repo';
export * as paymentRepo from './payment.repo';
export * as presetRepo from './preset.repo';
export * as pinnedTripRepo from './pinnedTrip.repo';
export * as notificationRepo from './notification.repo';
export * as groupInvitationRepo from './groupInvitation.repo';
export * as auditLogRepo from './auditLog.repo';
export * as settlementRepo from './settlement.repo';

// Re-export domain types cho convenience
export type { User, UserSettings } from './user.repo';
export type { Group } from './group.repo';
export type { GroupMember } from './groupMember.repo';
export type { Trip } from './trip.repo';
export type {
  Expense,
  ExpenseSplit,
  ExpenseWithSplits,
  ExpenseCategory,
} from './expense.repo';
export type { Payment } from './payment.repo';
export type { Preset, SplitType } from './preset.repo';
export type { PinnedTrip } from './pinnedTrip.repo';
export type { Notification } from './notification.repo';
export type { GroupInvitation } from './groupInvitation.repo';
export type { AuditLog } from './auditLog.repo';
export type { Settlement } from './settlement.repo';

import { memo } from 'react';

import { Money } from '../ui';

interface GroupBalancePillProps {
  balance: number;
}

export const GroupBalancePill = memo(function GroupBalancePill({ balance }: GroupBalancePillProps) {
  if (balance === 0) return null;
  return (
    <Money
      value={Math.abs(balance)}
      variant="compact"
      tone={balance > 0 ? 'success' : 'danger'}
      showSign
    />
  );
});

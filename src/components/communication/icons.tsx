import { ChatCircleIcon, CheckCircleIcon, CoinsIcon, ConfettiIcon, EnvelopeIcon, HandCoinsIcon, ListChecksIcon, MegaphoneIcon, ShieldCheckIcon, SparkleIcon, UserPlusIcon, WalletIcon, WarningIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { IconName } from './model';

const map: Record<IconName, ReactNode> = {
  sparkles: <SparkleIcon />,
  mail: <EnvelopeIcon />,
  'user-plus': <UserPlusIcon />,
  coins: <CoinsIcon />,
  'list-checks': <ListChecksIcon />,
  'check-circle': <CheckCircleIcon />,
  party: <ConfettiIcon />,
  wallet: <WalletIcon />,
  'shield-check': <ShieldCheckIcon />,
  alert: <WarningIcon />,
  megaphone: <MegaphoneIcon />,
  message: <ChatCircleIcon />,
  'hand-coins': <HandCoinsIcon />,
};

export const iconFor = (name: IconName) => map[name];

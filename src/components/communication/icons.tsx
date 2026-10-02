import { AlertTriangle, CheckCircle2, Coins, HandCoins, ListChecks, Mail, Megaphone, MessageCircle, PartyPopper, ShieldCheck, Sparkles, UserPlus, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { IconName } from './model';

const map: Record<IconName, ReactNode> = {
  sparkles: <Sparkles />,
  mail: <Mail />,
  'user-plus': <UserPlus />,
  coins: <Coins />,
  'list-checks': <ListChecks />,
  'check-circle': <CheckCircle2 />,
  party: <PartyPopper />,
  wallet: <Wallet />,
  'shield-check': <ShieldCheck />,
  alert: <AlertTriangle />,
  megaphone: <Megaphone />,
  message: <MessageCircle />,
  'hand-coins': <HandCoins />,
};

export const iconFor = (name: IconName) => map[name];

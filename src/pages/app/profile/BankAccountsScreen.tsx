import { Landmark, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useBankAccounts, useRemoveBankAccount } from '../../../api/hooks';
import { Empty, Loading } from '../../../components/app/States';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { AddBankSheet } from '../wallet/AddBankSheet';
import { Screen } from '../Screen';
import '../../../components/app/app-ui.css';

export function BankAccountsScreen() {
  const accounts = useBankAccounts();
  const remove = useRemoveBankAccount();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <Screen
      topBar={<TopBar backTo="/app/profile" title="Bank accounts" />}
      footer={
        <Button fullWidth iconLeft={<Plus />} onClick={() => setOpen(true)}>
          Add a bank account
        </Button>
      }
    >
      {accounts.isLoading ? (
        <Loading />
      ) : !accounts.data?.length ? (
        <Empty icon={<Landmark />} title="No bank accounts yet" body="Add an account in your name to withdraw from your wallet." />
      ) : (
        <div className="menu" style={{ marginTop: 16 }}>
          {accounts.data.map((a) => (
            <div key={a.id} className="menu__row">
              <span className="menu__icon tint--lilac"><Landmark /></span>
              <span className="menu__text">
                <span className="menu__title">
                  {a.bankName} {a.isDefault && <Badge tone="accent">Default</Badge>}
                </span>
                <span className="menu__sub num">
                  {a.accountName} · ••{a.last4}
                </span>
              </span>
              <IconButton
                label={`Remove ${a.bankName} account`}
                icon={<Trash2 />}
                variant="ghost"
                onClick={() => remove.mutate(a.id, { onSuccess: () => toast('Account removed') })}
              />
            </div>
          ))}
        </div>
      )}
      <AddBankSheet open={open} onClose={() => setOpen(false)} onAdded={() => toast('Bank account added')} />
    </Screen>
  );
}

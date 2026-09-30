import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BankAccountDTO } from '../../../../shared/contracts';
import { api, ApiError } from '../../../api/client';
import { useAddBankAccount, useBanks } from '../../../api/hooks';
import { PinSheet } from '../../../components/app/PinSheet';
import { Notice } from '../../../components/app/States';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { clearDraft, readDraft, useSaveDraft } from '../../../lib/drafts';
import './wallet.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded?: (acct: BankAccountDTO) => void;
}

/** Bank + 10-digit number, resolved to the account holder's name before anything is saved. */
export function AddBankSheet({ open, onClose, onAdded }: Props) {
  const banks = useBanks();
  const add = useAddBankAccount();
  const [bankCode, setBankCode] = useState('');
  const [number, setNumber] = useState('');
  const [resolved, setResolved] = useState<{ accountName: string; matchesProfile: boolean } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string>();
  const [pinOpen, setPinOpen] = useState(false);

  // Coming back to the sheet after a refresh or a trip to your banking app picks up where you were.
  useEffect(() => {
    if (!open) return;
    const d = readDraft<{ bankCode: string; number: string }>('add-bank');
    if (d) {
      setBankCode(d.bankCode);
      setNumber(d.number);
    }
  }, [open]);
  useSaveDraft('add-bank', { bankCode, number }, !bankCode && !number, open);

  useEffect(() => {
    setResolved(null);
    setError(undefined);
    if (!bankCode || number.length !== 10) return;
    let live = true;
    setResolving(true);
    api<{ accountName: string; matchesProfile: boolean }>('POST', '/bank-accounts/resolve', { bankCode, accountNumber: number })
      .then((r) => live && setResolved(r))
      .catch((e: ApiError) => live && setError(e.message))
      .finally(() => live && setResolving(false));
    return () => {
      live = false;
    };
  }, [bankCode, number]);

  const reset = () => {
    clearDraft('add-bank');
    setBankCode('');
    setNumber('');
    setResolved(null);
    setError(undefined);
  };

  return (
    <>
      <Modal
        open={open && !pinOpen}
        onClose={onClose}
        title="Add a bank account"
        description="Withdrawals can only go to an account in your own name."
        footer={
          <Button fullWidth disabled={!resolved?.matchesProfile} loading={resolving} onClick={() => setPinOpen(true)}>
            Save account
          </Button>
        }
      >
        <div className="bank-form">
          <div className="field">
            <label className="field__label" htmlFor="bank">
              Bank
            </label>
            <div className="field__control">
              <select id="bank" className="field__input bank-form__select" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                <option value="">Choose your bank</option>
                {banks.data?.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Input
            label="Account number"
            inputMode="numeric"
            placeholder="0123456789"
            maxLength={10}
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="num"
            hint={number.length && number.length < 10 ? `${10 - number.length} more digits` : undefined}
          />
          {resolved && (
            <Notice tone={resolved.matchesProfile ? 'accent' : 'danger'} icon={resolved.matchesProfile ? <CheckCircle2 /> : <AlertTriangle />}>
              <strong>{resolved.accountName}</strong>
              {resolved.matchesProfile ? '' : '. This name doesn’t match yours, so it can’t receive withdrawals.'}
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      </Modal>
      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Confirm with your PIN"
        description={resolved ? <>Save {resolved.accountName} for withdrawals.</> : undefined}
        onSubmit={async (pin) => {
          const acct = await add.mutateAsync({ bankCode, accountNumber: number, pin });
          setPinOpen(false);
          reset();
          onAdded?.(acct);
          onClose();
        }}
      />
    </>
  );
}

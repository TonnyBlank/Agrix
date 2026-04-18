import { CreditCard, Phone, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizePhoneInput } from "@/lib/inputSanitizers";

type MpesaPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  amountLabel?: string;
  amountValue?: string | null;
  referenceLabel?: string;
  referenceValue?: string | null;
  phoneNumber: string;
  onPhoneChange: (value: string) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmPendingLabel?: string;
  busy?: boolean;
  errorMessage?: string | null;
};

export default function MpesaPaymentDialog(props: MpesaPaymentDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    amountLabel = "Amount",
    amountValue,
    referenceLabel,
    referenceValue,
    phoneNumber,
    onPhoneChange,
    onConfirm,
    confirmLabel = "Send M-Pesa Prompt",
    confirmPendingLabel = "Sending prompt...",
    busy = false,
    errorMessage,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] sm:max-w-lg">
        <DialogHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <CreditCard className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
          <DialogDescription className="leading-6">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/80 dark:text-emerald-300/80">
                  Payment Method
                </p>
                <p className="mt-2 font-display text-xl font-bold text-foreground">M-Pesa STK Push</p>
              </div>
              <div className="rounded-2xl bg-white/90 p-2.5 text-emerald-700 shadow-sm dark:bg-background/80 dark:text-emerald-300">
                <Smartphone className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              {amountValue ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{amountLabel}</span>
                  <span className="font-semibold text-foreground">{amountValue}</span>
                </div>
              ) : null}
              {referenceLabel && referenceValue ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{referenceLabel}</span>
                  <span className="text-right font-medium text-foreground">{referenceValue}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mpesa-dialog-phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              M-Pesa Number
            </Label>
            <Input
              id="mpesa-dialog-phone"
              value={phoneNumber}
              onChange={(event) => onPhoneChange(sanitizePhoneInput(event.target.value))}
              type="tel"
              inputMode="tel"
              placeholder="0712345678 or 254712345678"
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Use the Safaricom line that should receive the payment prompt.
            </p>
            {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl" disabled={busy} onClick={onConfirm}>
            {busy ? confirmPendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

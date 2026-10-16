'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CUSTOMER_TIERS, TIER_LABELS, tierIdProblem, type CustomerTier } from '@/lib/customer-tier';

/** Which IDs a tier makes compulsory, for the BVN and NIN labels. */
export function tierRequires(tier: string): { bvn: boolean; nin: boolean; either: boolean } {
  return { bvn: tier === '3', nin: tier === '3', either: tier === '2' };
}

/** The tier problem for a form's current values, or null. */
export function tierFormProblem(tier: string, bvn: string, nationalId: string): string | null {
  if (!tier) return 'Choose the customer tier';
  return tierIdProblem(Number(tier) as CustomerTier, bvn, nationalId);
}

/** Tier 1, 2 or 3, with a line saying which IDs it needs. */
export function CustomerTierField({
  value,
  onChange,
}: {
  value: string;
  onChange: (tier: string) => void;
}) {
  const hint =
    value === '3'
      ? 'Both BVN and NIN are required.'
      : value === '2'
        ? 'A BVN or a NIN is required.'
        : value === '1'
          ? 'No BVN or NIN needed.'
          : 'The tier decides which IDs are required.';
  return (
    <div className="space-y-1.5">
      <Label>
        Customer Tier <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select tier" />
        </SelectTrigger>
        <SelectContent>
          {CUSTOMER_TIERS.map((t) => (
            <SelectItem key={t} value={String(t)}>
              {TIER_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

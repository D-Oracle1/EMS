'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, PiggyBank, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createCustomerForm } from '@/actions/form.actions';

/** Make a savings application form of one's own, or any other form. */
export function NewFormButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const newSavingsForm = async () => {
    setBusy(true);
    const result = await createCustomerForm('SAVINGS_APPLICATION');
    setBusy(false);
    if (!result.success || !result.data) return toast.error(result.error ?? 'Could not create the form');
    toast.success('Savings form created. Review it, then open it to share.');
    router.push(`/forms/${result.data.id}/edit`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={newSavingsForm} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PiggyBank className="mr-2 h-4 w-4" />}
        New savings form
      </Button>
      <Button variant="outline" asChild>
        <Link href="/forms"><Plus className="mr-2 h-4 w-4" />Other forms</Link>
      </Button>
    </div>
  );
}

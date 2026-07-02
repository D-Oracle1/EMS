'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { searchCustomers } from '@/actions/customer.actions';
import type { NewCustomerInput } from '@/lib/customer-registration';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewCustomerData {
  customerType: string;
  title: string;
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  dateOfBirth: string;
  gender: string;
  occupation: string;
  employer: string;
  monthlyIncome: string;
  bvn: string;
  nationalId: string;
  nokName: string;
  nokRelationship: string;
  nokPhone: string;
  nokAddress: string;
  companyName: string;
  rcNumber: string;
}

export const blankNewCustomer: NewCustomerData = {
  customerType: 'INDIVIDUAL',
  title: '',
  firstName: '',
  lastName: '',
  middleName: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  dateOfBirth: '',
  gender: '',
  occupation: '',
  employer: '',
  monthlyIncome: '',
  bvn: '',
  nationalId: '',
  nokName: '',
  nokRelationship: '',
  nokPhone: '',
  nokAddress: '',
  companyName: '',
  rcNumber: '',
};

export interface CustomerSelection {
  mode: 'existing' | 'new';
  customerId: string; // set when mode === 'existing'
  customer: { id: string; firstName: string; lastName: string; customerNumber: string } | null;
  newCustomer: NewCustomerData;
}

export const emptyCustomerSelection: CustomerSelection = {
  mode: 'existing',
  customerId: '',
  customer: null,
  newCustomer: blankNewCustomer,
};

/** Validate a selection; returns an error message or null. */
export function validateCustomerSelection(sel: CustomerSelection): string | null {
  if (sel.mode === 'existing') {
    if (!sel.customerId) return 'Please select an existing customer';
    return null;
  }
  const nc = sel.newCustomer;
  if (!nc.firstName.trim() || !nc.lastName.trim()) return 'New customer requires first and last name';
  if (!nc.phone.trim()) return 'New customer requires a phone number';
  if (!nc.address.trim()) return 'New customer requires an address';
  if (nc.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nc.email)) return 'New customer email is invalid';
  return null;
}

/** Map a selection to the { customerId?, newCustomer? } shape server actions expect. */
export function toActionCustomer(sel: CustomerSelection): {
  customerId?: string;
  newCustomer?: NewCustomerInput;
} {
  if (sel.mode === 'existing') return { customerId: sel.customerId };
  const nc = sel.newCustomer;
  return {
    newCustomer: {
      customerType: nc.customerType,
      title: nc.title || undefined,
      firstName: nc.firstName.trim(),
      lastName: nc.lastName.trim(),
      middleName: nc.middleName.trim() || undefined,
      phone: nc.phone.trim(),
      email: nc.email.trim() || undefined,
      address: nc.address.trim(),
      city: nc.city.trim() || undefined,
      state: nc.state.trim() || undefined,
      dateOfBirth: nc.dateOfBirth || undefined,
      gender: nc.gender || undefined,
      occupation: nc.occupation.trim() || undefined,
      employer: nc.employer.trim() || undefined,
      monthlyIncome: nc.monthlyIncome ? parseFloat(nc.monthlyIncome) : undefined,
      bvn: nc.bvn.trim() || undefined,
      nationalId: nc.nationalId.trim() || undefined,
      nokName: nc.nokName.trim() || undefined,
      nokRelationship: nc.nokRelationship || undefined,
      nokPhone: nc.nokPhone.trim() || undefined,
      nokAddress: nc.nokAddress.trim() || undefined,
      companyName: nc.companyName.trim() || undefined,
      rcNumber: nc.rcNumber.trim() || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomerPicker({
  value,
  onChange,
}: {
  value: CustomerSelection;
  onChange: (sel: CustomerSelection) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { id: string; customerNumber: string; firstName: string; lastName: string; phone: string; email: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMode = (mode: 'existing' | 'new') => {
    if (mode === 'new') {
      onChange({ ...value, mode, customerId: '', customer: null });
    } else {
      onChange({ ...value, mode });
    }
  };
  const updateNew = (field: keyof NewCustomerData, v: string) =>
    onChange({ ...value, newCustomer: { ...value.newCustomer, [field]: v } });

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await searchCustomers(query);
        setResults(r as never);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const nc = value.newCustomer;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="space-y-2">
        <Label>Customer</Label>
        <div className="inline-flex rounded-md border p-0.5 text-sm bg-muted/30">
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 transition-colors ${
              value.mode === 'existing' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Existing
          </button>
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 transition-colors ${
              value.mode === 'new' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            New customer
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          New customer details are automatically registered as a customer record.
        </p>
      </div>

      {/* Existing search */}
      {value.mode === 'existing' && (
        <div className="space-y-2" ref={boxRef}>
          {value.customer ? (
            <div className="flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2">
              <div className="flex-1 text-sm">
                <span className="font-medium">
                  {value.customer.firstName} {value.customer.lastName}
                </span>
                <span className="text-muted-foreground ml-2">({value.customer.customerNumber})</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onChange({ ...value, customerId: '', customer: null });
                  setQuery('');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setShowDropdown(true)}
                placeholder="Search by name, customer number, or phone…"
                className="pl-9"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {showDropdown && results.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
                  {results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => {
                        onChange({
                          ...value,
                          customerId: c.id,
                          customer: {
                            id: c.id,
                            customerNumber: c.customerNumber,
                            firstName: c.firstName,
                            lastName: c.lastName,
                          },
                        });
                        setShowDropdown(false);
                        setQuery('');
                      }}
                    >
                      <div className="font-medium">
                        {c.firstName} {c.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.customerNumber} {c.phone ? `| ${c.phone}` : ''} {c.email ? `| ${c.email}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && query.length >= 2 && !searching && results.length === 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg px-3 py-3 text-sm text-muted-foreground text-center">
                  No customers found — switch to “New customer” to register them.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* New customer inline registration */}
      {value.mode === 'new' && (
        <div className="space-y-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <UserPlus className="h-4 w-4" />
            New Customer Registration
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Customer Type</Label>
              <Select value={nc.customerType} onValueChange={(v) => updateNew('customerType', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="CORPORATE">Corporate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Select value={nc.title} onValueChange={(v) => updateNew('title', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mr">Mr</SelectItem>
                  <SelectItem value="Mrs">Mrs</SelectItem>
                  <SelectItem value="Ms">Ms</SelectItem>
                  <SelectItem value="Dr">Dr</SelectItem>
                  <SelectItem value="Chief">Chief</SelectItem>
                  <SelectItem value="Alhaji">Alhaji</SelectItem>
                  <SelectItem value="Alhaja">Alhaja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {nc.customerType === 'CORPORATE' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Company Name</Label>
                <Input value={nc.companyName} onChange={(e) => updateNew('companyName', e.target.value)} placeholder="Company name" />
              </div>
              <div className="space-y-1.5">
                <Label>RC Number</Label>
                <Input value={nc.rcNumber} onChange={(e) => updateNew('rcNumber', e.target.value)} placeholder="RC number" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>First Name <span className="text-destructive">*</span></Label>
              <Input value={nc.firstName} onChange={(e) => updateNew('firstName', e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-1.5">
              <Label>Middle Name</Label>
              <Input value={nc.middleName} onChange={(e) => updateNew('middleName', e.target.value)} placeholder="Middle name" />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name <span className="text-destructive">*</span></Label>
              <Input value={nc.lastName} onChange={(e) => updateNew('lastName', e.target.value)} placeholder="Last name" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone <span className="text-destructive">*</span></Label>
              <Input type="tel" value={nc.phone} onChange={(e) => updateNew('phone', e.target.value)} placeholder="e.g. 08012345678" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={nc.email} onChange={(e) => updateNew('email', e.target.value)} placeholder="customer@example.com" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Street Address <span className="text-destructive">*</span></Label>
            <Input value={nc.address} onChange={(e) => updateNew('address', e.target.value)} placeholder="Full street address" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={nc.city} onChange={(e) => updateNew('city', e.target.value)} placeholder="City" />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={nc.state} onChange={(e) => updateNew('state', e.target.value)} placeholder="State" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Occupation</Label>
              <Input value={nc.occupation} onChange={(e) => updateNew('occupation', e.target.value)} placeholder="Occupation" />
            </div>
            <div className="space-y-1.5">
              <Label>BVN</Label>
              <Input value={nc.bvn} onChange={(e) => updateNew('bvn', e.target.value)} placeholder="11-digit BVN" maxLength={11} />
            </div>
            <div className="space-y-1.5">
              <Label>National ID (NIN)</Label>
              <Input value={nc.nationalId} onChange={(e) => updateNew('nationalId', e.target.value)} placeholder="National ID" />
            </div>
          </div>

          <Separator />
          <p className="text-xs font-medium text-muted-foreground">Next of Kin (optional)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={nc.nokName} onChange={(e) => updateNew('nokName', e.target.value)} placeholder="Next of kin name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input type="tel" value={nc.nokPhone} onChange={(e) => updateNew('nokPhone', e.target.value)} placeholder="Phone number" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

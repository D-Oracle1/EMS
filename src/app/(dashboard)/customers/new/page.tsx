'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  CreditCard,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createCustomer } from '@/actions/customer.actions';

interface FormData {
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

const initialFormData: FormData = {
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

export default function NewCustomerPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!form.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!form.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!form.phone.trim()) newErrors.phone = 'Phone number is required';
    if (!form.address.trim()) newErrors.address = 'Address is required';
    if (!form.customerType) newErrors.customerType = 'Customer type is required';

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Invalid email address';
    }

    if (form.customerType === 'CORPORATE' && !form.companyName.trim()) {
      newErrors.companyName = 'Company name is required for corporate customers';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    startTransition(async () => {
      const result = await createCustomer({
        customerType: form.customerType,
        title: form.title || undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        middleName: form.middleName.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim(),
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        occupation: form.occupation.trim() || undefined,
        employer: form.employer.trim() || undefined,
        monthlyIncome: form.monthlyIncome ? parseFloat(form.monthlyIncome) : undefined,
        bvn: form.bvn.trim() || undefined,
        nationalId: form.nationalId.trim() || undefined,
        nokName: form.nokName.trim() || undefined,
        nokRelationship: form.nokRelationship.trim() || undefined,
        nokPhone: form.nokPhone.trim() || undefined,
        nokAddress: form.nokAddress.trim() || undefined,
        companyName: form.companyName.trim() || undefined,
        rcNumber: form.rcNumber.trim() || undefined,
      });

      if (result.success && result.data) {
        toast.success(result.message || 'Customer created successfully');
        router.push(`/customers/${result.data.id}`);
      } else {
        toast.error(result.error || 'Failed to create customer');
      }
    });
  };

  const isIndividual = form.customerType === 'INDIVIDUAL';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Customer</h1>
          <p className="text-muted-foreground">
            Register a new customer account
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerType">Type *</Label>
                <Select
                  value={form.customerType}
                  onValueChange={(value) => updateField('customerType', value)}
                >
                  <SelectTrigger id="customerType">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                    <SelectItem value="CORPORATE">Corporate</SelectItem>
                  </SelectContent>
                </Select>
                {errors.customerType && (
                  <p className="text-xs text-destructive">{errors.customerType}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal / Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              {isIndividual ? 'Personal Information' : 'Company & Contact Information'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isIndividual && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      value={form.companyName}
                      onChange={(e) => updateField('companyName', e.target.value)}
                      placeholder="Enter company name"
                    />
                    {errors.companyName && (
                      <p className="text-xs text-destructive">{errors.companyName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rcNumber">RC Number</Label>
                    <Input
                      id="rcNumber"
                      value={form.rcNumber}
                      onChange={(e) => updateField('rcNumber', e.target.value)}
                      placeholder="Enter RC number"
                    />
                  </div>
                </div>
                <Separator className="mb-4" />
                <p className="text-sm text-muted-foreground mb-4">Contact Person Details</p>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Select
                  value={form.title}
                  onValueChange={(value) => updateField('title', value)}
                >
                  <SelectTrigger id="title">
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

              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  placeholder="Enter first name"
                />
                {errors.firstName && (
                  <p className="text-xs text-destructive">{errors.firstName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="middleName">Middle Name</Label>
                <Input
                  id="middleName"
                  value={form.middleName}
                  onChange={(e) => updateField('middleName', e.target.value)}
                  placeholder="Enter middle name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  placeholder="Enter last name"
                />
                {errors.lastName && (
                  <p className="text-xs text-destructive">{errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => updateField('dateOfBirth', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={form.gender}
                  onValueChange={(value) => updateField('gender', value)}
                >
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="e.g. 08012345678"
                />
                {errors.phone && (
                  <p className="text-xs text-destructive">{errors.phone}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="customer@example.com"
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Street Address *</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="Enter full street address"
                />
                {errors.address && (
                  <p className="text-xs text-destructive">{errors.address}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    placeholder="Enter city"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={form.state}
                    onChange={(e) => updateField('state', e.target.value)}
                    placeholder="Enter state"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employment & Financial */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Employment & Financial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input
                  id="occupation"
                  value={form.occupation}
                  onChange={(e) => updateField('occupation', e.target.value)}
                  placeholder="Enter occupation"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employer">Employer</Label>
                <Input
                  id="employer"
                  value={form.employer}
                  onChange={(e) => updateField('employer', e.target.value)}
                  placeholder="Enter employer name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlyIncome">Monthly Income (NGN)</Label>
                <Input
                  id="monthlyIncome"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthlyIncome}
                  onChange={(e) => updateField('monthlyIncome', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Identity Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Identity Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bvn">BVN (Bank Verification Number)</Label>
                <Input
                  id="bvn"
                  value={form.bvn}
                  onChange={(e) => updateField('bvn', e.target.value)}
                  placeholder="Enter 11-digit BVN"
                  maxLength={11}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nationalId">National ID (NIN)</Label>
                <Input
                  id="nationalId"
                  value={form.nationalId}
                  onChange={(e) => updateField('nationalId', e.target.value)}
                  placeholder="Enter National ID number"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next of Kin */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Next of Kin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nokName">Full Name</Label>
                <Input
                  id="nokName"
                  value={form.nokName}
                  onChange={(e) => updateField('nokName', e.target.value)}
                  placeholder="Enter next of kin name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nokRelationship">Relationship</Label>
                <Select
                  value={form.nokRelationship}
                  onValueChange={(value) => updateField('nokRelationship', value)}
                >
                  <SelectTrigger id="nokRelationship">
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Spouse">Spouse</SelectItem>
                    <SelectItem value="Parent">Parent</SelectItem>
                    <SelectItem value="Child">Child</SelectItem>
                    <SelectItem value="Sibling">Sibling</SelectItem>
                    <SelectItem value="Relative">Relative</SelectItem>
                    <SelectItem value="Friend">Friend</SelectItem>
                    <SelectItem value="Colleague">Colleague</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nokPhone">Phone Number</Label>
                <Input
                  id="nokPhone"
                  type="tel"
                  value={form.nokPhone}
                  onChange={(e) => updateField('nokPhone', e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nokAddress">Address</Label>
                <Input
                  id="nokAddress"
                  value={form.nokAddress}
                  onChange={(e) => updateField('nokAddress', e.target.value)}
                  placeholder="Enter address"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/customers">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            <Save className="h-4 w-4 mr-2" />
            {isPending ? 'Creating Customer...' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}

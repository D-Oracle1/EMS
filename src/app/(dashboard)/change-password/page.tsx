'use client';

import { useState, useTransition } from 'react';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { changePassword } from '@/actions/auth.actions';
import type { SessionUser } from '@/types';

export default function ChangePasswordPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const isForcedChange = user?.mustChangePassword;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    if (password.length < 8) errors.push('Must be at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('Must contain an uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Must contain a lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Must contain a number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('Must contain a special character');
    return errors;
  };

  const passwordErrors = newPassword ? validatePassword(newPassword) : [];
  const passwordsMatch = newPassword === confirmPassword;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    if (passwordErrors.length > 0) {
      toast.error('Please fix password requirements');
      return;
    }
    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }
    if (currentPassword === newPassword) {
      toast.error('New password must be different from current password');
      return;
    }

    startTransition(async () => {
      const result = await changePassword(currentPassword, newPassword);

      if (result.success) {
        toast.success('Password changed successfully. Please sign in with your new password.');
        // Sign out to refresh the JWT with mustChangePassword: false
        setTimeout(() => {
          signOut({ callbackUrl: '/login' });
        }, 1500);
      } else {
        toast.error(result.error || 'Failed to change password');
      }
    });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Change Password</h1>
        <p className="text-muted-foreground">
          Update your account password
        </p>
      </div>

      {isForcedChange && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You must change your password before accessing the system. This is required for security purposes.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Update Password
          </CardTitle>
          <CardDescription>
            Choose a strong password that you haven&apos;t used before.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current Password */}
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {newPassword && (
                <div className="space-y-1">
                  {passwordErrors.length > 0 ? (
                    passwordErrors.map((error) => (
                      <p key={error} className="text-xs text-red-500">
                        {error}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Password meets all requirements
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
              {confirmPassword && passwordsMatch && newPassword && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Passwords match
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                isPending ||
                !currentPassword ||
                passwordErrors.length > 0 ||
                !passwordsMatch ||
                !newPassword
              }
            >
              <Lock className="mr-2 h-4 w-4" />
              {isPending ? 'Changing Password...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password Requirements Info */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium mb-2">Password Requirements</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>Minimum 8 characters long</li>
            <li>At least one uppercase letter (A-Z)</li>
            <li>At least one lowercase letter (a-z)</li>
            <li>At least one number (0-9)</li>
            <li>At least one special character (!@#$%^&amp;* etc.)</li>
            <li>Must be different from your current password</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

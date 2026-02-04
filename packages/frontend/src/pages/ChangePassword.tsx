import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PasswordFormData>();

  const changePassword = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', data),
    onSuccess: () => {
      toast.success('Password changed successfully. Please log in again.');
      logout();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to change password');
    },
  });

  const onSubmit = (data: PasswordFormData) => {
    changePassword.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  const newPassword = watch('newPassword');

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Change Password</h1>
        <p className="text-gray-500">
          {user?.mustChangePassword
            ? 'You must change your password before continuing.'
            : 'Update your account password'}
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit(onSubmit)} className="card-body space-y-6">
          <div>
            <label className="label">Current Password</label>
            <input
              type="password"
              {...register('currentPassword', { required: 'Current password is required' })}
              className="input"
            />
            {errors.currentPassword && (
              <p className="text-sm text-red-600 mt-1">{errors.currentPassword.message}</p>
            )}
          </div>

          <div>
            <label className="label">New Password</label>
            <input
              type="password"
              {...register('newPassword', {
                required: 'New password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
                pattern: {
                  value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
                  message: 'Password must include uppercase, lowercase, number, and special character',
                },
              })}
              className="input"
            />
            {errors.newPassword && (
              <p className="text-sm text-red-600 mt-1">{errors.newPassword.message}</p>
            )}
          </div>

          <div>
            <label className="label">Confirm New Password</label>
            <input
              type="password"
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: (value) => value === newPassword || 'Passwords do not match',
              })}
              className="input"
            />
            {errors.confirmPassword && (
              <p className="text-sm text-red-600 mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            {!user?.mustChangePassword && (
              <button type="button" onClick={() => navigate(-1)} className="btn-outline flex-1">
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={changePassword.isPending}
              className="btn-primary flex-1"
            >
              {changePassword.isPending ? <LoadingSpinner size="sm" /> : 'Change Password'}
            </button>
          </div>
        </form>
      </div>

      <div className="text-sm text-gray-500">
        <p className="font-medium mb-2">Password Requirements:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>At least 8 characters long</li>
          <li>At least one uppercase letter</li>
          <li>At least one lowercase letter</li>
          <li>At least one number</li>
          <li>At least one special character (!@#$%^&*)</li>
        </ul>
      </div>
    </div>
  );
}

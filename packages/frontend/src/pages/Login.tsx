import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

interface LoginForm {
  email: string;
  password: string;
}

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError('');
    setIsLoading(true);
    try {
      await login(data.email, data.password);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary-600">Hylink EMS</h1>
          <h2 className="mt-2 text-xl text-gray-600">Enterprise Management System</h2>
          <p className="mt-2 text-sm text-gray-500">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card p-8 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="label">Email Address</label>
            <input
              type="email"
              {...register('email', { required: 'Email is required' })}
              className="input"
              placeholder="you@hylinkfinance.com"
            />
            {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              {...register('password', { required: 'Password is required' })}
              className="input"
            />
            {errors.password && <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary w-full py-3">
            {isLoading ? <LoadingSpinner size="sm" /> : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500">
          Hylink Finance Limited &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

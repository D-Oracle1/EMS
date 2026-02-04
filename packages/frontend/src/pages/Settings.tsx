import { useAuth } from '../contexts/AuthContext';

export default function Settings() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="card p-6">
        <h3 className="font-medium mb-4">Profile Information</h3>
        <dl className="grid grid-cols-2 gap-4">
          <div><dt className="text-sm text-gray-500">Name</dt><dd>{user?.firstName} {user?.lastName}</dd></div>
          <div><dt className="text-sm text-gray-500">Email</dt><dd>{user?.email}</dd></div>
          <div><dt className="text-sm text-gray-500">Role</dt><dd>{user?.role}</dd></div>
          <div><dt className="text-sm text-gray-500">Department</dt><dd>{user?.department}</dd></div>
        </dl>
      </div>
    </div>
  );
}

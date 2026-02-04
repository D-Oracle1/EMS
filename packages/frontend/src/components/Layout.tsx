import { Fragment, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Dialog, Transition, Menu } from '@headlessui/react';
import {
  HomeIcon,
  UsersIcon,
  BanknotesIcon,
  WalletIcon,
  DocumentChartBarIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  BuildingLibraryIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon, permission: null },
  { name: 'Customers', href: '/customers', icon: UsersIcon, permission: 'CUSTOMERS:READ' },
  { name: 'Loans', href: '/loans', icon: BanknotesIcon, permission: 'LOANS:READ' },
  { name: 'Savings', href: '/savings', icon: WalletIcon, permission: 'SAVINGS:READ' },
  { name: 'Fixed Deposits', href: '/fixed-deposits', icon: BuildingLibraryIcon, permission: 'FIXED_DEPOSITS:READ' },
  { name: 'Reports', href: '/reports', icon: DocumentChartBarIcon, permission: 'ACCOUNTS:REPORTS_VIEW' },
  { name: 'Staff', href: '/staff', icon: UserGroupIcon, permission: 'HR:STAFF_READ' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();

  const filteredNavigation = navigation.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/80" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4">
                  <div className="flex h-16 shrink-0 items-center">
                    <h1 className="text-xl font-bold text-primary-600">Hylink EMS</h1>
                  </div>
                  <nav className="flex flex-1 flex-col">
                    <ul role="list" className="flex flex-1 flex-col gap-y-1">
                      {filteredNavigation.map((item) => (
                        <li key={item.name}>
                          <NavLink
                            to={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                              clsx(
                                isActive ? 'sidebar-link-active' : 'sidebar-link-inactive',
                                'gap-x-3'
                              )
                            }
                          >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {item.name}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center">
            <h1 className="text-xl font-bold text-primary-600">Hylink EMS</h1>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-1">
              {filteredNavigation.map((item) => (
                <li key={item.name}>
                  <NavLink
                    to={item.href}
                    className={({ isActive }) =>
                      clsx(
                        isActive ? 'sidebar-link-active' : 'sidebar-link-inactive',
                        'gap-x-3'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {item.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-t border-gray-200 pt-4">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                clsx(
                  isActive ? 'sidebar-link-active' : 'sidebar-link-inactive',
                  'gap-x-3'
                )
              }
            >
              <Cog6ToothIcon className="h-5 w-5 shrink-0" />
              Settings
            </NavLink>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Top header */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          {/* Separator */}
          <div className="h-6 w-px bg-gray-200 lg:hidden" />

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1 items-center">
              <h2 className="text-lg font-semibold text-gray-900">
                Hylink Finance Limited
              </h2>
            </div>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* User menu */}
              <Menu as="div" className="relative">
                <Menu.Button className="flex items-center gap-x-2 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-medium">
                    {user?.firstName?.[0]}
                    {user?.lastName?.[0]}
                  </div>
                  <span className="hidden lg:flex lg:items-center">
                    <span className="text-sm font-medium text-gray-900">
                      {user?.firstName} {user?.lastName}
                    </span>
                    <ChevronDownIcon className="ml-2 h-4 w-4 text-gray-400" />
                  </span>
                </Menu.Button>

                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-lg bg-white py-2 shadow-lg ring-1 ring-gray-900/5 focus:outline-none">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-xs text-gray-500">Signed in as</p>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user?.email}
                      </p>
                      <p className="text-xs text-gray-500">{user?.role}</p>
                    </div>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => navigate('/settings')}
                          className={clsx(
                            active ? 'bg-gray-50' : '',
                            'flex w-full items-center gap-x-2 px-4 py-2 text-sm text-gray-700'
                          )}
                        >
                          <Cog6ToothIcon className="h-4 w-4" />
                          Settings
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => navigate('/change-password')}
                          className={clsx(
                            active ? 'bg-gray-50' : '',
                            'flex w-full items-center gap-x-2 px-4 py-2 text-sm text-gray-700'
                          )}
                        >
                          <ClipboardDocumentListIcon className="h-4 w-4" />
                          Change Password
                        </button>
                      )}
                    </Menu.Item>
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={logout}
                            className={clsx(
                              active ? 'bg-gray-50' : '',
                              'flex w-full items-center gap-x-2 px-4 py-2 text-sm text-red-600'
                            )}
                          >
                            <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                            Sign out
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6 px-4 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

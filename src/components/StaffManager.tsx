import React, { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { StaffRole } from '../types/domain';

const ROLE_DESCRIPTIONS: Array<{
  role: StaffRole;
  title: string;
  capabilities: string;
}> = [
  {
    role: 'owner',
    title: 'Restaurant Owner',
    capabilities: 'Full menu pricing, sales analytics, WiFi QR studio, staff roles, and order control.',
  },
  {
    role: 'manager',
    title: 'Store Manager',
    capabilities: 'Live menu pricing & stock, all kitchen/table orders, QR setup, and daily reports.',
  },
  {
    role: 'chef',
    title: 'Kitchen Chef',
    capabilities: 'Live Kitchen Display (New -> Preparing -> Ready) and instant Sold Out toggles.',
  },
  {
    role: 'waiter',
    title: 'Waitstaff / Server',
    capabilities: 'Table QR assistance, view Ready dishes, and mark delivered orders as Served.',
  },
];

export function StaffManager() {
  const {
    activeRestaurant,
    activeStaff,
    addStaffMember,
    toggleStaffActive,
    updateStaffRole,
  } = usePlatform();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('chef');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Enter a staff member full name (at least 2 characters).');
      return;
    }
    if (!email.includes('@') || email.trim().length < 5) {
      setError('Enter a valid work email address.');
      return;
    }
    addStaffMember({ name, email, role });
    setName('');
    setEmail('');
    setRole('waiter');
    setError(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Staff & Role Permissions
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Assign focused roles for {activeRestaurant.name} so kitchen and floor teams see only what they need.
        </p>
      </div>

      {/* Role clarity strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLE_DESCRIPTIONS.map((item) => (
          <div key={item.role} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{item.title}</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{item.capabilities}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Staff table */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              Team Roster ({activeStaff.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500 bg-slate-50/70">
                  <th className="py-3 px-5">Staff Member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-5 text-right">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {activeStaff.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-slate-900">{member.name}</p>
                      <p className="text-xs text-slate-500">{member.email}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        aria-label={`Change role for ${member.name}`}
                        value={member.role}
                        onChange={(e) => updateStaffRole(member.id, e.target.value as StaffRole)}
                        className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      >
                        <option value="owner">Owner</option>
                        <option value="manager">Manager</option>
                        <option value="chef">Kitchen Chef</option>
                        <option value="waiter">Waitstaff</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => toggleStaffActive(member.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                          member.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {member.active ? 'Active' : 'Suspended'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Invite staff form */}
        <form
          onSubmit={handleAdd}
          className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div>
            <h3 className="text-base font-semibold text-slate-900">Add Team Member</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Grant instant dashboard access by role.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="staff-name" className="block text-xs font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="staff-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Suresh Verma"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="staff-email" className="block text-xs font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="chef@restaurant.in"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="staff-role" className="block text-xs font-medium text-slate-700 mb-1">
              Assigned Role
            </label>
            <select
              id="staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="manager">Store Manager</option>
              <option value="chef">Kitchen Chef</option>
              <option value="waiter">Waitstaff / Server</option>
              <option value="owner">Co-Owner</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        </form>
      </div>
    </div>
  );
}

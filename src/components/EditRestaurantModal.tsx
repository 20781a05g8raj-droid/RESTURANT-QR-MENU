import React, { useEffect, useState } from 'react';
import { KeyRound, Save, Trash2, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { SubscriptionPlan, WifiSecurity } from '../types/domain';
import { validateRestaurantInput } from '../utils/restaurantLogic';

export function EditRestaurantModal() {
  const {
    editingRestaurant,
    setEditingRestaurant,
    updateRestaurant,
    deleteRestaurant,
    portalSession,
    restaurantAccountUsernames,
    restaurantAccountMeta,
    restaurants,
  } = usePlatform();

  const isSuperAdmin = portalSession?.role === 'super_admin';

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('Growth');
  const [active, setActive] = useState(true);
  const [tableCount, setTableCount] = useState('16');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState<WifiSecurity>('WPA');

  // Restaurant owner credentials (Super Admin sets/updates)
  const [ownerUsername, setOwnerUsername] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingRestaurant) return;
    setName(editingRestaurant.name);
    setCity(editingRestaurant.city);
    setCuisine(editingRestaurant.cuisine);
    setPlan(editingRestaurant.plan);
    setActive(editingRestaurant.active);
    setTableCount(String(editingRestaurant.tableCount));
    setWifiSsid(editingRestaurant.wifiSsid);
    setWifiPassword(editingRestaurant.wifiPassword);
    setWifiSecurity(editingRestaurant.wifiSecurity);
    setOwnerUsername(
      restaurantAccountUsernames[editingRestaurant.id] ?? editingRestaurant.ownerUsername ?? ''
    );
    setOwnerPassword('');
    setConfirmDelete(false);
    setError(null);
  }, [editingRestaurant, restaurantAccountUsernames]);

  if (!editingRestaurant) return null;

  const existingUsername =
    restaurantAccountUsernames[editingRestaurant.id] ?? editingRestaurant.ownerUsername ?? '';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedTables = Number(tableCount);
    const check = validateRestaurantInput({
      name,
      city,
      cuisine,
      wifiSsid,
      wifiPassword,
      tableCount: parsedTables,
    });
    if (!check.valid) {
      setError(check.error ?? 'Please check restaurant fields.');
      return;
    }

    if (isSuperAdmin && ownerUsername.trim() && !existingUsername && ownerPassword.length < 6) {
      setError('Set an initial password (min 6 characters) for the new Restaurant Owner username.');
      return;
    }

    setSaving(true);
    const res = await updateRestaurant(editingRestaurant.id, {
      name,
      city,
      cuisine,
      plan,
      active,
      tableCount: parsedTables,
      wifiSsid,
      wifiPassword,
      wifiSecurity,
      ownerUsername: isSuperAdmin ? ownerUsername : undefined,
      ownerPassword: isSuperAdmin && ownerPassword ? ownerPassword : undefined,
    });
    setSaving(false);

    if (!res.ok) {
      setError(res.error ?? 'Could not save restaurant changes.');
      return;
    }

    setEditingRestaurant(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    const res = await deleteRestaurant(editingRestaurant.id);
    setDeleting(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not delete restaurant.');
      setConfirmDelete(false);
      return;
    }
    setEditingRestaurant(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-restaurant-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="edit-restaurant-modal-title" className="text-lg font-bold text-slate-900">
              Edit Restaurant — {editingRestaurant.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Update outlet profile, guest WiFi settings{isSuperAdmin ? ', or Restaurant Owner login credentials.' : '.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingRestaurant(null)}
            aria-label="Close edit restaurant dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="edit-rest-name" className="block text-xs font-medium text-slate-700 mb-1">
                Restaurant / Hotel Name *
              </label>
              <input
                id="edit-rest-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="edit-rest-city" className="block text-xs font-medium text-slate-700 mb-1">
                City *
              </label>
              <input
                id="edit-rest-city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="edit-rest-cuisine" className="block text-xs font-medium text-slate-700 mb-1">
                Cuisine Type *
              </label>
              <input
                id="edit-rest-cuisine"
                type="text"
                required
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="edit-rest-ssid" className="block text-xs font-medium text-slate-700 mb-1">
                Guest WiFi SSID *
              </label>
              <input
                id="edit-rest-ssid"
                type="text"
                required
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="edit-rest-pass" className="block text-xs font-medium text-slate-700 mb-1">
                WiFi Password
              </label>
              <input
                id="edit-rest-pass"
                type="text"
                disabled={wifiSecurity === 'nopass'}
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label htmlFor="edit-rest-security" className="block text-xs font-medium text-slate-700 mb-1">
                WiFi Security
              </label>
              <select
                id="edit-rest-security"
                value={wifiSecurity}
                onChange={(e) => setWifiSecurity(e.target.value as WifiSecurity)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="WPA">WPA / WPA2 / WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Open WiFi (No Password)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-rest-tables" className="block text-xs font-medium text-slate-700 mb-1">
                  Tables
                </label>
                <input
                  id="edit-rest-tables"
                  type="number"
                  min={1}
                  max={250}
                  value={tableCount}
                  onChange={(e) => setTableCount(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="edit-rest-plan" className="block text-xs font-medium text-slate-700 mb-1">
                  Plan
                </label>
                <select
                  id="edit-rest-plan"
                  value={plan}
                  disabled={!isSuperAdmin}
                  onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
                  className="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-sm bg-white disabled:bg-slate-50"
                >
                  <option value="Starter">Starter</option>
                  <option value="Growth">Growth</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="sm:col-span-2 flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Outlet Status</p>
                  <p className="text-[11px] text-slate-500">
                    Pause or activate this restaurant on the platform
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActive((prev) => !prev)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  }`}
                >
                  {active ? 'Active' : 'Paused'}
                </button>
              </div>
            )}
          </div>

          {/* Restaurant Owner Login Credentials (Super Admin only) */}
          {isSuperAdmin && (
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-emerald-700" />
                  <h4 className="text-xs font-bold text-emerald-950">
                    Restaurant Owner Login Credentials
                  </h4>
                </div>
                {restaurantAccountMeta[editingRestaurant.id] && (
                  <span className="text-[11px] font-medium text-emerald-800">
                    {restaurantAccountMeta[editingRestaurant.id].passwordUpdatedBy ===
                    'restaurant_owner'
                      ? 'Password last updated by Restaurant Owner'
                      : 'Password set by App Owner'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-900/80">
                Set a unique username & password so this restaurant's owner can log in. They can also change their own password anytime (which syncs automatically here), and you can reset it anytime below.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-owner-username" className="block text-xs font-medium text-slate-700 mb-1">
                    Owner Login Username / Email
                  </label>
                  <input
                    id="edit-owner-username"
                    type="text"
                    value={ownerUsername}
                    onChange={(e) => setOwnerUsername(e.target.value)}
                    placeholder="e.g. saffron_owner"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label htmlFor="edit-owner-password" className="block text-xs font-medium text-slate-700 mb-1">
                    {existingUsername ? 'New Password (optional)' : 'Owner Password'}
                  </label>
                  <input
                    id="edit-owner-password"
                    type="password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder={
                      existingUsername
                        ? 'Leave blank to keep current'
                        : 'Min 6 characters'
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
            {isSuperAdmin && restaurants.length > 1 ? (
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg text-xs font-semibold transition-colors ${
                  confirmDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-red-200 text-red-700 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {deleting
                    ? 'Deleting...'
                    : confirmDelete
                      ? 'Confirm Delete Restaurant'
                      : 'Delete Restaurant'}
                </span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingRestaurant(null)}
                className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

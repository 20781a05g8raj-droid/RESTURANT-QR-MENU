import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, Smartphone, UtensilsCrossed } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

export function PortalAuthGate() {
  const {
    portalAuthStatus,
    portalAuthLoading,
    setupAppOwner,
    loginPortal,
    setGuestPreviewMode,
    setActiveRole,
    setActiveTab,
  } = usePlatform();

  const isFirstRunSetup = Boolean(portalAuthStatus && !portalAuthStatus.adminConfigured);
  const defaultOwnerEmail = portalAuthStatus?.appOwnerEmail ?? 'rajensu264@gmail.com';

  const [username, setUsername] = useState(defaultOwnerEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFirstRunSetup && portalAuthStatus?.appOwnerEmail) {
      setUsername(portalAuthStatus.appOwnerEmail);
    }
  }, [isFirstRunSetup, portalAuthStatus?.appOwnerEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isFirstRunSetup) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter to confirm.');
        return;
      }
      setSubmitting(true);
      const res = await setupAppOwner(username, password);
      setSubmitting(false);
      if (!res.ok) {
        setError(res.error ?? 'Could not activate App Owner account.');
      }
      return;
    }

    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setSubmitting(true);
    const res = await loginPortal(username, password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? 'Invalid username or password.');
    }
  };

  if (portalAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-sm text-slate-500">Loading TablePulse portal...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white shadow-sm">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">TablePulse</h1>
          <p className="text-sm text-slate-500">
            Smart QR Digital Menu, Instant WiFi & Multi-Restaurant Platform
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-sm space-y-5">
          {isFirstRunSetup ? (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
                <span>One-Time App Owner Activation</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Set Your Personal App Owner Password
              </h2>
              <p className="text-xs text-slate-500">
                Activate your master account (<span className="font-mono text-slate-700">{defaultOwnerEmail}</span>) to manage all restaurants and set individual owner IDs & passwords.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <Lock className="w-3.5 h-3.5" />
                <span>App Owner & Restaurant Owner Sign In</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">Sign in to TablePulse</h2>
              <p className="text-xs text-slate-500">
                Enter your App Owner email or your assigned Restaurant Owner username & password.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="portal-username"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {isFirstRunSetup ? 'App Owner Email' : 'Username / Email'}
              </label>
              <input
                id="portal-username"
                type="text"
                autoComplete="username"
                required
                readOnly={isFirstRunSetup}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="rajensu264@gmail.com or restaurant_id"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 read-only:bg-slate-50 read-only:text-slate-600"
              />
            </div>

            <div>
              <label
                htmlFor="portal-password"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {isFirstRunSetup ? 'Create Master Password' : 'Password'}
              </label>
              <div className="relative">
                <input
                  id="portal-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isFirstRunSetup ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isFirstRunSetup ? 'Enter your personal password' : 'Enter password'}
                  className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isFirstRunSetup && (
              <div>
                <label
                  htmlFor="portal-confirm-password"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Confirm Master Password
                </label>
                <input
                  id="portal-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Please wait...'
                  : isFirstRunSetup
                    ? 'Activate App Owner Account'
                    : 'Sign In to Dashboard'}
              </span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>Scanning a table QR?</span>
            <button
              type="button"
              onClick={() => {
                setActiveRole('customer');
                setActiveTab('customer_menu');
                setGuestPreviewMode(true);
              }}
              className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Open Guest QR Menu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

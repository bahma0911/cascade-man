import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import { Coffee, Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password');
      return;
    }

    try {
      setError('');
      setSubmitting(true);
      const user = await login(username.trim(), password);

      const roleHome =
        user.role === 'admin'
          ? '/admin'
          : user.role === 'kitchen' || user.role === 'barista'
          ? '/kitchen'
          : '/waiter';

      const rawFrom = location.state?.from?.pathname;
      let destination = roleHome;
      if (rawFrom && rawFrom !== '/' && rawFrom !== '/login') {
        if (
          (user.role === 'barista' || user.role === 'kitchen') &&
          (rawFrom.startsWith('/barista') || rawFrom.startsWith('/kitchen'))
        ) {
          destination = '/kitchen';
        } else if (user.role === 'waiter' && rawFrom.startsWith('/waiter')) {
          destination = rawFrom;
        } else if (user.role === 'admin') {
          destination = rawFrom;
        }
      }

      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || STRINGS.auth.invalidCredentials);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-amber-100/60 p-8 sm:p-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-600 mx-auto flex items-center justify-center text-white shadow-lg shadow-amber-600/30 mb-4">
            <Coffee className="w-10 h-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {STRINGS.appName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{STRINGS.auth.subtitle}</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              {STRINGS.auth.username}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-medium placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-base"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              {STRINGS.auth.password}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-11 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-medium placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-base"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 px-6 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-bold rounded-2xl shadow-lg shadow-amber-600/30 transition-all flex items-center justify-center gap-2 text-base disabled:opacity-50"
          >
            {submitting ? STRINGS.auth.signingIn : STRINGS.auth.signInButton}
          </button>
        </form>
      </div>
    </div>
  );
}


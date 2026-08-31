import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { Alert, Field, inputClass, primaryButton } from '../components/Ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

//  AuthShell is a resuable react component that provides a shared layout used by the login, registration, and setup pages.
function AuthShell({
  title,
  subtitle,
  children,
  compact = ['Welcome back', 'Labour registration'].includes(title),
}) {
  const registrationClasses =
    title === 'Labour registration'
      ? 'registration-card [&_.grid-cols-2]:grid-cols-1 sm:[&_.grid-cols-2]:grid-cols-2'
      : '';

  const cardSize =
    title === 'Welcome back'
      ? 'max-w-xs p-5'
      : compact
        ? 'max-w-sm p-5 sm:p-6'
        : 'max-w-md p-6 sm:p-8';

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-800 to-lime-800 p-4">
      <section
        className={`w-full rounded-3xl bg-white shadow-2xl ${cardSize} ${registrationClasses}`}
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
          Poultry Reporting System
        </p>

        <h1
          className={`${compact ? 'mt-2 text-xl' : 'mt-3 text-2xl'} font-bold text-slate-900`}
        >
          {title}
        </h1>

        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className={compact ? 'mt-5' : 'mt-6'}>{children}</div>
      </section>
    </main>
  );
}

// show password toggle button for password input fields. The button is accessible and has a visible label for screen readers.
function PasswordInput({ className = '', ...inputProps }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        {...inputProps}
        type={showPassword ? 'text' : 'password'}
        className={`${inputClass} !pr-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShowPassword((visible) => !visible)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        aria-pressed={showPassword}
        title={showPassword ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-emerald-700"
      >
        {showPassword ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.7a2 2 0 002.7 2.7" />
            <path d="M9.9 4.2A10.8 10.8 0 0112 4c5.5 0 9 5.5 9 5.5a15.7 15.7 0 01-2.1 2.7M6.6 6.6C4.3 8.1 3 10 3 10s3.5 5.5 9 5.5c1 0 2-.2 2.9-.5" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
            <path d="M3 12s3.5-5.5 9-5.5 9 5.5 9 5.5-3.5 5.5-9 5.5S3 12 3 12z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}

// Registration and setup use the same four account fields.
function useAccountForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
  });

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  return { form, updateForm };
}

export function LoginPage() {
  const { user, acceptSession } = useAuth();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // An empty dependency array means this runs once when the page opens.
  useEffect(() => {
    async function checkSetupStatus() {
      try {
        const data = await api('/auth/setup-status');
        setSetupRequired(data.setupRequired);
      } catch {
        // Login can still be displayed if the optional setup check fails.
      }
    }

    checkSetupStatus();
  }, []);

  function updateLoginField(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const session = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      acceptSession(session);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  // Logged-in users should not see an authentication form.
  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Enter today’s farm data or review reports."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Alert>{error}</Alert>

        <Field label="Email">
          <input
            required
            name="email"
            type="email"
            className={inputClass}
            value={form.email}
            onChange={updateLoginField}
          />
        </Field>

        <Field label="Password">
          <PasswordInput
            required
            name="password"
            value={form.password}
            onChange={updateLoginField}
          />
        </Field>

        <button disabled={busy} className={primaryButton}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-5 space-y-2 text-center text-sm text-slate-600">
        <p>
          New labour?{' '}
          <Link className="font-semibold text-emerald-700" to="/register">
            Create an account
          </Link>
        </p>

        {setupRequired && (
          <p>
            First use?{' '}
            <Link className="font-semibold text-amber-700" to="/setup">
              Set up the admin
            </Link>
          </p>
        )}
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, acceptSession } = useAuth();
  const navigate = useNavigate();
  const { form, updateForm } = useAccountForm();

  const [firms, setFirms] = useState([]);
  const [selectedFirmIds, setSelectedFirmIds] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadRegistrationFirms() {
      try {
        const data = await api('/auth/registration-firms');
        setFirms(data.firms);
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    loadRegistrationFirms();
  }, []);

  function toggleFirm(firmId) {
    setSelectedFirmIds((currentIds) =>
      currentIds.includes(firmId)
        ? currentIds.filter((id) => id !== firmId)
        : [...currentIds, firmId],
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    if (selectedFirmIds.length === 0) {
      setError('Select at least one firm.');
      return;
    }

    setBusy(true);

    try {
      const session = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          firmIds: selectedFirmIds,
        }),
      });
      acceptSession(session);
      navigate('/');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthShell
      title="Labour registration"
      subtitle="Choose one firm or both firms."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Alert>{error}</Alert>

        <Field label="Name">
          <input
            required
            name="name"
            className={inputClass}
            value={form.name}
            onChange={updateForm}
          />
        </Field>

        <Field label="Email">
          <input
            required
            name="email"
            type="email"
            className={inputClass}
            value={form.email}
            onChange={updateForm}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Password">
            <PasswordInput
              required
              minLength="6"
              name="password"
              value={form.password}
              onChange={updateForm}
            />
          </Field>

          <Field label="Confirm">
            <PasswordInput
              required
              minLength="6"
              name="confirm"
              value={form.confirm}
              onChange={updateForm}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">
            Firm(s)
          </legend>

          <div className="grid gap-2">
            {firms.map((firm) => {
              const isSelected = selectedFirmIds.includes(firm._id);

              return (
                <label
                  key={firm._id}
                  className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFirm(firm._id)}
                    className="h-5 w-5 accent-emerald-700"
                  />
                  <span className="font-medium">{firm.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <button
          disabled={busy || firms.length === 0}
          className={primaryButton}
        >
          {busy ? 'Creating…' : 'Create labour account'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm">
        <Link className="font-semibold text-emerald-700" to="/login">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}

export function SetupPage() {
  const { user, acceptSession } = useAuth();
  const { form, updateForm } = useAccountForm();

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupAllowed, setSetupAllowed] = useState(null);

  useEffect(() => {
    async function checkSetupStatus() {
      try {
        const data = await api('/auth/setup-status');
        setSetupAllowed(data.setupRequired);
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    checkSetupStatus();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const session = await api('/auth/setup-admin', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      acceptSession(session);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthShell
      title="One-time admin setup"
      subtitle="This creates Raghav and Sanjana firms. Assets remain empty until the admin adds them."
    >
      {setupAllowed === false ? (
        <>
          <Alert type="success">Setup is already complete.</Alert>
          <Link className={`${primaryButton} mt-4 w-full`} to="/login">
            Go to login
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          <Alert>{error}</Alert>

          <Field label="Admin name">
            <input
              required
              name="name"
              className={inputClass}
              value={form.name}
              onChange={updateForm}  
            />
          </Field>

          <Field label="Admin email">
            <input
              required
              name="email"
              type="email"
              className={inputClass}
              value={form.email}
              onChange={updateForm}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Password">
              <PasswordInput
                required
                minLength="6"
                name="password"
                value={form.password}
                onChange={updateForm}
              />
            </Field>

            <Field label="Confirm">
              <PasswordInput
                required
                minLength="6"
                name="confirm"
                value={form.confirm}
                onChange={updateForm}
              />
            </Field>
          </div>

          <button
            disabled={busy || setupAllowed === null}
            className={primaryButton}
          >
            {busy ? 'Setting up…' : 'Create admin & firms'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

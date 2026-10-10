import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { Alert, Field, inputClass, primaryButton } from "../components/Ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// AuthShell provides a clean, mobile-responsive card layout that fits mobile screens without excessive scrolling
function AuthShell({
  title,
  subtitle,
  children,
  maxWidth = "max-w-[340px] sm:max-w-[380px]",
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-800 to-lime-800 px-3 py-4 sm:p-6">
      <section
        className={`w-full rounded-2xl sm:rounded-3xl bg-white shadow-2xl p-4 sm:p-6 ${maxWidth}`}
      >
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
          Poultry Reporting System
        </p>

        <h1 className="mt-1 text-lg sm:text-xl font-bold text-slate-900 leading-tight">
          {title}
        </h1>

        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        <div className="mt-3.5 sm:mt-4">{children}</div>
      </section>
    </main>
  );
}

// Compact password input with show/hide toggle
function PasswordInput({ className = "", ...inputProps }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        {...inputProps}
        type={showPassword ? "text" : "password"}
        className={`${inputClass} !pr-9 !min-h-9 !h-9 !py-1 text-xs sm:text-sm ${className}`}
      />
      <button
        type="button"
        onClick={() => setShowPassword((visible) => !visible)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-pressed={showPassword}
        title={showPassword ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-emerald-700 transition"
      >
        {showPassword ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 fill-none stroke-current"
            strokeWidth="2"
          >
            <path d="M3 3l18 18" />
            <path d="M10.6 10.7a2 2 0 002.7 2.7" />
            <path d="M9.9 4.2A10.8 10.8 0 0112 4c5.5 0 9 5.5 9 5.5a15.7 15.7 0 01-2.1 2.7M6.6 6.6C4.3 8.1 3 10 3 10s3.5 5.5 9 5.5c1 0 2-.2 2.9-.5" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 fill-none stroke-current"
            strokeWidth="2"
          >
            <path d="M3 12s3.5-5.5 9-5.5 9 5.5 9 5.5-3.5 5.5-9 5.5S3 12 3 12z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}

// Reusable account form hook
function useAccountForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
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

// Login page - compact & perfectly responsive on phone
export function LoginPage() {
  const { user, acceptSession } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function checkSetupStatus() {
      try {
        const data = await api("/auth/setup-status");
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
    setError("");

    try {
      const session = await api("/auth/login", {
        method: "POST",
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
      title="Welcome back"
      subtitle="Enter today’s farm data or review reports."
      maxWidth="max-w-[320px] sm:max-w-[360px]"
    >
      <form onSubmit={handleSubmit} className="grid gap-3 text-xs">
        <Alert>{error}</Alert>

        <Field label="Email">
          <input
            required
            name="email"
            type="email"
            className={`${inputClass} !min-h-9 !h-9 !py-1 text-xs sm:text-sm`}
            value={form.email}
            onChange={updateLoginField}
            placeholder="user@example.com"
          />
        </Field>

        <Field label="Password">
          <PasswordInput
            required
            name="password"
            value={form.password}
            onChange={updateLoginField}
            placeholder="Enter password"
          />
        </Field>

        <button
          disabled={busy}
          className={`${primaryButton} w-full !min-h-9.5 !h-9.5 text-xs sm:text-sm font-bold rounded-xl mt-1`}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-4 space-y-1.5 text-center text-xs text-slate-600">
        <p>
          New user?{" "}
          <Link className="font-semibold text-emerald-700 hover:underline" to="/register">
            Create an account
          </Link>
        </p>

        {setupRequired && (
          <p>
            First use?{" "}
            <Link className="font-semibold text-amber-700 hover:underline" to="/setup">
              Set up the admin
            </Link>
          </p>
        )}
      </div>
    </AuthShell>
  );
}

// Register page - 2-column compact grid, fits completely on mobile phones
export function RegisterPage() {
  const { user, acceptSession } = useAuth();
  const navigate = useNavigate();
  const { form, updateForm } = useAccountForm();

  const [role, setRole] = useState("user");
  const [firms, setFirms] = useState([]);
  const [selectedFirmIds, setSelectedFirmIds] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadRegistrationFirms() {
      try {
        const data = await api("/auth/registration-firms");
        setFirms(data.firms || []);
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
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (selectedFirmIds.length === 0) {
      setError("Select at least one firm.");
      return;
    }

    setBusy(true);

    try {
      const session = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          role,
          firmIds: selectedFirmIds,
        }),
      });
      acceptSession(session);
      navigate("/");
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
      title="Create account"
      subtitle="Select your designated role and assigned firm(s)."
      maxWidth="max-w-[340px] sm:max-w-[390px]"
    >
      <form onSubmit={handleSubmit} className="grid gap-2.5 text-xs">
        <Alert>{error}</Alert>

        {/* Row 1: Full Name & Role side by side */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Full Name">
            <input
              required
              name="name"
              className={`${inputClass} !min-h-9 !h-9 !py-1 text-xs sm:text-sm`}
              value={form.name}
              onChange={updateForm}
              placeholder="Name"
            />
          </Field>

          <Field label="Designated Role">
            <select
              className={`${inputClass} !min-h-9 !h-9 !py-1 text-xs sm:text-sm`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="user">User</option>
              <option value="office">Office</option>
              <option value="supervisor">Supervisor</option>
              <option value="security">Security</option>
              <option value="farm_incharge">Farm Incharge</option>
            </select>
          </Field>
        </div>

        {/* Row 2: Email */}
        <Field label="Email">
          <input
            required
            name="email"
            type="email"
            className={`${inputClass} !min-h-9 !h-9 !py-1 text-xs sm:text-sm`}
            value={form.email}
            onChange={updateForm}
            placeholder="user@example.com"
          />
        </Field>

        {/* Row 3: Password & Confirm Password side by side */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Password">
            <PasswordInput
              required
              minLength="6"
              name="password"
              value={form.password}
              onChange={updateForm}
              placeholder="Min 6 chars"
            />
          </Field>

          <Field label="Confirm Password">
            <PasswordInput
              required
              minLength="6"
              name="confirm"
              value={form.confirm}
              onChange={updateForm}
              placeholder="Confirm"
            />
          </Field>
        </div>

        {/* Row 4: Assigned Firms side by side */}
        <fieldset className="space-y-1">
          <legend className="text-[11px] font-semibold text-slate-600">
            Assigned Firm(s)
          </legend>

          <div className="grid grid-cols-2 gap-2">
            {firms.map((firm) => {
              const isSelected = selectedFirmIds.includes(firm._id);

              return (
                <label
                  key={firm._id}
                  className={`flex min-h-[36px] h-9 items-center gap-2 rounded-xl border px-2.5 py-1 text-xs font-medium cursor-pointer transition ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-xs"
                      : "border-slate-300 text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFirm(firm._id)}
                    className="h-4 w-4 rounded accent-emerald-700 shrink-0"
                  />
                  <span className="truncate">{firm.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Submit Button */}
        <button
          disabled={busy || firms.length === 0}
          className={`${primaryButton} w-full !min-h-9.5 !h-9.5 text-xs sm:text-sm font-bold rounded-xl mt-1`}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-3 text-center text-xs">
        <Link className="font-semibold text-emerald-700 hover:underline" to="/login">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}

// Setup page for one-time admin provisioning
export function SetupPage() {
  const { user, acceptSession } = useAuth();
  const { form, updateForm } = useAccountForm();

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupAllowed, setSetupAllowed] = useState(null);

  useEffect(() => {
    async function checkSetupStatus() {
      try {
        const data = await api("/auth/setup-status");
        setSetupAllowed(data.setupRequired);
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    checkSetupStatus();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const session = await api("/auth/setup-admin", {
        method: "POST",
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
      subtitle="This creates Raghav and Sanjana firms."
      maxWidth="max-w-[340px] sm:max-w-[390px]"
    >
      {setupAllowed === false ? (
        <>
          <Alert type="success">Setup is already complete.</Alert>
          <Link className={`${primaryButton} mt-3 w-full !min-h-9.5 !h-9.5`} to="/login">
            Go to login
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-2.5 text-xs">
          <Alert>{error}</Alert>

          <Field label="Admin Name">
            <input
              required
              name="name"
              className={`${inputClass} !min-h-9 !h-9 !py-1 text-xs sm:text-sm`}
              value={form.name}
              onChange={updateForm}
              placeholder="Admin name"
            />
          </Field>

          <Field label="Admin Email">
            <input
              required
              name="email"
              type="email"
              className={`${inputClass} !min-h-9 !h-9 !py-1 text-xs sm:text-sm`}
              value={form.email}
              onChange={updateForm}
              placeholder="admin@example.com"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Password">
              <PasswordInput
                required
                minLength="6"
                name="password"
                value={form.password}
                onChange={updateForm}
                placeholder="Min 6 chars"
              />
            </Field>

            <Field label="Confirm Password">
              <PasswordInput
                required
                minLength="6"
                name="confirm"
                value={form.confirm}
                onChange={updateForm}
                placeholder="Confirm"
              />
            </Field>
          </div>

          <button
            disabled={busy || setupAllowed === null}
            className={`${primaryButton} w-full !min-h-9.5 !h-9.5 text-xs sm:text-sm font-bold rounded-xl mt-1`}
          >
            {busy ? "Setting up…" : "Create admin & firms"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

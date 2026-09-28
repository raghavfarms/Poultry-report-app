import { useEffect, useState, useRef } from "react";
import { api } from "../api/client.js";
import { Alert, Field, inputClass, primaryButton, secondaryButton, Spinner } from "../components/Ui.jsx";
import { AVAILABLE_MODULES } from "../components/Layout.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const DEFAULT_ROLES = [
  {
    code: "admin",
    name: "Administrator",
    description: "Full system administration, user management, and firm configuration.",
    allowedModules: ["diesel", "transport", "attendance"],
    permissions: {
      attendance_scan: true,
      attendance_report: true,
      worker_master: true,
      attendance_edit: true,
      asset_master: true,
      transport_master: true,
      attendance_admin_master: true,
    },
    isSystem: true,
  },
  {
    code: "developer",
    name: "Developer",
    description: "System developer with unrestricted access and debugging tools.",
    allowedModules: ["diesel", "transport", "attendance"],
    permissions: {
      attendance_scan: true,
      attendance_report: true,
      worker_master: true,
      attendance_edit: true,
      asset_master: true,
      transport_master: true,
      attendance_admin_master: true,
    },
    isSystem: true,
  },
  {
    code: "office",
    name: "Head Office",
    description: "Office staff with full report & operational visibility.",
    allowedModules: ["diesel", "transport", "attendance"],
    permissions: {
      attendance_scan: true,
      attendance_report: true,
      worker_master: true,
      attendance_edit: false,
      asset_master: false,
      transport_master: false,
      attendance_admin_master: false,
    },
    isSystem: true,
  },
  {
    code: "farm_incharge",
    name: "Farm Incharge",
    description: "Farm Incharge with attendance registers and worker master.",
    allowedModules: ["attendance"],
    permissions: {
      attendance_scan: true,
      attendance_report: true,
      worker_master: true,
      attendance_edit: false,
      asset_master: false,
      transport_master: false,
      attendance_admin_master: false,
    },
    isSystem: true,
  },
  {
    code: "supervisor",
    name: "Supervisor",
    description: "Farm supervisor for attendance and worker enrolment.",
    allowedModules: ["attendance"],
    permissions: {
      attendance_scan: true,
      attendance_report: true,
      worker_master: true,
      attendance_edit: false,
      asset_master: false,
      transport_master: false,
      attendance_admin_master: false,
    },
    isSystem: true,
  },
  {
    code: "security",
    name: "Security",
    description: "Gate security personnel for face attendance scanning only.",
    allowedModules: ["attendance"],
    permissions: {
      attendance_scan: true,
      attendance_report: false,
      worker_master: false,
      attendance_edit: false,
      asset_master: false,
      transport_master: false,
      attendance_admin_master: false,
    },
    isSystem: true,
  },
  {
    code: "user",
    name: "User",
    description: "Standard application user.",
    allowedModules: ["diesel"],
    permissions: {
      attendance_scan: false,
      attendance_report: false,
      worker_master: false,
      attendance_edit: false,
      asset_master: false,
      transport_master: false,
      attendance_admin_master: false,
    },
    isSystem: true,
  },
];

const INITIAL_USER_FORM = {
  name: "",
  email: "",
  password: "",
  role: "supervisor",
  firms: [],
  allowedModules: ["attendance"],
  permissions: {
    attendance_scan: true,
    attendance_report: false,
    worker_master: true,
    attendance_edit: false,
    asset_master: false,
    transport_master: false,
    attendance_admin_master: false,
  },
};

const INITIAL_ROLE_FORM = {
  name: "",
  code: "",
  description: "",
  allowedModules: ["attendance"],
  permissions: {
    attendance_scan: true,
    attendance_report: false,
    worker_master: true,
    attendance_edit: false,
    asset_master: false,
    transport_master: false,
    attendance_admin_master: false,
  },
};

/**
 * Renders ONLY the allowed masters and operational permissions (never shows disabled X items)
 */
function renderAllowedMasters(permissions = {}, role) {
  const unrestricted = ["admin", "developer"].includes(role);
  permissions = permissions || {};
  const allowed = [];
  if (unrestricted || permissions.attendance_edit) allowed.push("Edit Attendance");
  if (unrestricted || permissions.asset_master) allowed.push("Firms & Assets");
  if (unrestricted || permissions.transport_master) allowed.push("Transport Vehicles & Stations");
  if (unrestricted || permissions.attendance_scan) allowed.push("Camera Scan");
  if (unrestricted || permissions.worker_master) allowed.push("Worker Master");
  if (unrestricted || permissions.attendance_admin_master) allowed.push("Attendance Master");
  if (unrestricted || permissions.attendance_report) allowed.push("Monthly Attendance Report");

  if (allowed.length === 0) {
    return <span className="text-slate-400 italic text-[11px]">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {allowed.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
        >
          <span>✓</span> {name}
        </span>
      ))}
    </div>
  );
}

/**
 * 3-dot action dropdown menu for individual users
 */
function UserActionMenu({ user, onEdit, onToggleStatus, onDelete, isSelf = false, busy = false }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        disabled={busy}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition active:scale-95 cursor-pointer focus:outline-hidden"
        title="User actions"
        aria-label="User actions"
        aria-expanded={open}
      >
        <span className="text-base font-bold leading-none select-none">⋮</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 text-xs animate-in fade-in-50 zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2 transition cursor-pointer font-medium"
            onClick={() => {
              setOpen(false);
              onEdit(user);
            }}
          >
            <span>✏️</span>
            <span>Edit User</span>
          </button>

          {!isSelf && (
            <>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition cursor-pointer font-medium ${
                  user.active !== false
                    ? "text-amber-700 hover:bg-amber-50"
                    : "text-emerald-700 hover:bg-emerald-50"
                }`}
                onClick={() => {
                  setOpen(false);
                  onToggleStatus(user);
                }}
              >
                <span>{user.active !== false ? "🚫" : "✔️"}</span>
                <span>{user.active !== false ? "Deactivate" : "Activate"}</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition cursor-pointer font-medium border-t border-slate-100"
                onClick={() => {
                  setOpen(false);
                  onDelete(user);
                }}
              >
                <span>🗑️</span>
                <span>Delete User</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 3-dot action dropdown menu for individual roles
 */
function RoleActionMenu({ role, onEdit, onToggleStatus, onDelete, busy = false }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        disabled={busy}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition active:scale-95 cursor-pointer focus:outline-hidden"
        title="Role actions"
        aria-label="Role actions"
        aria-expanded={open}
      >
        <span className="text-base font-bold leading-none select-none">⋮</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 text-xs animate-in fade-in-50 zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2 transition cursor-pointer font-medium"
            onClick={() => {
              setOpen(false);
              onEdit(role);
            }}
          >
            <span>✏️</span>
            <span>Edit Role</span>
          </button>

          <button
            type="button"
            className={`w-full text-left px-3 py-2 flex items-center gap-2 transition cursor-pointer font-medium ${
              role.active !== false
                ? "text-amber-700 hover:bg-amber-50"
                : "text-emerald-700 hover:bg-emerald-50"
            }`}
            onClick={() => {
              setOpen(false);
              onToggleStatus(role);
            }}
          >
            <span>{role.active !== false ? "🚫" : "✔️"}</span>
            <span>{role.active !== false ? "Deactivate" : "Activate"}</span>
          </button>

          <button
            type="button"
            className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition cursor-pointer font-medium border-t border-slate-100"
            onClick={() => {
              setOpen(false);
              onDelete(role);
            }}
          >
            <span>🗑️</span>
            <span>Delete Role</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function UserAdminPage() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [firms, setFirms] = useState([]);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // User Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(INITIAL_USER_FORM);
  const [userModalError, setUserModalError] = useState("");

  // Role Modal State
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState(INITIAL_ROLE_FORM);
  const [roleModalError, setRoleModalError] = useState("");

  const loadData = () => {
    setLoading(true);
    setError("");
    Promise.all([
      api("/users"),
      api("/firms?includeOffice=true"),
      api("/roles").catch(() => ({ roles: DEFAULT_ROLES })),
    ])
      .then(([{ users = [] }, { firms = [] }, roleData]) => {
        setUsers(users);
        const allFirmsMap = new Map(firms.map((f) => [String(f._id), f]));
        users.forEach((u) => {
          (u.firms || []).forEach((f) => {
            if (typeof f === "object" && f._id && !allFirmsMap.has(String(f._id))) {
              allFirmsMap.set(String(f._id), f);
            }
          });
        });
        setFirms(Array.from(allFirmsMap.values()));
        if (roleData?.roles && roleData.roles.length > 0) {
          setRoles(roleData.roles);
        }
      })
      .catch((err) => setError(err.message || "Failed to load data."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  // ------------------ USER MODAL HANDLERS ------------------
  const openCreateUserModal = () => {
    setEditingUser(null);
    const defaultRole = roles[0]?.code || "supervisor";
    const foundRole = roles.find((r) => r.code === defaultRole);
    setUserForm({
      ...INITIAL_USER_FORM,
      role: defaultRole,
      firms: firms.map((f) => f._id),
      allowedModules: foundRole?.allowedModules || ["attendance"],
      permissions: foundRole?.permissions || {
        attendance_scan: true,
        attendance_report: false,
        worker_master: true,
        attendance_edit: false,
        asset_master: false,
        transport_master: false,
        attendance_admin_master: false,
      },
    });
    setUserModalError("");
    setShowUserModal(true);
  };

  const openEditUserModal = (u) => {
    setEditingUser(u);
    const assignedFirmIds = Array.isArray(u.firms)
      ? u.firms.map((f) => (typeof f === "object" ? f._id : f))
      : [];

    setUserForm({
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: u.role || "supervisor",
      firms: assignedFirmIds.length ? assignedFirmIds : firms.map((f) => f._id),
      allowedModules: Array.isArray(u.allowedModules) && u.allowedModules.length
        ? u.allowedModules
        : ["attendance"],
      permissions: {
        attendance_scan: u.permissions?.attendance_scan ?? true,
        attendance_report: u.permissions?.attendance_report ?? false,
        worker_master: u.permissions?.worker_master ?? true,
        attendance_edit: u.permissions?.attendance_edit ?? false,
        asset_master: u.permissions?.asset_master ?? false,
        transport_master: u.permissions?.transport_master ?? false,
        attendance_admin_master: u.permissions?.attendance_admin_master ?? false,
      },
    });
    setUserModalError("");
    setShowUserModal(true);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUser(null);
    setUserForm(INITIAL_USER_FORM);
    setUserModalError("");
  };

  const handleRoleChangeForUser = (newRoleCode) => {
    const selectedRole = roles.find((r) => r.code === newRoleCode);
    setUserForm((prev) => ({
      ...prev,
      role: newRoleCode,
      ...(selectedRole
        ? {
            allowedModules: selectedRole.allowedModules || prev.allowedModules,
            permissions: {
              ...prev.permissions,
              ...(selectedRole.permissions || {}),
            },
          }
        : {}),
    }));
  };

  const toggleUserFirm = (firmId) => {
    setUserForm((prev) => {
      const exists = prev.firms.some((id) => String(id?._id || id) === String(firmId));
      const next = exists
        ? prev.firms.filter((id) => String(id?._id || id) !== String(firmId))
        : [...prev.firms, String(firmId)];
      return { ...prev, firms: next };
    });
  };

  const toggleUserModule = (moduleSlug) => {
    setUserForm((prev) => {
      const exists = prev.allowedModules.includes(moduleSlug);
      const next = exists
        ? prev.allowedModules.filter((m) => m !== moduleSlug)
        : [...prev.allowedModules, moduleSlug];
      return { ...prev, allowedModules: next };
    });
  };

  const toggleUserPermission = (key) => {
    setUserForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setUserModalError("");

    if (!userForm.name.trim()) {
      setUserModalError("Full name is required.");
      return;
    }
    if (!userForm.email.trim()) {
      setUserModalError("Email address is required.");
      return;
    }
    if (!editingUser && !userForm.password.trim()) {
      setUserModalError("Password is required for new users.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        role: userForm.role,
        firms: userForm.firms,
        allowedModules: userForm.allowedModules,
        permissions: userForm.permissions,
      };

      if (userForm.password.trim()) {
        payload.password = userForm.password.trim();
      }

      if (editingUser) {
        await api(`/users/${editingUser._id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice(`User "${payload.name}" updated successfully.`);
      } else {
        await api("/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice(`User "${payload.name}" created successfully.`);
      }

      closeUserModal();
      loadData();
      setTimeout(() => setNotice(""), 5000);
    } catch (err) {
      setUserModalError(err.message || "Failed to save user.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (u) => {
    if (u._id === currentUser?._id) {
      alert("You cannot deactivate your own account.");
      return;
    }
    setBusy(true);
    try {
      await api(`/users/${u._id}/toggle-status`, { method: "PATCH" });
      setNotice(`User status updated for "${u.name}".`);
      loadData();
      setTimeout(() => setNotice(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to update user status.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async (u) => {
    if (u._id === currentUser?._id) {
      alert("You cannot delete your own account.");
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user "${u.name}"? This action cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await api(`/users/${u._id}`, { method: "DELETE" });
      setNotice(`User "${u.name}" deleted successfully.`);
      loadData();
      setTimeout(() => setNotice(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to delete user.");
    } finally {
      setBusy(false);
    }
  };

  // ------------------ ROLE MODAL HANDLERS ------------------
  const openCreateRoleModal = () => {
    setEditingRole(null);
    setRoleForm(INITIAL_ROLE_FORM);
    setRoleModalError("");
    setShowRoleModal(true);
  };

  const openEditRoleModal = (role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name || "",
      code: role.code || "",
      description: role.description || "",
      allowedModules: Array.isArray(role.allowedModules) ? role.allowedModules : ["attendance"],
      permissions: {
        attendance_scan: role.permissions?.attendance_scan ?? true,
        attendance_report: role.permissions?.attendance_report ?? false,
        worker_master: role.permissions?.worker_master ?? true,
        attendance_edit: role.permissions?.attendance_edit ?? false,
        asset_master: role.permissions?.asset_master ?? false,
        transport_master: role.permissions?.transport_master ?? false,
        attendance_admin_master: role.permissions?.attendance_admin_master ?? false,
      },
    });
    setRoleModalError("");
    setShowRoleModal(true);
  };

  const closeRoleModal = () => {
    setShowRoleModal(false);
    setEditingRole(null);
    setRoleForm(INITIAL_ROLE_FORM);
    setRoleModalError("");
  };

  const toggleRoleModule = (moduleSlug) => {
    setRoleForm((prev) => {
      const exists = prev.allowedModules.includes(moduleSlug);
      const next = exists
        ? prev.allowedModules.filter((m) => m !== moduleSlug)
        : [...prev.allowedModules, moduleSlug];
      return { ...prev, allowedModules: next };
    });
  };

  const toggleRolePermission = (key) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    setRoleModalError("");

    if (!roleForm.name.trim()) {
      setRoleModalError("Role name is required.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: roleForm.name.trim(),
        description: roleForm.description?.trim() || "",
        allowedModules: roleForm.allowedModules,
        permissions: roleForm.permissions,
      };

      if (!editingRole) {
        payload.code = (roleForm.code?.trim() || roleForm.name.trim())
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_");
        await api("/roles", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice(`Role "${payload.name}" created successfully.`);
      } else {
        await api(`/roles/${editingRole._id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice(`Role "${payload.name}" updated successfully.`);
      }

      closeRoleModal();
      loadData();
      setTimeout(() => setNotice(""), 5000);
    } catch (err) {
      setRoleModalError(err.message || "Failed to save role.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRoleStatus = async (role) => {
    if (role.code === "admin" && role.active) {
      alert("Primary Administrator role cannot be deactivated.");
      return;
    }
    setBusy(true);
    try {
      await api(`/roles/${role._id}/toggle-status`, { method: "PATCH" });
      setNotice(`Role "${role.name}" status updated.`);
      loadData();
      setTimeout(() => setNotice(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to update role status.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRole = async (role) => {
    if (role.code === "admin") {
      alert("Primary Administrator role cannot be deleted.");
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete role "${role.name}"? This action cannot be undone.`)) {
      return;
    }

    setBusy(true);
    try {
      await api(`/roles/${role._id}`, { method: "DELETE" });
      setNotice(`Role "${role.name}" deleted permanently.`);
      loadData();
      setTimeout(() => setNotice(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to delete role.");
    } finally {
      setBusy(false);
    }
  };

  // Helper to format role names dynamically according to registered users in DB
  const formatRoleLabel = (roleCode) => {
    if (!roleCode) return "User";
    const found = roles.find((r) => r.code?.toLowerCase() === roleCode?.toLowerCase());
    if (found?.name) return found.name;
    const map = {
      farm_incharge: "Farm Incharge",
      supervisor: "Supervisor",
      security: "Security",
      admin: "Administrator",
      developer: "Developer",
      office: "Head Office",
      staff: "Staff",
      user: "User",
    };
    return map[roleCode.toLowerCase()] || roleCode.charAt(0).toUpperCase() + roleCode.slice(1);
  };

  return (
    <div className="space-y-4">
      {/* Top Notification Toast */}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {notice}
        </div>
      )}
      {error && <Alert type="error">{error}</Alert>}

      {/* Header & Contextual Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            User &amp; Role Management
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Strict RBAC: Create user logins, assign farm access, and configure granular module, master, and attendance permissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "users" ? (
            <button
              type="button"
              onClick={openCreateUserModal}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-emerald-900 hover:bg-emerald-950 px-4 py-2.5 sm:py-2 text-xs font-bold text-white transition shadow-sm active:scale-98 cursor-pointer"
            >
              <span>＋</span> Add User
            </button>
          ) : (
            <button
              type="button"
              onClick={openCreateRoleModal}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-emerald-900 hover:bg-emerald-950 px-4 py-2.5 sm:py-2 text-xs font-bold text-white transition shadow-sm active:scale-98 cursor-pointer"
            >
              <span>＋</span> Add Role
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 pt-1 text-sm font-semibold overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab("users")}
          className={`flex items-center gap-1.5 pb-2.5 transition border-b-2 whitespace-nowrap cursor-pointer ${
            tab === "users"
              ? "border-emerald-700 text-emerald-800 font-bold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <span>👥</span> Users ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("roles")}
          className={`flex items-center gap-1.5 pb-2.5 transition border-b-2 whitespace-nowrap cursor-pointer ${
            tab === "roles"
              ? "border-emerald-700 text-emerald-800 font-bold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <span>🏷️</span> Defined Roles ({roles.length})
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="py-16 text-center">
          <Spinner label="Loading data…" />
        </div>
      ) : tab === "users" ? (
        users.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-400 text-xs">
            No users found.
          </div>
        ) : (
          <>
            {/* Mobile Card View (< 768px / md:hidden) - COMPACT SMALL CARD */}
            <div className="md:hidden space-y-2.5">
              {users.map((u) => {
                const roleLabel = formatRoleLabel(u.role);
                const isSelf = u._id === currentUser?._id;
                return (
                  <div
                    key={u._id}
                    className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs space-y-2 text-xs"
                  >
                    {/* Top Row: Name, Email + Status & 3-dot Action */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-sm truncate">{u.name}</div>
                        <div className="text-[11px] text-slate-400 font-normal truncate">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            u.active !== false
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {u.active !== false ? "Active" : "Inactive"}
                        </span>
                        <UserActionMenu
                          user={u}
                          onEdit={openEditUserModal}
                          onToggleStatus={handleToggleStatus}
                          onDelete={handleDeleteUser}
                          isSelf={isSelf}
                          busy={busy}
                        />
                      </div>
                    </div>

                    {/* Role & Assigned Farms */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                        {roleLabel}
                      </span>
                      {Array.isArray(u.firms) && u.firms.length > 0 ? (
                        u.firms.map((f) => {
                          const name = typeof f === "object" ? f.name : f;
                          return (
                            <span
                              key={typeof f === "object" ? f._id : f}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600"
                            >
                              {name}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-slate-400 italic text-[10px]">No farms</span>
                      )}
                    </div>

                    {/* Allowed Modules */}
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(u.allowedModules) && u.allowedModules.length > 0 ? (
                        u.allowedModules.map((m) => {
                          const modLabel =
                            m === "attendance"
                              ? "Attendance"
                              : m === "diesel"
                              ? "Diesel"
                              : m === "transport"
                              ? "Transport"
                              : m.charAt(0).toUpperCase() + m.slice(1);
                          return (
                            <span
                              key={m}
                              className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
                            >
                              {modLabel}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-slate-400 italic text-[10px]">—</span>
                      )}
                    </div>

                    {/* All Masters Access - SHOW ONLY ALLOWED */}
                    <div className="pt-1.5 border-t border-slate-100">
                      {renderAllowedMasters(u.permissions, u.role)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= 768px / md:block) */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead className="border-b border-slate-200 bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">USER</th>
                      <th className="px-4 py-3.5">ROLE</th>
                      <th className="px-4 py-3.5">ASSIGNED FARMS</th>
                      <th className="px-4 py-3.5">ALLOWED MODULES</th>
                      <th className="px-4 py-3.5">MASTER</th>
                      <th className="px-4 py-3.5">STATUS</th>
                      <th className="px-5 py-3.5 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => {
                      const roleLabel = formatRoleLabel(u.role);
                      const isSelf = u._id === currentUser?._id;
                      return (
                        <tr key={u._id} className="hover:bg-slate-50/60 transition-colors">
                          {/* USER Column */}
                          <td className="px-5 py-3.5 align-middle">
                            <div className="font-bold text-slate-800 text-[13px]">{u.name}</div>
                            <div className="text-[11px] text-slate-400 font-normal">{u.email}</div>
                          </td>

                          {/* ROLE Column */}
                          <td className="px-4 py-3.5 align-middle">
                            <span className="inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                              {roleLabel}
                            </span>
                          </td>

                          {/* ASSIGNED FARMS Column */}
                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex flex-wrap gap-1.5">
                              {Array.isArray(u.firms) && u.firms.length > 0 ? (
                                u.firms.map((f) => {
                                  const name = typeof f === "object" ? f.name : f;
                                  return (
                                    <span
                                      key={typeof f === "object" ? f._id : f}
                                      className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600"
                                    >
                                      {name}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">—</span>
                              )}
                            </div>
                          </td>

                          {/* ALLOWED MODULES Column */}
                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex flex-wrap gap-1.5">
                              {Array.isArray(u.allowedModules) && u.allowedModules.length > 0 ? (
                                u.allowedModules.map((m) => {
                                  const modLabel =
                                    m === "attendance"
                                      ? "Attendance"
                                      : m === "diesel"
                                      ? "Diesel"
                                      : m === "transport"
                                      ? "Transport"
                                      : m.charAt(0).toUpperCase() + m.slice(1);
                                  return (
                                    <span
                                      key={m}
                                      className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
                                    >
                                      {modLabel}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">—</span>
                              )}
                            </div>
                          </td>

                          {/* ALL MASTERS & PERMISSIONS Column - SHOW ONLY ALLOWED */}
                          <td className="px-4 py-3.5 align-middle">
                            {renderAllowedMasters(u.permissions, u.role)}
                          </td>

                          {/* STATUS Column */}
                          <td className="px-4 py-3.5 align-middle">
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                u.active !== false
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              {u.active !== false ? "Active" : "Inactive"}
                            </span>
                          </td>

                          {/* 3-DOT ACTION Column */}
                          <td className="px-5 py-3.5 align-middle text-right whitespace-nowrap">
                            <UserActionMenu
                              user={u}
                              onEdit={openEditUserModal}
                              onToggleStatus={handleToggleStatus}
                              onDelete={handleDeleteUser}
                              isSelf={isSelf}
                              busy={busy}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      ) : (
        /* Defined Roles Tab - CLEAN & SIMPLE TABLE VIEW */
        roles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-400 text-xs">
            No roles defined.
          </div>
        ) : (
          <>
            {/* Mobile Roles Card View (< 768px / md:hidden) - COMPACT SMALL CARD */}
            <div className="md:hidden space-y-2.5">
              {roles.map((r) => (
                <div
                  key={r._id || r.code}
                  className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm truncate">{r.name}</div>
                      <div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">{r.code}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          r.active !== false
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {r.active !== false ? "Active" : "Inactive"}
                      </span>
                      <RoleActionMenu
                        role={r}
                        onEdit={openEditRoleModal}
                        onToggleStatus={handleToggleRoleStatus}
                        onDelete={handleDeleteRole}
                        busy={busy}
                      />
                    </div>
                  </div>

                  {/* Allowed Modules */}
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(r.allowedModules) && r.allowedModules.length > 0 ? (
                      r.allowedModules.map((m) => (
                        <span
                          key={m}
                          className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
                        >
                          {m}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">—</span>
                    )}
                  </div>

                  {/* Allowed Masters */}
                  <div className="pt-1.5 border-t border-slate-100">
                    {renderAllowedMasters(r.permissions, r.code)}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Roles Table View (>= 768px / md:block) */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[750px]">
                  <thead className="border-b border-slate-200 bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">ROLE</th>
                      <th className="px-4 py-3.5">DEFAULT MODULES</th>
                      <th className="px-4 py-3.5">MASTER</th>
                      <th className="px-4 py-3.5">STATUS</th>
                      <th className="px-5 py-3.5 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {roles.map((r) => (
                      <tr key={r._id || r.code} className="hover:bg-slate-50/60 transition-colors">
                        {/* ROLE Column */}
                        <td className="px-5 py-3.5 align-middle">
                          <div className="font-bold text-slate-800 text-[13px]">{r.name}</div>
                          <div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">{r.code}</div>
                        </td>

                        {/* DEFAULT MODULES Column */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(r.allowedModules) && r.allowedModules.length > 0 ? (
                              r.allowedModules.map((m) => {
                                const modLabel =
                                  m === "attendance"
                                    ? "Attendance"
                                    : m === "diesel"
                                    ? "Diesel"
                                    : m === "transport"
                                    ? "Transport"
                                    : m.charAt(0).toUpperCase() + m.slice(1);
                                return (
                                  <span
                                    key={m}
                                    className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
                                  >
                                    {modLabel}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">—</span>
                            )}
                          </div>
                        </td>

                        {/* ALL MASTERS & PERMISSIONS Column (ONLY allowed masters) */}
                        <td className="px-4 py-3.5 align-middle">
                          {renderAllowedMasters(r.permissions, r.code)}
                        </td>

                        {/* STATUS Column */}
                        <td className="px-4 py-3.5 align-middle">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              r.active !== false
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {r.active !== false ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {/* ACTION Column with 3-dot menu */}
                        <td className="px-5 py-3.5 align-middle text-right whitespace-nowrap">
                          <RoleActionMenu
                            role={r}
                            onEdit={openEditRoleModal}
                            onToggleStatus={handleToggleRoleStatus}
                            onDelete={handleDeleteRole}
                            busy={busy}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}

      {/* Edit / Create User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2.5 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl my-auto flex flex-col max-h-[92vh] overflow-hidden">
            <div className="flex items-start justify-between border-b border-slate-100 p-4 sm:p-5 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingUser ? `Edit User: ${editingUser.name}` : "Add New User"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure credentials, role, farm access, and fine-grained permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={closeUserModal}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none p-1 cursor-pointer"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {userModalError && <Alert type="error">{userModalError}</Alert>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Full Name *">
                  <input
                    type="text"
                    required
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    className={`${inputClass} !min-h-9 !py-1 text-xs`}
                    placeholder="e.g. Ramesh Kumar"
                  />
                </Field>
                <Field label="Email Address *">
                  <input
                    type="email"
                    required
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className={`${inputClass} !min-h-9 !py-1 text-xs`}
                    placeholder="user@example.com"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label={editingUser ? "New Password (leave blank to keep)" : "Password *"}
                >
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className={`${inputClass} !min-h-9 !py-1 text-xs`}
                    placeholder={editingUser ? "••••••••" : "Min 6 characters"}
                  />
                </Field>

                {/* Dynamic Role Dropdown */}
                <Field label="System Role *">
                  <select
                    value={userForm.role}
                    onChange={(e) => handleRoleChangeForUser(e.target.value)}
                    className={`${inputClass} !min-h-9 !py-1 text-xs font-semibold`}
                  >
                    {roles.map((r) => (
                      <option key={r._id || r.code} value={r.code}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Assigned Farms */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700">
                  Assigned Farms / Firms
                </label>
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2">
                  {firms.map((f) => {
                    const checked = userForm.firms.some((id) => String(id?._id || id) === String(f._id));
                    return (
                      <label
                        key={f._id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer transition select-none ${
                          checked
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUserFirm(f._id)}
                          className="h-3.5 w-3.5 rounded text-emerald-700"
                        />
                        <span className="truncate text-xs">{f.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Allowed Modules - Compact Chips */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Allowed Modules
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {userForm.allowedModules.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                  {AVAILABLE_MODULES.map((m) => {
                    const slug = Array.isArray(m) ? m[0] : m.slug;
                    const label = Array.isArray(m) ? m[1] : m.label;
                    const checked = userForm.allowedModules.includes(slug);
                    return (
                      <button
                        type="button"
                        key={slug}
                        onClick={() => toggleUserModule(slug)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer border ${
                          checked
                            ? "border-sky-300 bg-sky-50 text-sky-800 font-semibold shadow-2xs"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span>{checked ? "✓" : "+"}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* All Masters Access Permissions - Compact 2-col Grid */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-2.5 space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700">
                  Master Access
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[["attendance_edit", "Edit Attendance"], ["asset_master", "Firms & Assets"], ["transport_master", "Transport Vehicles & Stations"]].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 cursor-pointer">
                      <input type="checkbox" checked={Boolean(userForm.permissions[key])} onChange={() => toggleUserPermission(key)} className="h-3.5 w-3.5 rounded text-emerald-700" />
                      <span className="text-xs">{label}</span>
                    </label>
                  ))}
                  <label
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition select-none ${
                      userForm.permissions.attendance_scan
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={userForm.permissions.attendance_scan}
                      onChange={() => toggleUserPermission("attendance_scan")}
                      className="h-3.5 w-3.5 rounded text-emerald-700 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="truncate text-xs">Camera Scan</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition select-none ${
                      userForm.permissions.worker_master
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={userForm.permissions.worker_master}
                      onChange={() => toggleUserPermission("worker_master")}
                      className="h-3.5 w-3.5 rounded text-emerald-700 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="truncate text-xs">Worker Master</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition select-none ${
                      userForm.permissions.attendance_admin_master
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={userForm.permissions.attendance_admin_master}
                      onChange={() => toggleUserPermission("attendance_admin_master")}
                      className="h-3.5 w-3.5 rounded text-emerald-700 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="truncate text-xs">Attendance Master</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition select-none ${
                      userForm.permissions.attendance_report
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={userForm.permissions.attendance_report}
                      onChange={() => toggleUserPermission("attendance_report")}
                      className="h-3.5 w-3.5 rounded text-emerald-700 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="truncate text-xs">Monthly Attendance Report</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={closeUserModal}
                  disabled={busy}
                  className={`${secondaryButton} !min-h-9 !py-1 text-xs w-full sm:w-auto cursor-pointer`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={`${primaryButton} !min-h-9 !py-1 text-xs w-full sm:w-auto cursor-pointer`}
                >
                  {busy ? "Saving…" : editingUser ? "Save Changes" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Create Role Modal - COMPACT SMALL CARD */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2.5 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl my-auto flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 p-3.5 sm:p-4 shrink-0">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {editingRole ? `Edit Role: ${editingRole.name}` : "Add New Role"}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Set default module access and all master permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={closeRoleModal}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none p-1 cursor-pointer"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <form onSubmit={handleSaveRole} className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
              {roleModalError && <Alert type="error">{roleModalError}</Alert>}

              {/* Role Name */}
              <Field label="Role Name *">
                <input
                  type="text"
                  required
                  value={roleForm.name}
                  onChange={(e) => {
                    const nameVal = e.target.value;
                    setRoleForm((prev) => ({
                      ...prev,
                      name: nameVal,
                      code: !editingRole ? nameVal.toLowerCase().replace(/[^a-z0-9_]/g, "_") : prev.code,
                    }));
                  }}
                  className={`${inputClass} !min-h-9 !py-1 text-xs`}
                  placeholder="e.g. Store Manager"
                  autoFocus
                />
              </Field>

              {/* Default Modules for this Role - Compact Chips */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Default Allowed Modules
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {roleForm.allowedModules.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                  {AVAILABLE_MODULES.map((m) => {
                    const slug = Array.isArray(m) ? m[0] : m.slug;
                    const label = Array.isArray(m) ? m[1] : m.label;
                    const checked = roleForm.allowedModules.includes(slug);
                    return (
                      <button
                        type="button"
                        key={slug}
                        onClick={() => toggleRoleModule(slug)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer border ${
                          checked
                            ? "border-sky-300 bg-sky-50 text-sky-800 font-semibold shadow-2xs"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span>{checked ? "✓" : "+"}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Default Master Permissions - Compact 2-col Grid */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-2.5 space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700">
                  Default Master Access
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[["attendance_edit", "Edit Attendance"], ["asset_master", "Firms & Assets"], ["transport_master", "Transport Vehicles & Stations"]].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 cursor-pointer">
                      <input type="checkbox" checked={Boolean(roleForm.permissions[key])} onChange={() => toggleRolePermission(key)} className="h-3.5 w-3.5 rounded text-emerald-700" />
                      <span className="text-xs">{label}</span>
                    </label>
                  ))}
                  <label
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition select-none ${
                      roleForm.permissions.attendance_scan
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.attendance_scan}
                      onChange={() => toggleRolePermission("attendance_scan")}
                      className="h-3.5 w-3.5 rounded text-emerald-700 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="truncate text-xs">Camera Scan</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition select-none ${
                      roleForm.permissions.worker_master
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.worker_master}
                      onChange={() => toggleRolePermission("worker_master")}
                      className="h-3.5 w-3.5 rounded text-emerald-700 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="truncate text-xs">Worker Master</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition select-none ${
                      roleForm.permissions.attendance_admin_master
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.attendance_admin_master}
                      onChange={() => toggleRolePermission("attendance_admin_master")}
                      className="h-3.5 w-3.5 rounded text-emerald-700 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="truncate text-xs">Attendance Master</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition select-none ${
                      roleForm.permissions.attendance_report
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.attendance_report}
                      onChange={() => toggleRolePermission("attendance_report")}
                      className="h-3.5 w-3.5 rounded text-emerald-700 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="truncate text-xs">Monthly Attendance Report</span>
                  </label>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2.5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={closeRoleModal}
                  disabled={busy}
                  className={`${secondaryButton} !min-h-8 !py-1 text-xs w-full sm:w-auto cursor-pointer`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={`${primaryButton} !min-h-8 !py-1 text-xs w-full sm:w-auto cursor-pointer`}
                >
                  {busy ? "Saving…" : editingRole ? "Save Changes" : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

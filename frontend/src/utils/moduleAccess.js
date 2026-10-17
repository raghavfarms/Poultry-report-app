export const AVAILABLE_MODULES = ['diesel', 'transport', 'attendance', 'medicine', 'temperature'];

export function canAccessModule(user, module) {
  if (!user) return false;

  // Unbuilt / un-implemented modules should NOT be accessible or visible to anyone
  if (!AVAILABLE_MODULES.includes(module)) {
    return false;
  }

  // If user has allowedModules configured, respect it strictly for all users, including admin/developer
  if (Array.isArray(user.allowedModules)) {
    return user.allowedModules.includes(module);
  }

  // For temperature module, strict opt-in is required: no user gets access unless explicitly in allowedModules
  if (module === 'temperature') {
    return false;
  }

  // Legacy fallback when allowedModules is not configured on the user:
  // Admin and developer have access to all built modules (except temperature which requires explicit opt-in)
  if (['admin', 'developer'].includes(user.role)) {
    return true;
  }

  if (module === 'medicine') {
    return ['office', 'supervisor', 'farm_incharge'].includes(user.role);
  }

  return ['diesel', 'transport', 'attendance'].includes(module);
}

export function canAccessReport(user, module) {
  return canAccessModule(user, module);
}

export function canAccessMonthlyAttendance(user) {
  return canAccessModule(user, 'attendance') && (
    ['admin', 'developer'].includes(user.role) ||
    user.permissions?.attendance_report === true
  );
}

export function canEditAttendance(user) {
  return canAccessReport(user, 'attendance') && (
    ['admin', 'developer'].includes(user.role) || user.permissions?.attendance_edit === true
  );
}

export function canAutoCutAttendance(user) {
  return canAccessReport(user, 'attendance') && (
    ['admin', 'developer'].includes(user?.role) ||
    user?.permissions?.attendance_autocut === true ||
    user?.permissions?.attendance_edit === true
  );
}

export function canAccessTemperatureEntry(user) {
  if (!user) return false;
  if (!canAccessModule(user, 'temperature')) return false;
  if (['admin', 'developer'].includes(user.role)) return true;
  return user.permissions?.temperature_entry !== false;
}

export function canAccessTemperatureReport(user) {
  if (!user) return false;
  if (!canAccessModule(user, 'temperature')) return false;
  if (['admin', 'developer'].includes(user.role)) return true;
  return user.permissions?.temperature_report === true;
}

export function canAccessTemperatureMaster(user) {
  if (!user) return false;
  if (!canAccessModule(user, 'temperature')) return false;
  return ['admin', 'developer'].includes(user.role) || user.permissions?.temperature_master === true;
}



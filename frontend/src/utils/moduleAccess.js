export const AVAILABLE_MODULES = ['diesel', 'transport', 'attendance', 'medicine', 'temperature'];

export function canAccessModule(user, module) {
  if (!user) return false;

  // Unbuilt / un-implemented modules should NOT be accessible or visible to anyone
  if (!AVAILABLE_MODULES.includes(module)) {
    return false;
  }

  // Admin and developer always have access to all built modules
  if (['admin', 'developer'].includes(user.role)) {
    return true;
  }

  // If user has allowedModules configured, respect it strictly
  if (Array.isArray(user.allowedModules)) {
    return user.allowedModules.includes(module);
  }

  if (module === 'medicine') {
    return ['office', 'supervisor', 'farm_incharge'].includes(user.role);
  }

  return ['diesel', 'transport', 'attendance', 'temperature'].includes(module);
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

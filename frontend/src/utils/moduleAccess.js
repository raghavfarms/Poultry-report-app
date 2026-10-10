export const AVAILABLE_MODULES = ['diesel', 'transport', 'attendance', 'medicine'];

export function canAccessModule(user, module) {
  if (!user) return false;

  // Non-developer users (including admin) cannot access unbuilt / building modules
  if (!AVAILABLE_MODULES.includes(module) && user.role !== 'developer') {
    return false;
  }

  // If user has allowedModules configured, respect it strictly
  if (Array.isArray(user.allowedModules)) {
    return user.allowedModules.includes(module);
  }

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

export function canAccessModule(user, module) {
  return Boolean(user && (
    ['admin', 'developer'].includes(user.role) ||
    user.allowedModules?.includes(module)
  ));
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

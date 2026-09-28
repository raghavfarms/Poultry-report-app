export function canAccessModule(user, module) {
  return Boolean(user && (
    ['admin', 'developer'].includes(user.role) ||
    user.allowedModules?.includes(module)
  ));
}

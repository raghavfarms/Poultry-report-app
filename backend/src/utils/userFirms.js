/**
 * Returns an array of permitted firm ID strings for a specific user and module.
 * If user is admin/developer, returns null (indicating unrestricted access).
 * If user has specific firms configured in user.moduleFirms[moduleName], returns those strictly (even if empty).
 * Otherwise, falls back to user.firms only if per-module firms was never configured for this module.
 */
export function getPermittedFirmsForModule(user, moduleName) {
  if (['admin', 'developer'].includes(user?.role)) {
    return null;
  }

  if (moduleName && user?.moduleFirms && user.moduleFirms[moduleName] !== undefined) {
    const list = Array.isArray(user.moduleFirms[moduleName]) ? user.moduleFirms[moduleName] : [];
    return list.map((f) => String(f?._id || f));
  }

  return (user?.firms || []).map((f) => String(f?._id || f));
}

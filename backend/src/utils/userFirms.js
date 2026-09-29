/**
 * Returns an array of permitted firm ID strings for a specific user and module.
 * If user is admin/developer, returns null (indicating unrestricted access).
 * If user has specific firms configured in user.moduleFirms[moduleName], returns those.
 * Otherwise, falls back to user.firms.
 */
export function getPermittedFirmsForModule(user, moduleName) {
  if (['admin', 'developer'].includes(user?.role)) {
    return null;
  }

  if (moduleName && user?.moduleFirms && Array.isArray(user.moduleFirms[moduleName]) && user.moduleFirms[moduleName].length > 0) {
    return user.moduleFirms[moduleName].map((f) => String(f?._id || f));
  }

  return (user?.firms || []).map((f) => String(f?._id || f));
}

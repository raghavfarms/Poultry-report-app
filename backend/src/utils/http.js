export function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function notFoundError(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

export function conflictError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

export function forbiddenError(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}


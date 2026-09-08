export function createApiClient(base = '/api') {
  return async function request(path, { method = 'GET', body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method, credentials: 'include', cache: 'no-store',
      headers: { 'X-PIT-Client': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(value.error || 'No se pudo completar la operación.'); error.status = response.status; throw error; }
    return value;
  };
}

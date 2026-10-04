export async function api(path, { method = 'GET', body, signal, ignoreAuth = false } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach Smart HMS. Check your connection and try again.', {
      cause: error,
    });
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !ignoreAuth)
      window.dispatchEvent(new Event('hms:session-expired'));
    const error = new Error(data.message || 'The request could not be completed.');
    error.fields = data.fields;
    error.status = response.status;
    throw error;
  }
  return data;
}


const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const TOKEN_KEY = 'asems_token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function saveToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Request failed (${response.status})`;

    if (response.status === 401) {
      clearToken();
    }

    throw new Error(message);
  }

  return payload;
}

export async function loginRequest(email, password, selectedRole) {
  const payload = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, ...(selectedRole ? { selectedRole } : {}) }),
  });

  const token = payload?.data?.token;

  if (!token) {
    throw new Error('Login succeeded, but the server did not return a token.');
  }

  saveToken(token);
  return payload;
}

export async function getCurrentUser() {
  return apiRequest('/auth/me');
}

export async function logoutRequest() {
  clearToken();
}

export async function getApiHealth() {
  return apiRequest('/health');
}

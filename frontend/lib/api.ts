import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attache le token JWT à chaque requête
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = Cookies.get('ridia_access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh automatique du token si expiré (401)
let isRefreshing = false;
let refreshQueue: Array<() => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push(() => resolve(api(originalRequest)));
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = Cookies.get('ridia_refresh_token');
      if (!refreshToken) {
        clearAuthCookies();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        Cookies.set('ridia_access_token', data.accessToken, { expires: 1 });
        Cookies.set('ridia_refresh_token', data.refreshToken, { expires: 30 });

        refreshQueue.forEach((cb) => cb());
        refreshQueue = [];
        isRefreshing = false;

        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        clearAuthCookies();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export function setAuthCookies(accessToken: string, refreshToken: string) {
  Cookies.set('ridia_access_token', accessToken, { expires: 1 }); // 1 jour
  Cookies.set('ridia_refresh_token', refreshToken, { expires: 30 }); // 30 jours
}

export function clearAuthCookies() {
  Cookies.remove('ridia_access_token');
  Cookies.remove('ridia_refresh_token');
}

export function getAccessToken(): string | undefined {
  return Cookies.get('ridia_access_token');
}

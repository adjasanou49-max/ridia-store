import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// `secure: true` uniquement en production - en local (http://localhost) le
// navigateur rejette silencieusement les cookies "secure" sur une connexion
// non chiffrée, ce qui casserait complètement l'authentification en dev.
const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

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
        Cookies.set('ridia_access_token', data.accessToken, { expires: 1, ...COOKIE_OPTIONS });
        Cookies.set('ridia_refresh_token', data.refreshToken, { expires: 30, ...COOKIE_OPTIONS });

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
  Cookies.set('ridia_access_token', accessToken, { expires: 1, ...COOKIE_OPTIONS }); // 1 jour
  Cookies.set('ridia_refresh_token', refreshToken, { expires: 30, ...COOKIE_OPTIONS }); // 30 jours
}

export function clearAuthCookies() {
  Cookies.remove('ridia_access_token');
  Cookies.remove('ridia_refresh_token');
}

export function getAccessToken(): string | undefined {
  return Cookies.get('ridia_access_token');
}

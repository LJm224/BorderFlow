import axios from 'axios';

const configuredApiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
export const API_BASE_URL = configuredApiUrl.endsWith('/api') ? configuredApiUrl : `${configuredApiUrl}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

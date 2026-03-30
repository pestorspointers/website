import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

export const setAuthToken = (token: string): void => {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const clearAuthToken = (): void => {
  delete api.defaults.headers.common['Authorization'];
};

export default api;

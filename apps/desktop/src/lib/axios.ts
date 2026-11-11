import axiosLib from "axios";

export const axios = axiosLib.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
});

// Sign the request in when there's a token. Read on every request: the main
// process holds it in memory, and signing in or out takes effect right away.
axios.interceptors.request.use(async (config) => {
  const token = await window.electron.auth.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

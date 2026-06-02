import axios from "axios";
import { useCsrfStore } from "../../store/csrfStore";

export const api = axios.create({
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const csrfToken = useCsrfStore.getState().csrfToken;

  if (csrfToken) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }

  return config;
});

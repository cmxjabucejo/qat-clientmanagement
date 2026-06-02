// stores/csrfStore.js
import { create } from "zustand";

export const useCsrfStore = create((set) => ({
  csrfToken: null,

  setCsrfToken: (token) => set({ csrfToken: token }),

  clearCsrfToken: () => set({ csrfToken: null }),
}));

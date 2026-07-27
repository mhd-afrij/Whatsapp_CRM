export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
  SYNC_BASE_URL: import.meta.env.VITE_SYNC_BASE_URL ?? "http://localhost:3100",
  APP_NAME: "WhatsApp CRM",
  IS_DEV: import.meta.env.DEV,
  IS_PROD: import.meta.env.PROD,
};

import { authFetch } from "../store/index.js";

export const reportService = {
  getOverview: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return authFetch(`/reports${qs ? `?${qs}` : ""}`);
  },

  getAgentReport: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return authFetch(`/reports/agents${qs ? `?${qs}` : ""}`);
  },

  getContactGrowth: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return authFetch(`/reports/contact-growth${qs ? `?${qs}` : ""}`);
  },

  getLeadConversion: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return authFetch(`/reports/lead-conversion${qs ? `?${qs}` : ""}`);
  },

  getMessageAnalytics: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return authFetch(`/reports/messages${qs ? `?${qs}` : ""}`);
  },

  exportCsv: (type, from, to) => {
    const params = new URLSearchParams({ type });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    window.open(
      `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1"}/reports/export?${params.toString()}`,
      "_blank"
    );
  },
};

import { authFetch } from "../store/index.js";

export const dashboardService = {
  getStats: () => authFetch("/dashboard/stats"),

  getAgentPerformance: () => authFetch("/dashboard/agent-performance"),

  getMessageVolume: (period = "7d") =>
    authFetch(`/dashboard/message-volume?period=${period}`),

  getFunnel: () => authFetch("/dashboard/funnel"),

  getActivity: () => authFetch("/dashboard/activity"),
};

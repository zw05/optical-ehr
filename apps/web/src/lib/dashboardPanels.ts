export const DASHBOARD_PANEL_KEYS = ['appointments', 'orders', 'recalls'] as const;
export type DashboardPanelKey = (typeof DASHBOARD_PANEL_KEYS)[number];

export const DASHBOARD_PANEL_LABELS: Record<DashboardPanelKey, string> = {
  appointments: "Today's Appointments",
  orders: 'Ready for pickup',
  recalls: 'Recalls due',
};

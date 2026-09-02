export const DASHBOARD_PANEL_KEYS = [
  'patientFlow',
  'appointments',
  'unsignedEncounters',
  'myTasks',
  'orders',
  'recalls',
  'orthoK',
  'apptHistory',
] as const;
export type DashboardPanelKey = (typeof DASHBOARD_PANEL_KEYS)[number];

export const DASHBOARD_PANEL_LABELS: Record<DashboardPanelKey, string> = {
  appointments: "Today's Appointments",
  orders: 'Ready for pickup',
  recalls: 'Recalls due',
  orthoK: 'Ortho-K follow-ups',
  myTasks: 'My Tasks',
  apptHistory: 'Appointment History',
  patientFlow: 'Patient Flow',
  unsignedEncounters: 'Unsigned Encounters',
};

/** Issues a report PDF and hands it to the browser per the printing preference. */
import { api } from '@/lib/api';

/**
 * Posts to a report endpoint and either opens the PDF in a new tab or saves it,
 * following the user's Settings → Printing preference. Callers rendering this
 * on a link are responsible for preventing the navigation themselves.
 */
async function printReport(path: string, fileName: string, openInNewTab: boolean): Promise<void> {
  const blob = await api<Blob>(path, { method: 'POST' });
  const url = URL.createObjectURL(blob);
  if (openInNewTab) {
    window.open(url, '_blank');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  }
}

/** Prints the job paper for an optical order (available at any status). */
export function printOrder(orderId: string, openInNewTab: boolean) {
  return printReport(`/reports/orders/${orderId}`, `order-${orderId}.pdf`, openInNewTab);
}

/** Prints a finalized prescription. */
export function printRx(prescriptionId: string, openInNewTab: boolean) {
  return printReport(
    `/reports/prescriptions/${prescriptionId}`,
    `prescription-${prescriptionId}.pdf`,
    openInNewTab,
  );
}

'use client';

/**
 * The follow-up sequence for one enrollment, read left to right: a chip per
 * scheduled check, filled once the visit is logged, amber when due and red once
 * missed. Interim visits appear as a small dot between chips, so an unscheduled
 * check is visible without disturbing the sequence staff are tracking.
 */
import {
  MILESTONE_SHORT_LABELS,
  formatDate,
  milestoneLabel,
  type MilestoneStatus,
  type OrthoKVisit,
} from '@/lib/orthoK';

interface MilestoneStripProps {
  milestones: MilestoneStatus[];
  visits?: OrthoKVisit[];
  /** Larger chips with the due date beneath, for the enrollment detail page. */
  size?: 'compact' | 'full';
}

/** Hover text: what the chip is, and either when it happened or when it is owed. */
function chipTitle(status: MilestoneStatus): string {
  const label = milestoneLabel(status.milestone);
  if (status.state === 'DONE') return `${label} — seen ${formatDate(status.visitDate)}`;
  if (status.state === 'OVERDUE') {
    return `${label} — due ${formatDate(status.dueDate)}, ${status.daysLate} day${
      status.daysLate === 1 ? '' : 's'
    } late`;
  }
  return `${label} — due ${formatDate(status.dueDate)}`;
}

export default function MilestoneStrip({
  milestones,
  visits = [],
  size = 'compact',
}: MilestoneStripProps) {
  if (milestones.length === 0) {
    return <span className="muted">Not started</span>;
  }

  const interim = visits.filter((v) => v.milestone === 'INTERIM');

  return (
    <div className={`ok-strip ok-strip-${size}`} role="list">
      {milestones.map((status) => (
        <div
          key={`${status.milestone}-${status.occurrence}`}
          role="listitem"
          className={`ok-chip ok-chip-${status.state.toLowerCase()}`}
          title={chipTitle(status)}
        >
          {/* No occurrence suffix: the strip covers a single program year, and each
              chip carries its own date, so a running total would only mislead. */}
          <span className="ok-chip-label">{MILESTONE_SHORT_LABELS[status.milestone]}</span>
          {size === 'full' && (
            <span className="ok-chip-date">
              {status.state === 'DONE' ? formatDate(status.visitDate) : formatDate(status.dueDate)}
            </span>
          )}
        </div>
      ))}
      {interim.length > 0 && (
        <span
          className="ok-interim"
          title={interim
            .map((v) => `Interim visit ${formatDate(v.visitDate)}${v.note ? ` — ${v.note}` : ''}`)
            .join('\n')}
        >
          {interim.map((v) => (
            <span key={v.id} className="ok-interim-dot" aria-hidden />
          ))}
          <span className="ok-interim-count">
            {interim.length} interim visit{interim.length === 1 ? '' : 's'}
          </span>
        </span>
      )}
    </div>
  );
}

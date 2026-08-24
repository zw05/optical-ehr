'use client';

/**
 * The follow-up sequence for one program year, drawn as a timeline.
 *
 * Colour marks only what needs doing: completed and future checks are neutral,
 * and the one check that is due or overdue is the single thing on the row that
 * carries a hue. Colouring every state turns the sequence into a traffic light
 * and buries the item staff are meant to act on.
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
}

/** Hover text: what the check is, and either when it happened or when it is owed. */
function markerTitle(status: MilestoneStatus): string {
  const label = milestoneLabel(status.milestone);
  if (status.state === 'DONE') return `${label} — seen ${formatDate(status.visitDate)}`;
  if (status.state === 'OVERDUE') {
    return `${label} — due ${formatDate(status.dueDate)}, ${status.daysLate} day${
      status.daysLate === 1 ? '' : 's'
    } late`;
  }
  return `${label} — due ${formatDate(status.dueDate)}`;
}

export default function MilestoneStrip({ milestones, visits = [] }: MilestoneStripProps) {
  if (milestones.length === 0) {
    return <span className="muted">Not started</span>;
  }

  const interim = visits.filter((v) => v.milestone === 'INTERIM');

  return (
    <>
      <ol className="ok-track">
        {milestones.map((status) => (
          <li
            key={`${status.milestone}-${status.occurrence}`}
            className={`ok-track-step ok-track-${status.state.toLowerCase()}`}
            title={markerTitle(status)}
          >
            <span className="ok-track-label">{MILESTONE_SHORT_LABELS[status.milestone]}</span>
            <span className="ok-track-marker" aria-hidden />
            <span className="ok-track-date">
              {status.state === 'DONE' ? formatDate(status.visitDate) : formatDate(status.dueDate)}
            </span>
          </li>
        ))}
      </ol>
      {interim.length > 0 && (
        <p
          className="muted ok-track-interim"
          title={interim
            .map((v) => `Interim visit ${formatDate(v.visitDate)}${v.note ? ` — ${v.note}` : ''}`)
            .join('\n')}
        >
          {interim.length} interim visit{interim.length === 1 ? '' : 's'} in between
        </p>
      )}
    </>
  );
}

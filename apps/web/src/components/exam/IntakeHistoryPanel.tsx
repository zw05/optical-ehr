'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getSessionUser } from '@/lib/api';
import {
  INTAKE_ALLERGIES,
  INTAKE_ALLERGY_OTHER,
  INTAKE_GROUPS,
  INTAKE_NKDA,
  INTAKE_TEXT_FIELDS,
  intakeProgress,
  intakeQuestionKey,
  negativePatchForGroup,
  opensDetail,
  type IntakeAnswers,
  type IntakeGroup,
} from '@/lib/intakeHistory';
import { TriStateRow } from './TriStateRow';

interface HistoryReview {
  id: string;
  reviewedAt: string;
  changesNoted: boolean;
  note: string | null;
  reviewedBy: { firstName: string; lastName: string; licenseNumber: string | null };
}

interface IntakeHistoryResponse {
  answers: IntakeAnswers;
  patientSignedAt: string | null;
  updatedAt: string | null;
  reviews: HistoryReview[];
}

interface IntakeHistoryPanelProps {
  patientId: string;
  encounterId: string;
  readOnly?: boolean;
}

/**
 * The paper intake page, rendered against the patient's chart rather than the
 * visit. A returning patient's answers are already here, so the common case is
 * one click on "Reviewed — no changes" instead of re-asking thirty questions.
 */
export function IntakeHistoryPanel({ patientId, encounterId, readOnly }: IntakeHistoryPanelProps) {
  const user = typeof window !== 'undefined' ? getSessionUser() : null;
  const canReview = user?.role === 'DOCTOR';

  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [reviews, setReviews] = useState<HistoryReview[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<IntakeHistoryResponse>(`/patients/${patientId}/intake-history`);
      setAnswers((data.answers ?? {}) as IntakeAnswers);
      setReviews(data.reviews ?? []);
      setUpdatedAt(data.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const progress = useMemo(() => intakeProgress(answers), [answers]);
  const lastReview = reviews[0];

  function patch(next: IntakeAnswers) {
    setAnswers((prev) => ({ ...prev, ...next }));
    setDirty(true);
    setSaveState('idle');
  }

  function setStatus(key: string, status: string) {
    patch({ [key]: { ...(answers[key] ?? {}), status } });
  }

  function setDetail(key: string, detail: string) {
    patch({ [key]: { status: answers[key]?.status ?? '', detail } });
  }

  function setText(key: string, detail: string) {
    patch({ [key]: { status: answers[key]?.status ?? '', detail } });
  }

  function toggleFlag(key: string) {
    const on = answers[key]?.status === 'yes';
    patch({ [key]: { status: on ? 'no' : 'yes' } });
  }

  async function save() {
    setSaveState('saving');
    setError(null);
    try {
      await api(`/patients/${patientId}/intake-history`, {
        method: 'PUT',
        body: { answers },
      });
      setDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      await load();
    } catch (err) {
      setSaveState('idle');
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  /** The paper's "Re-Reviewed Date / Dr.'s Signature" line. */
  async function review(changesNoted: boolean) {
    setError(null);
    try {
      if (dirty) await save();
      await api(`/patients/${patientId}/intake-history/review`, {
        method: 'POST',
        body: { changesNoted, encounterId },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record review');
    }
  }

  function markGroupNegative(group: IntakeGroup) {
    patch(negativePatchForGroup(group, answers));
  }

  function markAllNegative() {
    let next: IntakeAnswers = {};
    for (const group of INTAKE_GROUPS) {
      next = { ...next, ...negativePatchForGroup(group, { ...answers, ...next }) };
    }
    patch(next);
  }

  if (loading) return <p className="muted">Loading history…</p>;

  return (
    <div className="intake-panel">
      <div className="intake-review-banner">
        <div>
          <strong>
            {lastReview
              ? `Last reviewed ${new Date(lastReview.reviewedAt).toLocaleDateString()} by Dr. ${lastReview.reviewedBy.lastName}`
              : 'Not yet reviewed'}
          </strong>
          <p className="muted" style={{ margin: 0 }}>
            {progress.answered} of {progress.total} questions answered
            {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleDateString()}` : ''}
            {lastReview?.changesNoted ? ' · changes were noted' : ''}
          </p>
        </div>
        {!readOnly && canReview && (
          <div className="toolbar">
            <button type="button" onClick={() => review(false)}>
              Reviewed — no changes
            </button>
            <button type="button" className="secondary" onClick={() => review(true)}>
              Reviewed — changes noted
            </button>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="toolbar intake-toolbar">
          <button type="button" className="secondary" onClick={markAllNegative}>
            Mark all unanswered “No”
          </button>
          <button type="button" onClick={save} disabled={!dirty || saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save history'}
          </button>
          {dirty && <span className="muted">Unsaved changes</span>}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {INTAKE_GROUPS.map((group) => (
        <section key={group.key} className="intake-group">
          <div className="exam-section-header">
            <h3>{group.title}</h3>
            {!readOnly && (
              <button
                type="button"
                className="secondary"
                onClick={() => markGroupNegative(group)}
              >
                All “No”
              </button>
            )}
          </div>
          {group.prompt && <p className="muted intake-prompt">{group.prompt}</p>}
          <div className="intake-rows">
            <div className="intake-row intake-row-head" aria-hidden="true">
              <div className="intake-row-label" />
              <div className="intake-segmented-head">CE = can’t elaborate</div>
              <div className="intake-row-detail">{group.detailLabel}</div>
            </div>
            {group.questions.map((question) => {
              const key = intakeQuestionKey(group.key, question.key);
              const answer = answers[key] ?? { status: '' };
              return (
                <TriStateRow
                  key={key}
                  label={question.label}
                  options={question.options ?? group.options}
                  value={answer.status ?? ''}
                  detail={answer.detail ?? ''}
                  showDetail={opensDetail(group, question, answer.status ?? '')}
                  detailPlaceholder={group.detailPlaceholder ?? group.detailLabel}
                  disabled={readOnly}
                  onChange={(status) => setStatus(key, status)}
                  onDetailChange={(detail) => setDetail(key, detail)}
                />
              );
            })}
          </div>
        </section>
      ))}

      <section className="intake-group">
        <div className="exam-section-header">
          <h3>Surgical history, allergies & medications</h3>
        </div>
        <div className="exam-field-grid" data-columns={1}>
          <div className="field">
            <label>Allergies</label>
            <div className="exam-checkbox-grid">
              <label className="exam-choice">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={answers[INTAKE_NKDA]?.status === 'yes'}
                  onChange={() => toggleFlag(INTAKE_NKDA)}
                />
                NKDA (no known drug allergies)
              </label>
              {INTAKE_ALLERGIES.map((allergy) => (
                <label key={allergy.key} className="exam-choice">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={answers[allergy.key]?.status === 'yes'}
                    onChange={() => toggleFlag(allergy.key)}
                  />
                  {allergy.label}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Other allergies</label>
            <input
              disabled={readOnly}
              value={answers[INTAKE_ALLERGY_OTHER]?.detail ?? ''}
              onChange={(e) => setText(INTAKE_ALLERGY_OTHER, e.target.value)}
            />
          </div>
          {INTAKE_TEXT_FIELDS.map((field) => (
            <div key={field.key} className="field">
              <label>{field.label}</label>
              <input
                disabled={readOnly}
                placeholder={field.placeholder}
                value={answers[field.key]?.detail ?? ''}
                onChange={(e) => setText(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="intake-group">
          <div className="exam-section-header">
            <h3>Review history</h3>
          </div>
          <ul className="intake-review-list">
            {reviews.map((r) => (
              <li key={r.id}>
                {new Date(r.reviewedAt).toLocaleString()} — Dr. {r.reviewedBy.lastName}
                {r.changesNoted ? ' · changes noted' : ' · no changes'}
                {r.note ? ` · ${r.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

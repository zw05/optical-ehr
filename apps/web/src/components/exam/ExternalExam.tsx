'use client';

import { useState } from 'react';
import { DrawingPad } from './drawing/DrawingPad';
import { AnteriorEyeSvg, CorneaSvg, GonioXSvg, LensSvg } from './drawing/diagrams';
import {
  CORNEA_FINDINGS,
  PIGMENTATION_OPTIONS,
  type ExternalExamValue,
  type GonioQuadrants,
  type Pad,
  type Stroke,
  normalizeExternalExam,
} from './drawing/types';

interface ExternalExamProps {
  value: unknown;
  disabled?: boolean;
  onChange: (value: ExternalExamValue) => void;
}

type Tool = { color: string; width: number };
type SlePads = ExternalExamValue['sle'];
type CorneaPads = Pick<ExternalExamValue['cornea'], 'od' | 'os'>;

const DEFAULT_TOOL: Tool = { color: '#000000', width: 1 };

function clonePad(pad: Pad): Pad {
  return { strokes: pad.strokes.map((s) => ({ ...s, points: [...s.points] as [number, number][] })) };
}

function cloneSle(pads: SlePads): SlePads {
  return { od: clonePad(pads.od), os: clonePad(pads.os), lensOd: clonePad(pads.lensOd), lensOs: clonePad(pads.lensOs) };
}

function cloneCornea(pads: CorneaPads): CorneaPads {
  return { od: clonePad(pads.od), os: clonePad(pads.os) };
}

function emptySle(): SlePads {
  return { od: { strokes: [] }, os: { strokes: [] }, lensOd: { strokes: [] }, lensOs: { strokes: [] } };
}

function DrawToolbar({
  tool,
  onTool,
  onClear,
  onUndo,
  disabled,
  canUndo,
}: {
  tool: Tool;
  onTool: (tool: Tool) => void;
  onClear: () => void;
  onUndo: () => void;
  disabled?: boolean;
  canUndo: boolean;
}) {
  return (
    <div className="exam-draw-toolbar">
      <input
        type="color"
        value={tool.color}
        disabled={disabled}
        aria-label="Draw color"
        onChange={(e) => onTool({ ...tool, color: e.target.value })}
      />
      <input
        type="number"
        min={1}
        max={20}
        value={tool.width}
        disabled={disabled}
        aria-label="Line thickness"
        onChange={(e) => onTool({ ...tool, width: Math.max(1, Number(e.target.value) || 1) })}
      />
      <button type="button" className="secondary" disabled={disabled} onClick={onClear}>
        Clear
      </button>
      <button type="button" className="secondary" disabled={disabled || !canUndo} onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}

const GONIO_ARMS: { key: keyof GonioQuadrants; className: string }[] = [
  { key: 'superior', className: 'tl' },
  { key: 'nasal', className: 'tr' },
  { key: 'inferior', className: 'br' },
  { key: 'temporal', className: 'bl' },
];

function GonioEye({
  eye,
  grades,
  disabled,
  onChange,
}: {
  eye: 'od' | 'os';
  grades: GonioQuadrants;
  disabled?: boolean;
  onChange: (grades: GonioQuadrants) => void;
}) {
  const nasalOnRight = eye === 'od';
  return (
    <div className="exam-gonio-eye">
      <div className="exam-gonio-label">{eye.toUpperCase()}</div>
      <div className="exam-gonio-diagram">
        <GonioXSvg />
        <span className="exam-gonio-dir s">S</span>
        <span className="exam-gonio-dir i">I</span>
        <span className="exam-gonio-dir l">{nasalOnRight ? 'T' : 'N'}</span>
        <span className="exam-gonio-dir r">{nasalOnRight ? 'N' : 'T'}</span>
        {GONIO_ARMS.map((arm) => {
          const quadrant =
            eye === 'os' && (arm.key === 'nasal' || arm.key === 'temporal')
              ? arm.key === 'nasal'
                ? 'temporal'
                : 'nasal'
              : arm.key;
          return (
            <label key={arm.key} className={`exam-gonio-arm ${arm.className}`}>
              <span className="exam-gonio-ticks" aria-hidden>
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
              </span>
              <input
                type="range"
                min={1}
                max={4}
                step={1}
                disabled={disabled}
                value={grades[quadrant]}
                aria-label={`${eye.toUpperCase()} ${quadrant} angle`}
                onChange={(e) => onChange({ ...grades, [quadrant]: Number(e.target.value) })}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Three-panel anterior-segment exam: SLE drawings, cornea drawings, gonioscopy grades. */
export function ExternalExam({ value, disabled, onChange }: ExternalExamProps) {
  const data = normalizeExternalExam(value);
  const [collapsed, setCollapsed] = useState(false);
  const [sleTool, setSleTool] = useState<Tool>(DEFAULT_TOOL);
  const [corneaTool, setCorneaTool] = useState<Tool>(DEFAULT_TOOL);
  const [sleUndo, setSleUndo] = useState<SlePads[]>([]);
  const [corneaUndo, setCorneaUndo] = useState<CorneaPads[]>([]);

  function commit(next: ExternalExamValue) {
    onChange(next);
  }

  function setSlePad(key: keyof SlePads, strokes: Stroke[]) {
    setSleUndo((stack) => [...stack, cloneSle(data.sle)]);
    commit({ ...data, sle: { ...data.sle, [key]: { strokes } } });
  }

  function setCorneaPad(key: 'od' | 'os', strokes: Stroke[]) {
    setCorneaUndo((stack) => [...stack, cloneCornea({ od: data.cornea.od, os: data.cornea.os })]);
    commit({ ...data, cornea: { ...data.cornea, [key]: { strokes } } });
  }

  function clearSle() {
    setSleUndo((stack) => [...stack, cloneSle(data.sle)]);
    commit({ ...data, sle: emptySle() });
  }

  function undoSle() {
    if (sleUndo.length === 0) return;
    const prev = sleUndo[sleUndo.length - 1];
    setSleUndo((stack) => stack.slice(0, -1));
    commit({ ...data, sle: prev });
  }

  function clearCornea() {
    setCorneaUndo((stack) => [...stack, cloneCornea({ od: data.cornea.od, os: data.cornea.os })]);
    commit({ ...data, cornea: { ...data.cornea, od: { strokes: [] }, os: { strokes: [] } } });
  }

  function undoCornea() {
    if (corneaUndo.length === 0) return;
    const prev = corneaUndo[corneaUndo.length - 1];
    setCorneaUndo((stack) => stack.slice(0, -1));
    commit({ ...data, cornea: { ...data.cornea, ...prev } });
  }

  function toggleFinding(finding: string) {
    const has = data.cornea.findings.includes(finding);
    const findings = has
      ? data.cornea.findings.filter((f) => f !== finding)
      : [...data.cornea.findings, finding];
    commit({ ...data, cornea: { ...data.cornea, findings } });
  }

  return (
    <div className="exam-w-full exam-external">
      <div className="exam-external-header">
        <h2>External Exam</h2>
        <button
          type="button"
          className="exam-external-collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand External Exam' : 'Collapse External Exam'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div className="exam-external-grid">
          <section className="exam-external-card">
            <div className="exam-external-card-head">
              <h3>SLE</h3>
              <DrawToolbar
                tool={sleTool}
                onTool={setSleTool}
                onClear={clearSle}
                onUndo={undoSle}
                disabled={disabled}
                canUndo={sleUndo.length > 0}
              />
            </div>
            <div className="exam-sle-body">
              <DrawingPad
                label="OD"
                strokes={data.sle.od.strokes}
                color={sleTool.color}
                width={sleTool.width}
                disabled={disabled}
                onChange={(strokes) => setSlePad('od', strokes)}
              >
                <AnteriorEyeSvg />
              </DrawingPad>
              <DrawingPad
                label="OS"
                strokes={data.sle.os.strokes}
                color={sleTool.color}
                width={sleTool.width}
                disabled={disabled}
                onChange={(strokes) => setSlePad('os', strokes)}
              >
                <AnteriorEyeSvg />
              </DrawingPad>
              <div className="exam-sle-lenses">
                <div className="exam-sle-lenses-title">Lens</div>
                <DrawingPad
                  label="OD"
                  className="exam-draw-pad-lens"
                  strokes={data.sle.lensOd.strokes}
                  color={sleTool.color}
                  width={sleTool.width}
                  disabled={disabled}
                  onChange={(strokes) => setSlePad('lensOd', strokes)}
                >
                  <LensSvg />
                </DrawingPad>
                <DrawingPad
                  label="OS"
                  className="exam-draw-pad-lens"
                  strokes={data.sle.lensOs.strokes}
                  color={sleTool.color}
                  width={sleTool.width}
                  disabled={disabled}
                  onChange={(strokes) => setSlePad('lensOs', strokes)}
                >
                  <LensSvg />
                </DrawingPad>
              </div>
            </div>
          </section>

          <section className="exam-external-card">
            <div className="exam-external-card-head">
              <h3>Cornea</h3>
              <DrawToolbar
                tool={corneaTool}
                onTool={setCorneaTool}
                onClear={clearCornea}
                onUndo={undoCornea}
                disabled={disabled}
                canUndo={corneaUndo.length > 0}
              />
            </div>
            <div className="exam-cornea-body">
              <DrawingPad
                label="OD"
                className="exam-draw-pad-cornea"
                strokes={data.cornea.od.strokes}
                color={corneaTool.color}
                width={corneaTool.width}
                disabled={disabled}
                onChange={(strokes) => setCorneaPad('od', strokes)}
              >
                <CorneaSvg />
              </DrawingPad>
              <DrawingPad
                label="OS"
                className="exam-draw-pad-cornea"
                strokes={data.cornea.os.strokes}
                color={corneaTool.color}
                width={corneaTool.width}
                disabled={disabled}
                onChange={(strokes) => setCorneaPad('os', strokes)}
              >
                <CorneaSvg />
              </DrawingPad>
            </div>
            <div className="exam-cornea-pills" role="group" aria-label="Cornea findings">
              {CORNEA_FINDINGS.map((finding) => {
                const on = data.cornea.findings.includes(finding.value);
                return (
                  <button
                    key={finding.value}
                    type="button"
                    className={`exam-cornea-pill${on ? ' on' : ''}`}
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => toggleFinding(finding.value)}
                  >
                    {finding.label}
                  </button>
                );
              })}
            </div>
            <label className="exam-external-notes">
              <span>Notes</span>
              <textarea
                rows={3}
                disabled={disabled}
                value={data.cornea.notes}
                onChange={(e) => commit({ ...data, cornea: { ...data.cornea, notes: e.target.value } })}
              />
            </label>
          </section>

          <section className="exam-external-card">
            <div className="exam-external-card-head">
              <h3>Gonioscopy</h3>
            </div>
            <div className="exam-gonio-body">
              <GonioEye
                eye="od"
                grades={data.gonio.od}
                disabled={disabled}
                onChange={(od) => commit({ ...data, gonio: { ...data.gonio, od } })}
              />
              <GonioEye
                eye="os"
                grades={data.gonio.os}
                disabled={disabled}
                onChange={(os) => commit({ ...data, gonio: { ...data.gonio, os } })}
              />
            </div>
            <div className="exam-gonio-pigment">
              <label>
                <span>OD Pigmentation</span>
                <select
                  disabled={disabled}
                  value={data.gonio.pigmentationOd}
                  onChange={(e) => commit({ ...data, gonio: { ...data.gonio, pigmentationOd: e.target.value } })}
                >
                  <option value="">—</option>
                  {PIGMENTATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>OS Pigmentation</span>
                <select
                  disabled={disabled}
                  value={data.gonio.pigmentationOs}
                  onChange={(e) => commit({ ...data, gonio: { ...data.gonio, pigmentationOs: e.target.value } })}
                >
                  <option value="">—</option>
                  {PIGMENTATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="exam-external-notes">
              <span>Notes</span>
              <textarea
                rows={3}
                disabled={disabled}
                value={data.gonio.notes}
                onChange={(e) => commit({ ...data, gonio: { ...data.gonio, notes: e.target.value } })}
              />
            </label>
          </section>
        </div>
      )}
    </div>
  );
}

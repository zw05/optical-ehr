'use client';

import { useCallback, useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import type { Stroke } from './types';

interface DrawingPadProps {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  color: string;
  width: number;
  disabled?: boolean;
  label: string;
  children: ReactNode;
  className?: string;
}

function paint(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  current: Stroke | null,
  cssW: number,
  cssH: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of current ? [...strokes, current] : strokes) {
    if (stroke.points.length === 0) continue;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    const [x0, y0] = stroke.points[0];
    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(x0 * cssW, y0 * cssH, Math.max(stroke.width / 2, 0.75), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(x0 * cssW, y0 * cssH);
    for (let i = 1; i < stroke.points.length; i++) {
      const [x, y] = stroke.points[i];
      ctx.lineTo(x * cssW, y * cssH);
    }
    ctx.stroke();
  }
}

/** Canvas overlay that records freehand strokes in normalized 0–1 coordinates. */
export function DrawingPad({
  strokes,
  onChange,
  color,
  width,
  disabled,
  label,
  children,
  className,
}: DrawingPadProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const currentRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelW = Math.round(cssW * dpr);
    const pixelH = Math.round(cssH * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    paint(ctx, strokesRef.current, currentRef.current, cssW, cssH, dpr);
  }, []);

  useEffect(() => {
    redraw();
  }, [strokes, redraw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);

  function pointFromEvent(e: PointerEvent<HTMLCanvasElement>): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [x, y];
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (disabled || e.button !== 0) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    currentRef.current = { color, width, points: [point] };
    redraw();
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !currentRef.current) return;
    const point = pointFromEvent(e);
    if (!point) return;
    const pts = currentRef.current.points;
    const last = pts[pts.length - 1];
    const dx = point[0] - last[0];
    const dy = point[1] - last[1];
    if (dx * dx + dy * dy < 0.00002) return;
    pts.push(point);
    redraw();
  }

  function endStroke(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const stroke = currentRef.current;
    currentRef.current = null;
    if (stroke && stroke.points.length > 0) {
      onChange([...strokesRef.current, stroke]);
    } else {
      redraw();
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`exam-draw-pad${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="exam-draw-bg" aria-hidden>
        {children}
      </div>
      <canvas
        ref={canvasRef}
        className="exam-draw-canvas"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      <span className="exam-draw-label">{label}</span>
    </div>
  );
}

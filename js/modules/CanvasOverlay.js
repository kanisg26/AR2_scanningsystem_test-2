/**
 * Canvas overlay for drawing markers, lines, and distance labels on camera feed
 * @module modules/CanvasOverlay
 */

import {
  MARKER_RADIUS, MARKER_COLOR, MARKER_STROKE, MARKER_STROKE_WIDTH,
  ROUTE_COLOR, ROUTE_LINE_WIDTH,
  DISTANCE_FONT, DISTANCE_LABEL_COLOR, DISTANCE_LABEL_BG, DISTANCE_LABEL_PADDING
} from '../config.js';

export default class CanvasOverlay {
  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {Function} onTap - Callback(screenX, screenY) when user taps the canvas
   */
  constructor(canvasEl, onTap) {
    this._canvas = canvasEl;
    this._ctx = canvasEl.getContext('2d');
    this._onTap = onTap;
    this._points = [];
    this._dpr = window.devicePixelRatio || 1;
    this._snapshotImg = null; // Image element for frozen background

    this._bindEvents();
  }

  /**
   * Synchronizes canvas resolution with its CSS display size
   * Must be called whenever the container resizes
   */
  syncSize() {
    const rect = this._canvas.getBoundingClientRect();
    this._canvas.width = rect.width * this._dpr;
    this._canvas.height = rect.height * this._dpr;
    this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.redraw();
  }

  /**
   * Updates the point data and redraws
   * @param {Array<{screenX: number, screenY: number, distanceToNext: number|null}>} points
   */
  setPoints(points) {
    this._points = points;
    this.redraw();
  }

  /**
   * Sets a snapshot image as frozen background
   * @param {string|null} dataUrl - Data URL from CameraManager.captureFrame(), or null to clear
   */
  setSnapshot(dataUrl) {
    if (!dataUrl) {
      this._snapshotImg = null;
      this.redraw();
      return;
    }
    const img = new Image();
    img.onload = () => {
      this._snapshotImg = img;
      this.redraw();
    };
    img.src = dataUrl;
  }

  /** Clears and redraws all markers, lines, and labels */
  redraw() {
    const ctx = this._ctx;
    const rect = this._canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw snapshot background if present
    if (this._snapshotImg) {
      ctx.drawImage(this._snapshotImg, 0, 0, rect.width, rect.height);
    }

    if (this._points.length === 0) return;

    // Draw lines between consecutive points
    this._drawLines(ctx);

    // Draw distance labels on each segment
    this._drawDistanceLabels(ctx);

    // Draw markers on each point
    this._drawMarkers(ctx);
  }

  /** Draws red lines connecting consecutive points */
  _drawLines(ctx) {
    if (this._points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = ROUTE_COLOR;
    ctx.lineWidth = ROUTE_LINE_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const first = this._points[0];
    ctx.moveTo(first.screenX, first.screenY);

    for (let i = 1; i < this._points.length; i++) {
      const p = this._points[i];
      ctx.lineTo(p.screenX, p.screenY);
    }

    ctx.stroke();
  }

  /** Draws yellow circle markers at each point */
  _drawMarkers(ctx) {
    this._points.forEach((p, i) => {
      // Outer stroke
      ctx.beginPath();
      ctx.arc(p.screenX, p.screenY, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_COLOR;
      ctx.fill();
      ctx.strokeStyle = MARKER_STROKE;
      ctx.lineWidth = MARKER_STROKE_WIDTH;
      ctx.stroke();

      // Point number
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.screenX, p.screenY);
    });
  }

  /** Draws distance labels at midpoint of each segment */
  _drawDistanceLabels(ctx) {
    for (let i = 0; i < this._points.length - 1; i++) {
      const p1 = this._points[i];
      const p2 = this._points[i + 1];
      const dist = p1.distanceToNext;

      if (dist === null || dist === undefined) continue;

      const label = `${dist.toFixed(2)}m`;
      const midX = (p1.screenX + p2.screenX) / 2;
      const midY = (p1.screenY + p2.screenY) / 2;

      ctx.font = DISTANCE_FONT;
      const metrics = ctx.measureText(label);
      const tw = metrics.width;
      const th = 14;
      const pad = DISTANCE_LABEL_PADDING;

      // Background
      ctx.fillStyle = DISTANCE_LABEL_BG;
      ctx.fillRect(
        midX - tw / 2 - pad,
        midY - th / 2 - pad,
        tw + pad * 2,
        th + pad * 2
      );

      // Text
      ctx.fillStyle = DISTANCE_LABEL_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, midX, midY);
    }
  }

  /** Binds tap/click events on the canvas */
  _bindEvents() {
    // Use pointerdown for unified touch/mouse handling
    this._canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const rect = this._canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this._onTap(x, y);
    });

    // Sync canvas size on window resize
    this._resizeObserver = new ResizeObserver(() => this.syncSize());
    this._resizeObserver.observe(this._canvas.parentElement);
  }

  /** Returns the CSS display size of the canvas */
  getDisplaySize() {
    const rect = this._canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}

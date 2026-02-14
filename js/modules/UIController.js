/**
 * Controls camera UI, point list, distance+direction dialog interactions
 * @module modules/UIController
 */

import { $, setText, createElement } from '../utils/dom.js';
import { formatDistance } from '../utils/math.js';

/** Relative-angle presets for manual direction input */
const DIR_PRESETS = {
  straight: { dHeading: 0,   elevation: 0 },
  left:     { dHeading: -90, elevation: 0 },
  right:    { dHeading: +90, elevation: 0 },
  up:       { dHeading: 0,   elevation: 45 },
  down:     { dHeading: 0,   elevation: -45 }
};

export default class UIController {
  /**
   * @param {import('./PointManager.js').default} pointManager
   */
  constructor(pointManager) {
    this._pm = pointManager;
    this._listContainer = $('point-list');

    // Distance dialog state
    this._distanceResolve = null;
    this._pendingSegmentIndex = null;

    // Direction state (set per dialog call)
    this._dirMode = null;           // 'sensor' | 'manual' | null
    this._pendingReading = null;    // sensor reading (sensor mode)
    this._pendingPrevHeading = 0;   // previous heading (manual mode)
    this._selectedDir = null;       // preset key (manual mode)

    this._bindDistanceDialog();
    this._bindDirectionButtons();
    this._pm.onChange(() => this._renderList());
  }

  /* ── Dialog Bindings ─────────────────────────────────── */

  _bindDistanceDialog() {
    $('form-distance').addEventListener('submit', (e) => {
      e.preventDefault();
      this._submitDistance();
    });
    $('btn-distance-skip').addEventListener('click', () => {
      this._resolveDistance(null);
    });
    $('modal-distance').addEventListener('click', (e) => {
      if (e.target.id === 'modal-distance') this._resolveDistance(null);
    });
  }

  _bindDirectionButtons() {
    document.querySelectorAll('.btn-direction').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        this._selectedDir = e.currentTarget.dataset.dir;
      });
    });
  }

  /* ── Distance + Direction Prompt ─────────────────────── */

  /**
   * Opens the distance dialog with optional direction input.
   * @param {number} segmentIndex
   * @param {boolean} isFirst
   * @param {Object|null} dirOptions
   *   { mode: 'sensor'|'manual',
   *     reading?: { heading, elevation, source },
   *     prevHeading?: number }
   * @returns {Promise<{ distance: number|null, memo: string,
   *           heading: number|null, elevation: number|null,
   *           directionSource: string|null }>}
   */
  promptDistance(segmentIndex, isFirst, dirOptions = null) {
    return new Promise((resolve) => {
      this._distanceResolve = resolve;
      this._pendingSegmentIndex = segmentIndex;
      this._dirMode = dirOptions?.mode || null;
      this._pendingReading = null;
      this._selectedDir = null;

      // Title
      const title = isFirst
        ? '\u6700\u521D\u306E\u533A\u9593: \u5B9F\u6E2C\u8DDD\u96E2\u3092\u5165\u529B\uFF08\u6821\u6B63\u57FA\u6E96\uFF09'
        : `\u533A\u9593 ${segmentIndex + 1} \u306E\u8DDD\u96E2`;
      setText('distance-dialog-title', title);

      // Estimated distance
      const estimated = this._pm.estimateDistance(segmentIndex);
      const estimatedEl = $('distance-estimated');
      if (estimated !== null) {
        $('distance-estimated-value').textContent = `${formatDistance(estimated)}m`;
        estimatedEl.hidden = false;
        $('input-distance').placeholder = formatDistance(estimated);
      } else {
        estimatedEl.hidden = true;
        $('input-distance').placeholder = '\u4F8B: 0.52';
      }

      // Direction section
      this._setupDirectionSection(dirOptions);

      $('input-distance').value = '';
      $('input-point-memo').value = '';
      $('modal-distance').hidden = false;
      $('input-distance').focus();
    });
  }

  _setupDirectionSection(dirOptions) {
    const section = $('direction-section');
    const autoDiv = $('direction-auto');
    const manualDiv = $('direction-manual');

    if (!dirOptions) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    if (dirOptions.mode === 'sensor' && dirOptions.reading) {
      // Sensor auto mode - show captured values
      autoDiv.hidden = false;
      manualDiv.hidden = true;
      this._pendingReading = dirOptions.reading;
      const h = dirOptions.reading.heading;
      const e = dirOptions.reading.elevation;
      $('direction-auto-heading').textContent = h != null ? `${Math.round(h)}\u00B0` : '--';
      $('direction-auto-elevation').textContent = e != null ? `${Math.round(e)}\u00B0` : '--';
      $('direction-auto-source').textContent = `(${dirOptions.reading.source || 'auto'})`;
    } else {
      // Manual mode - show preset buttons
      autoDiv.hidden = true;
      manualDiv.hidden = false;
      this._pendingPrevHeading = dirOptions.prevHeading || 0;
      $('input-direction-angle').value = '';
      // Default to "straight"
      document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('selected'));
      const straightBtn = document.querySelector('.btn-direction[data-dir="straight"]');
      if (straightBtn) {
        straightBtn.classList.add('selected');
        this._selectedDir = 'straight';
      }
    }
  }

  /* ── Submit / Resolve ────────────────────────────────── */

  _submitDistance() {
    const rawVal = $('input-distance').value.trim();
    const memo = $('input-point-memo').value.trim();

    let distance = null;
    if (rawVal !== '') {
      distance = parseFloat(rawVal);
      if (isNaN(distance) || distance < 0) {
        alert('\u6709\u52B9\u306A\u8DDD\u96E2\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044');
        return;
      }
    } else {
      const estimated = this._pm.estimateDistance(this._pendingSegmentIndex);
      distance = estimated;
    }

    // Collect direction data
    const dir = this._collectDirectionData();

    this._resolveDistance({
      distance, memo,
      heading: dir.heading,
      elevation: dir.elevation,
      directionSource: dir.source
    });
  }

  _collectDirectionData() {
    if (this._dirMode === 'sensor' && this._pendingReading) {
      return {
        heading: this._pendingReading.heading,
        elevation: this._pendingReading.elevation,
        source: this._pendingReading.source
      };
    }
    if (this._dirMode === 'manual' && this._selectedDir) {
      const preset = DIR_PRESETS[this._selectedDir] || DIR_PRESETS.straight;
      let heading = ((this._pendingPrevHeading + preset.dHeading) % 360 + 360) % 360;
      let elevation = preset.elevation;
      // Override with manual angle input if provided
      const angleVal = $('input-direction-angle').value.trim();
      if (angleVal !== '') {
        const parsed = parseFloat(angleVal);
        if (!isNaN(parsed)) heading = ((parsed % 360) + 360) % 360;
      }
      return { heading, elevation, source: 'manual' };
    }
    return { heading: null, elevation: null, source: null };
  }

  _resolveDistance(result) {
    $('modal-distance').hidden = true;
    if (this._distanceResolve) {
      this._distanceResolve(result || {
        distance: null, memo: '',
        heading: null, elevation: null, directionSource: null
      });
      this._distanceResolve = null;
    }
  }

  /* ── Point Edit ─────────────────────────────────────── */

  _editPoint(index) {
    const p = this._pm.points[index];
    if (!p) return;
    const isLast = index === this._pm.points.length - 1;

    return new Promise((resolve) => {
      this._distanceResolve = (result) => {
        if (!result) { resolve(); return; }
        const updates = {};
        if (result.distance !== null && result.distance !== undefined) updates.distance = result.distance;
        if (result.memo !== undefined) updates.memo = result.memo;
        if (result.heading != null) {
          updates.heading = result.heading;
          updates.elevation = result.elevation || 0;
          updates.directionSource = result.directionSource || 'manual';
        }
        this._pm.updatePointByIndex(index, updates);
        resolve();
      };
      this._pendingSegmentIndex = index;
      this._dirMode = 'manual';
      this._selectedDir = null;

      setText('distance-dialog-title', `\u30DD\u30A4\u30F3\u30C8 ${index + 1} \u306E\u7DE8\u96C6`);

      const estimatedEl = $('distance-estimated');
      estimatedEl.hidden = true;

      // Pre-fill current values
      $('input-distance').value = (!isLast && p.distanceToNext !== null) ? p.distanceToNext : '';
      $('input-distance').placeholder = isLast ? '(最終点)' : '距離 (m)';
      $('input-point-memo').value = p.memo || '';

      // Direction section: manual mode with current heading
      this._setupDirectionSection({
        mode: 'manual',
        prevHeading: p.heading || 0
      });
      if (p.heading != null) {
        $('input-direction-angle').value = Math.round(p.heading);
      }

      $('modal-distance').hidden = false;
      $('input-distance').focus();
    });
  }

  /* ── Point List Rendering ────────────────────────────── */

  _renderList() {
    const points = this._pm.points;
    const count = points.length;
    const total = this._pm.getTotalLength();

    setText('point-count', `(${count}\u70B9)`);
    setText('total-length', `\u7DCF\u5EF6\u9577: ${formatDistance(total)}m`);

    this._listContainer.innerHTML = '';

    if (count === 0) {
      this._listContainer.innerHTML =
        '<p class="empty-message">\u30DD\u30A4\u30F3\u30C8\u304C\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093</p>';
      return;
    }

    points.forEach((p, i) => {
      const distText = p.distanceToNext !== null
        ? `\u2192 ${formatDistance(p.distanceToNext)}m`
        : (i < count - 1 ? '\u2192 --' : '');

      // Direction info
      const dirText = p.heading != null
        ? `${Math.round(p.heading)}\u00B0`
        : '';

      const btnEdit = createElement('button', { type: 'button' }, ['\u7DE8\u96C6']);
      btnEdit.addEventListener('click', () => this._editPoint(i));

      const btnDel = createElement('button', { type: 'button' }, ['\u524A\u9664']);
      btnDel.addEventListener('click', () => {
        if (confirm(`\u30DD\u30A4\u30F3\u30C8 ${p.id} \u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F`)) {
          this._pm.removePoint(p.id);
        }
      });

      const infoChildren = [
        createElement('span', { className: 'point-item-id' }, [`${i + 1}.`])
      ];
      if (p.memo) {
        infoChildren.push(createElement('span', { className: 'point-item-memo' }, [p.memo]));
      }
      if (distText) {
        const label = dirText ? `${distText} (${dirText})` : distText;
        infoChildren.push(createElement('span', { className: 'point-item-distance' }, [label]));
      }

      const item = createElement('div', { className: 'point-item' }, [
        createElement('div', { className: 'point-item-info' }, infoChildren),
        createElement('div', { className: 'point-item-actions' }, [btnEdit, btnDel])
      ]);

      this._listContainer.appendChild(item);
    });
  }
}

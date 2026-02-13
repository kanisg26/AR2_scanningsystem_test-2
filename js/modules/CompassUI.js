/**
 * Compass / sensor status display and initial-heading dialog.
 * @module modules/CompassUI
 */

import { $ } from '../utils/dom.js';

const ARROWS = ['\u2191','\u2197','\u2192','\u2198','\u2193','\u2199','\u2190','\u2196'];
// ↑ ↗ → ↘ ↓ ↙ ← ↖

export default class CompassUI {
  constructor() {
    this._bar       = $('sensor-status');
    this._headingEl = $('sensor-heading');
    this._elevEl    = $('sensor-elevation');
    this._levelEl   = $('sensor-level');
    this._accEl     = $('sensor-accuracy');
  }

  /** Update the sensor status bar with live readings */
  update(heading, elevation, level, accuracy) {
    if (!this._bar) return;
    this._bar.hidden = false;

    this._headingEl.textContent = heading != null
      ? `${Math.round(heading)}\u00B0 ${ARROWS[Math.round(heading / 45) % 8]}`
      : '--';

    if (elevation != null) {
      const sign = elevation >= 0 ? '\u25B2' : '\u25BC';
      this._elevEl.textContent = `${sign}${Math.abs(Math.round(elevation))}\u00B0`;
    } else {
      this._elevEl.textContent = '--';
    }

    this._levelEl.textContent = `Level ${level}`;
    this._levelEl.className   = `sensor-level level-${level}`;

    if (accuracy != null) {
      this._accEl.textContent = accuracy <= 10 ? '\u826F\u597D'
                              : accuracy <= 25 ? '\u6A19\u6E96' : '\u4F4E';
    } else {
      this._accEl.textContent = '';
    }
  }

  /**
   * Prompt user for initial heading (Level 3: gyro only, no compass).
   * @returns {Promise<number>} heading in degrees (0-360)
   */
  promptInitialHeading() {
    return new Promise(resolve => {
      const dialog    = $('modal-initial-heading');
      const inputEl   = $('input-initial-heading');
      const okBtn     = $('btn-initial-heading-ok');
      const presets   = dialog.querySelectorAll('.heading-preset');

      dialog.hidden = false;
      inputEl.value = '0';
      let selected  = 0;

      const onPreset = (e) => {
        selected = parseInt(e.currentTarget.dataset.heading, 10);
        presets.forEach(b => b.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        inputEl.value = selected;
      };

      const onOk = () => {
        const v = parseInt(inputEl.value, 10);
        if (!isNaN(v)) selected = ((v % 360) + 360) % 360;
        dialog.hidden = true;
        cleanup();
        resolve(selected);
      };

      presets.forEach(b => b.addEventListener('click', onPreset));
      okBtn.addEventListener('click', onOk);

      function cleanup() {
        presets.forEach(b => b.removeEventListener('click', onPreset));
        okBtn.removeEventListener('click', onOk);
      }
    });
  }

  hide() { if (this._bar) this._bar.hidden = true; }
}

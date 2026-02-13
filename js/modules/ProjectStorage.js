/**
 * Project save/load via LocalStorage (v2 - camera UI)
 * @module modules/ProjectStorage
 */

import { STORAGE_KEY, APP_VERSION } from '../config.js';

export default class ProjectStorage {
  constructor() {
    this._key = STORAGE_KEY;
  }

  /**
   * Saves project data to LocalStorage
   * @param {string} projectName
   * @param {{ siteName: string, operator: string, pipeType: string }} metadata
   * @param {Array<Object>} points
   * @param {{ pixelsPerMeter: number|null, referenceSegment: number|null }} calibration
   * @returns {{ success: boolean, error?: string }}
   */
  save(projectName, metadata, points, calibration) {
    try {
      const existing = this._readRaw();
      const data = {
        version: APP_VERSION,
        projectName: projectName || '',
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          siteName: metadata?.siteName || '',
          operator: metadata?.operator || '',
          pipeType: metadata?.pipeType || ''
        },
        calibration: calibration || { pixelsPerMeter: null, referenceSegment: null },
        points: points
      };
      localStorage.setItem(this._key, JSON.stringify(data));
      return { success: true };
    } catch (error) {
      console.error('ProjectStorage.save failed:', error);
      return { success: false, error: '保存に失敗しました' };
    }
  }

  /**
   * Loads project data from LocalStorage
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  load() {
    try {
      const data = this._readRaw();
      if (!data) {
        return { success: false, error: '保存されたプロジェクトがありません' };
      }
      if (!this._validate(data)) {
        return { success: false, error: 'データが破損しています' };
      }
      return { success: true, data };
    } catch (error) {
      console.error('ProjectStorage.load failed:', error);
      return { success: false, error: '読み込みに失敗しました' };
    }
  }

  hasProject() {
    return localStorage.getItem(this._key) !== null;
  }

  clear() {
    localStorage.removeItem(this._key);
  }

  _readRaw() {
    const raw = localStorage.getItem(this._key);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  _validate(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.points)) return false;
    return true;
  }
}

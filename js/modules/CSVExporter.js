/**
 * Exports point data as CSV (UTF-8 with BOM for Excel)
 * @module modules/CSVExporter
 */

import { CSV_BOM, EXPORT_FILENAME_PREFIX, DISTANCE_PRECISION } from '../config.js';
import { downloadBlob, fileTimestamp } from '../utils/dom.js';

export default class CSVExporter {
  /**
   * Exports points array to a CSV file and triggers download
   * @param {Array<{ id: number, screenX: number, screenY: number, distanceToNext: number|null, memo: string }>} points
   */
  export(points) {
    if (points.length === 0) {
      alert('出力するポイントがありません');
      return;
    }

    const header = 'point_id,distance_to_next,memo';
    const rows = points.map(p => {
      const dist = p.distanceToNext !== null
        ? p.distanceToNext.toFixed(DISTANCE_PRECISION)
        : '';
      return `${p.id},${dist},${this._escapeCsv(p.memo)}`;
    });

    const content = CSV_BOM + header + '\n' + rows.join('\n') + '\n';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const filename = `${EXPORT_FILENAME_PREFIX}_${fileTimestamp()}.csv`;

    downloadBlob(blob, filename);
  }

  _escapeCsv(value) {
    if (!value) return '';
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

/**
 * Exports point data as DXF (2D POLYLINE based on cumulative distance)
 * @module modules/DXFExporter
 */

import { DXF_LAYER_NAME, EXPORT_FILENAME_PREFIX, DISTANCE_PRECISION } from '../config.js';
import { downloadBlob, fileTimestamp } from '../utils/dom.js';

export default class DXFExporter {
  /**
   * Exports points to a DXF file.
   * Points are laid out along the X axis using distanceToNext values.
   * @param {Array<{ id: number, distanceToNext: number|null, memo: string }>} points
   */
  export(points) {
    if (points.length === 0) {
      alert('出力するポイントがありません');
      return;
    }

    const dxf = this._buildDxf(points);
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const filename = `${EXPORT_FILENAME_PREFIX}_${fileTimestamp()}.dxf`;

    downloadBlob(blob, filename);
  }

  /**
   * Builds a DXF string with 2D POLYLINE laid out along X axis
   * @param {Array<{ distanceToNext: number|null }>} points
   * @returns {string}
   */
  _buildDxf(points) {
    // Calculate cumulative X positions from distanceToNext
    const positions = [];
    let x = 0;
    for (let i = 0; i < points.length; i++) {
      positions.push(x);
      const dist = points[i].distanceToNext;
      if (dist !== null && i < points.length - 1) {
        x += dist;
      } else if (i < points.length - 1) {
        x += 1; // Default 1m spacing for unknown distances
      }
    }

    const lines = [];

    lines.push('0', 'SECTION');
    lines.push('2', 'ENTITIES');

    // 2D POLYLINE (70=0 → 2D)
    lines.push('0', 'POLYLINE');
    lines.push('8', DXF_LAYER_NAME);
    lines.push('66', '1');
    lines.push('70', '0');

    positions.forEach(px => {
      lines.push('0', 'VERTEX');
      lines.push('8', DXF_LAYER_NAME);
      lines.push('10', px.toFixed(DISTANCE_PRECISION));
      lines.push('20', '0.000');
    });

    lines.push('0', 'SEQEND');
    lines.push('8', DXF_LAYER_NAME);

    lines.push('0', 'ENDSEC');
    lines.push('0', 'EOF');

    return lines.join('\n') + '\n';
  }
}

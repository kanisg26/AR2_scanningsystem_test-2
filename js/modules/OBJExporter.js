/**
 * Exports point data as Wavefront OBJ (distance-based X-axis layout)
 * @module modules/OBJExporter
 */

import { EXPORT_FILENAME_PREFIX, DISTANCE_PRECISION } from '../config.js';
import { downloadBlob, fileTimestamp } from '../utils/dom.js';
import { totalRouteLength, formatDistance, pointsToPositions } from '../utils/math.js';

export default class OBJExporter {
  /**
   * Exports points to an OBJ file
   * @param {Array<{ id: number, distanceToNext: number|null }>} points
   */
  export(points) {
    if (points.length === 0) {
      alert('出力するポイントがありません');
      return;
    }

    const obj = this._buildObj(points);
    const blob = new Blob([obj], { type: 'text/plain' });
    const filename = `${EXPORT_FILENAME_PREFIX}_${fileTimestamp()}.obj`;

    downloadBlob(blob, filename);
  }

  _buildObj(points) {
    const positions = pointsToPositions(points);
    const total = totalRouteLength(points);
    const lines = [];

    lines.push('# PipeScanner Export');
    lines.push(`# Total Length: ${formatDistance(total)}m`);
    lines.push(`# Point Count: ${points.length}`);
    lines.push('');

    // Vertices
    positions.forEach(p => {
      lines.push(`v ${p.x.toFixed(DISTANCE_PRECISION)} ${p.y.toFixed(DISTANCE_PRECISION)} ${p.z.toFixed(DISTANCE_PRECISION)}`);
    });

    // Line segments (1-based)
    if (positions.length >= 2) {
      lines.push('');
      for (let i = 1; i < positions.length; i++) {
        lines.push(`l ${i} ${i + 1}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}

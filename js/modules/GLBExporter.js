/**
 * Exports 3D scene as GLB (glTF 2.0 Binary)
 * @module modules/GLBExporter
 */

import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { EXPORT_FILENAME_PREFIX } from '../config.js';
import { downloadBlob, fileTimestamp } from '../utils/dom.js';
import { totalRouteLength } from '../utils/math.js';

export default class GLBExporter {
  /**
   * Exports the 3D scene to a GLB file
   * @param {THREE.Scene} scene
   * @param {Array<{ distanceToNext: number|null }>} points
   */
  export(scene, points) {
    if (points.length === 0) {
      alert('出力するポイントがありません');
      return;
    }

    if (typeof GLTFExporter === 'undefined') {
      alert('GLTFExporterが読み込まれていません');
      return;
    }

    scene.userData = {
      totalLength: totalRouteLength(points),
      pointCount: points.length
    };

    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const filename = `${EXPORT_FILENAME_PREFIX}_${fileTimestamp()}.glb`;
        downloadBlob(blob, filename);
      },
      (error) => {
        console.error('GLB export failed:', error);
        alert('GLB出力に失敗しました');
      },
      { binary: true }
    );
  }
}

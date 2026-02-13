/**
 * Manages camera access via getUserMedia
 * @module modules/CameraManager
 */

export default class CameraManager {
  /**
   * @param {HTMLVideoElement} videoEl - The video element to stream into
   */
  constructor(videoEl) {
    this._video = videoEl;
    this._stream = null;
    this._facingMode = 'environment'; // 背面カメラ優先
    this._started = false;
  }

  /**
   * Starts the camera stream
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async start() {
    try {
      const constraints = {
        video: {
          facingMode: this._facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._video.srcObject = this._stream;
      await this._video.play();
      this._started = true;
      return { success: true };
    } catch (err) {
      const msg = this._getErrorMessage(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Stops the current camera stream
   */
  stop() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this._video.srcObject = null;
    this._started = false;
  }

  /**
   * Toggles between front and back camera
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async toggleCamera() {
    this._facingMode = this._facingMode === 'environment' ? 'user' : 'environment';
    this.stop();
    return this.start();
  }

  /**
   * Returns the actual video resolution (after autoplay)
   * @returns {{ width: number, height: number }}
   */
  getVideoSize() {
    return {
      width: this._video.videoWidth,
      height: this._video.videoHeight
    };
  }

  /** @returns {boolean} */
  get isStarted() {
    return this._started;
  }

  /**
   * Captures the current video frame as a data URL
   * @returns {string|null} Data URL of the captured frame, or null if not started
   */
  captureFrame() {
    if (!this._started) return null;
    const canvas = document.createElement('canvas');
    canvas.width = this._video.videoWidth || this._video.clientWidth;
    canvas.height = this._video.videoHeight || this._video.clientHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this._video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  /** @returns {HTMLVideoElement} */
  get videoElement() {
    return this._video;
  }

  /**
   * Maps getUserMedia errors to user-friendly Japanese messages
   * @param {Error} err
   * @returns {string}
   */
  _getErrorMessage(err) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'カメラの使用が許可されていません。ブラウザの設定を確認してください。';
      case 'NotFoundError':
        return 'カメラが見つかりません。';
      case 'NotReadableError':
        return 'カメラにアクセスできません。他のアプリが使用中の可能性があります。';
      case 'OverconstrainedError':
        return 'カメラの要件を満たせません。';
      default:
        return `カメラエラー: ${err.message}`;
    }
  }
}

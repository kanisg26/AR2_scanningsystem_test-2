/**
 * Input validation utilities
 * @module utils/validation
 */

import { MEMO_MAX_LENGTH, MAX_POINTS } from '../config.js';

/**
 * Validates a memo string
 * @param {string} memo
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateMemo(memo) {
  if (typeof memo !== 'string') {
    return { valid: false, error: 'メモは文字列で入力してください' };
  }
  if (memo.length > MEMO_MAX_LENGTH) {
    return { valid: false, error: `メモは${MEMO_MAX_LENGTH}文字以内で入力してください` };
  }
  return { valid: true };
}

/**
 * Checks if point count has reached the maximum
 * @param {number} currentCount
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePointCount(currentCount) {
  if (currentCount >= MAX_POINTS) {
    return { valid: false, error: `ポイントは最大${MAX_POINTS}個までです` };
  }
  return { valid: true };
}

/**
 * Validates a distance value (meters)
 * @param {*} value
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateDistance(value) {
  const num = Number(value);
  if (isNaN(num)) {
    return { valid: false, error: '数値を入力してください' };
  }
  if (num < 0) {
    return { valid: false, error: '距離は0以上で入力してください' };
  }
  if (num > 1000) {
    return { valid: false, error: '距離が大きすぎます（最大1000m）' };
  }
  return { valid: true };
}

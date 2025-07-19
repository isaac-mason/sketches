/**
 * Common utilities
 */

// Configuration Constants
export const EPSILON = 0.000001;

export const RANDOM = Math.random;
export const ANGLE_ORDER = "zyx";

/**
 * Symmetric round
 * see https://www.npmjs.com/package/round-half-up-symmetric#user-content-detailed-background
 *
 * @param a value to round
 */
export function round(a: number): number {
  if (a >= 0) return Math.round(a);

  return a % 0.5 === 0 ? Math.floor(a) : Math.round(a);
}

const degree = Math.PI / 180;

const radian = 180 / Math.PI;

/**
 * Convert Degree To Radian
 *
 * @param a Angle in Degrees
 */
export function toRadian(a: number): number {
  return a * degree;
}

/**
 * Convert Radian To Degree
 *
 * @param a Angle in Radians
 */
export function toDegree(a: number): number {
  return a * radian;
}

/**
 * Tests whether or not the arguments have approximately the same value, within an absolute
 * or relative tolerance of glMatrix.EPSILON (an absolute tolerance is used for values less
 * than or equal to 1.0, and a relative tolerance is used for larger values)
 *
 * @param a The first number to test.
 * @param b The second number to test.
 * @returns True if the numbers are approximately equal, false otherwise.
 */
export function equals(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon * Math.max(1.0, Math.abs(a), Math.abs(b));
}

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
};

/**
 * Remaps a number from one range to another.
 */
export function remap(
	number: number,
	inLow: number,
	inHigh: number,
	outLow: number,
	outHigh: number,
): number {
	const scale = (number - inLow) / (inHigh - inLow);
	return outLow + scale * (outHigh - outLow);
}

/**
 * Remaps a number from one range to another, clamping the result to the output range.
 */
export function remapClamp(
	value: number,
	inLow: number,
	inHigh: number,
	outLow: number,
	outHigh: number,
): number {
	const scale = (value - inLow) / (inHigh - inLow);
	const remapped = outLow + scale * (outHigh - outLow);
	return Math.max(outLow, Math.min(outHigh, remapped));
}

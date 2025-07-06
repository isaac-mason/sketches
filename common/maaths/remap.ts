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

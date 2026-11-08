// Small dependency-free replacements for the lodash helpers used by the
// original Pony Town codec. Behaviour is intentionally identical to lodash
// for the specific call sites of the original implementation.

// numbers

export function clamp(value: number, min: number, max: number): number {
	return value > min ? (value < max ? value : max) : min;
}

export function toInt(value: any): number {
	return value | 0;
}

// collections

export function includes<T>(array: T[] | undefined, item: T): boolean {
	return array !== undefined && array.indexOf(item) !== -1;
}

export function array<T>(size: number, defaultValue: T): T[] {
	const result: T[] = [];

	for (let i = 0; i < size; i++) {
		result.push(defaultValue);
	}

	return result;
}

export function at<T>(items: T[], index: any): T | undefined {
	return items[clamp(index | 0, 0, items.length - 1)];
}

export function att<T>(items: T[] | null | undefined, index: any): T | undefined {
	return items ? items[clamp(index | 0, 0, items.length - 1)] : undefined;
}

export function pushUniq<T>(array: T[], item: T): number {
	const index = array.indexOf(item);

	if (index === -1) {
		array.push(item);
		return array.length;
	} else {
		return index + 1;
	}
}

// lodash.findLastIndex(items, predicate)
export function findLastIndex<T>(items: T[], predicate: (item: T, index: number) => boolean): number {
	for (let i = items.length - 1; i >= 0; i--) {
		if (predicate(items[i], i)) {
			return i;
		}
	}

	return -1;
}

function isPlainObject(value: any): boolean {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}

	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

// lodash.merge(object, sources...) - deep merge, `undefined` source values are skipped
export function merge<T>(target: T, source: any): T {
	if (!isPlainObject(source)) {
		return target;
	}

	const obj = target as any;

	for (const key of Object.keys(source)) {
		const src = source[key];
		const dst = obj[key];

		if (Array.isArray(src)) {
			const arr = Array.isArray(dst) ? dst : [];

			for (let i = 0; i < src.length; i++) {
				if (isPlainObject(src[i]) || Array.isArray(src[i])) {
					arr[i] = merge(isPlainObject(arr[i]) || Array.isArray(arr[i]) ? arr[i] : {}, src[i]);
				} else if (src[i] !== undefined) {
					arr[i] = src[i];
				}
			}

			obj[key] = arr;
		} else if (isPlainObject(src)) {
			obj[key] = merge(isPlainObject(dst) ? dst : {}, src);
		} else if (src !== undefined) {
			obj[key] = src;
		}
	}

	return target;
}

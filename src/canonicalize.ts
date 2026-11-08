// Canonical save form.
//
// The original server stores a pony as `compressPony(decompressPony(info))`
// (see `src/ts/server/api/pony.ts`), i.e. every save is normalised through a
// decompress / re-compress cycle. This module exposes the same normalisation
// for the ported codec, plus helpers to check whether a save is already
// canonical.

import { compressPony, decompressPony, compressPonyString, decompressPonyString } from './compressPony';
import { toByteArray } from './base64';
import { PonyInfo, PonyInfoNumber } from './interfaces';

/**
 * Normalises a save into the canonical (server) form.
 * `canonicalize(canonicalize(x)) === canonicalize(x)`
 */
export function canonicalize(info: string | Uint8Array): string {
	return compressPony(decompressPony(info));
}

/**
 * Normalises a save into the canonical (server) form using the string
 * (hex colour) representation of keep the pony editable.
 */
export function canonicalizeString(info: string): string {
	return compressPonyString(decompressPonyString(info));
}

/** Returns true if the given save is already in canonical form. */
export function isCanonical(info: string | Uint8Array): boolean {
	if (typeof info === 'string') {
		return canonicalize(info) === info;
	}

	// the canonical form of the binary save is the binary form of the
	// canonical save of the decoded pony
	const canonical = toByteArray(canonicalize(info));

	if (canonical.length !== info.length) {
		return false;
	}

	for (let i = 0; i < canonical.length; i++) {
		if (canonical[i] !== info[i]) {
			return false;
		}
	}

	return true;
}

export function canonicalizeInfo(info: PonyInfoNumber): string {
	return compressPony(info);
}

export function canonicalizeInfoString(info: PonyInfo): string {
	return compressPonyString(info);
}

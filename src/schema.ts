// Access to the extracted Pony Town sprite schema.
//
// The schema describes, for every set field of the save format, how many
// types it has, how many patterns every type has and how many colours every
// (type, pattern) pair uses. That is exactly the information the original
// codec gets from the generated sprite tables.

import { schemaSetFields, schemaVersion, schemaSource, SchemaSetFieldEntry } from './schemaData';

export { SchemaSetFieldEntry, schemaVersion, schemaSource };

export interface SchemaSetField {
	name: string;
	preserveOnZero: boolean;
	minColors: number;
	/** types[type][pattern] = effective colour count, `null` = missing type */
	types: (number[] | null)[];
}

export const setFields: SchemaSetField[] = schemaSetFields;

const byName: { [name: string]: SchemaSetField } = {};

for (const field of setFields) {
	byName[field.name] = field;
}

export function getSetField(name: string): SchemaSetField {
	const field = byName[name];

	if (!field) {
		throw new Error('Unknown set field: ' + name);
	}

	return field;
}

export function hasSetField(name: string): boolean {
	return !!byName[name];
}

/**
 * Effective colour count of a (type, pattern) pair, mirroring the original
 * `getColorCount(sprite)` (client/spriteUtils.ts) which the codec applies to
 * the resolved sprite of a set.
 */
export function getColorCount(field: SchemaSetField, type: number, pattern: number): number {
	const typeSet = field.types[type];

	if (!typeSet) {
		return 0;
	}

	const count = typeSet[pattern];
	return count === undefined ? 0 : count;
}

export function mergeObjects<TObjectA extends Record<string, unknown>, TObjectB extends Record<string, unknown>>(
	objectA: TObjectA,
	objectB?: TObjectB,
): TObjectA & Partial<TObjectB> {
	return (objectB === undefined ? objectA : { ...objectA, ...objectB }) as TObjectA & Partial<TObjectB>;
}

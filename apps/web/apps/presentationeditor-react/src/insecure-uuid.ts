// Insecure origins (plain http on a bare IP, as served in staging/prod) lack
// crypto.randomUUID; the store seeds demo slides with it at module-load time,
// so this must be imported BEFORE any store/App import (import-order matters).
if (typeof crypto.randomUUID !== "function") {
	Object.defineProperty(crypto, "randomUUID", {
		value: () =>
			"10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
				(
					+c ^
					(crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
				).toString(16),
			),
	});
}

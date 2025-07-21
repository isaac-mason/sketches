export type Result<T, E> =
	| {
			ok: true;
			data: T;
			error: false;
	  }
	| {
			ok: false;
			retryable?: boolean;
			error: E;
			data: null;
	  };

export const ok = <T = undefined>(data: T) => {
	const response = {
		ok: true,
		error: false,
		data,
	} satisfies Result<T, any>;

	return response;
};

export const err = <E>(
	error: E,
	options?: { retryable?: boolean },
): {
	ok: false;
	retryable?: boolean;
	error: E;
	data: null;
} => {
	const response = {
		ok: false as const,
		error,
		retryable: options?.retryable,
		data: null,
	} satisfies Result<any, E>;

	return response;
};

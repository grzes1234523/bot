// A timeout bounds the caller's wait; it does not cancel an in-flight query.
export async function withTimeout(operation, milliseconds, message = 'Operacja nie odpowiedziała w wyznaczonym czasie.') {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          error.code = 'OPERATION_TIMEOUT';
          reject(error);
        }, milliseconds);
        timer.unref?.();
      }),
    ]);
  } finally { clearTimeout(timer); }
}

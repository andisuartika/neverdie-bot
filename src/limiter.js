// Membatasi jumlah pekerjaan yang berjalan bersamaan; sisanya antre (FIFO).
export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    const { fn, resolve, reject } = queue.shift();
    active++;
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return {
    run: (fn) =>
      new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
      }),
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
    max,
  };
}

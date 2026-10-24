// Menandai perubahan role yang dilakukan bot sendiri (panel role) supaya tidak
// membanjiri log moderasi. Tanda kedaluwarsa otomatis.
const marks = new Map();
const TTL = 15_000;

export const suppress = {
  mark(userId, roleId, now = Date.now()) {
    marks.set(`${userId}:${roleId}`, now + TTL);
  },
  // Mengembalikan true (dan menghapus tanda) jika perubahan ini memang dari bot.
  consume(userId, roleId, now = Date.now()) {
    const k = `${userId}:${roleId}`;
    const exp = marks.get(k);
    if (exp === undefined) return false;
    marks.delete(k);
    return exp >= now;
  },
};

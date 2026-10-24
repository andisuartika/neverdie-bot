// Dipanggil oleh HEALTHCHECK Docker: sehat jika bot menulis detak dalam 90 detik terakhir.
import { statSync } from 'node:fs';
try {
  process.exit(Date.now() - statSync('/tmp/nv-health').mtimeMs < 90_000 ? 0 : 1);
} catch {
  process.exit(1);
}

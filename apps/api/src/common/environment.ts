import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const file = fileURLToPath(import.meta.url);
config({ path: resolve(dirname(file), '../../../../.env') });

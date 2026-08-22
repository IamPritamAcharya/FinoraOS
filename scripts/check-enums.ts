import { readFileSync } from 'node:fs';
import { AgentType, ExceptionStatus, ExceptionType, ReconciliationStatus } from '@finora/platform';
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const pairs = { ReconciliationStatus, ExceptionStatus, ExceptionType, AgentType };
let invalid = false;
for (const [name, values] of Object.entries(pairs)) {
  const match = schema.match(new RegExp(`enum ${name}\\s*\\{([^}]+)\\}`));
  const prismaValues = match?.[1].match(/[A-Z_]+/g) ?? [];
  const platformValues = Object.values(values);
  if (JSON.stringify(prismaValues) !== JSON.stringify(platformValues)) {
    console.error(
      `${name} differs: Prisma=${prismaValues.join(',')} platform=${platformValues.join(',')}`,
    );
    invalid = true;
  }
}
if (invalid) process.exit(1);
console.log('Platform and Prisma enums are synchronized.');

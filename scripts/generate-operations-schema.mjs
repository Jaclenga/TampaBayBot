import { mkdir, writeFile } from 'node:fs/promises';
import { operationsSchema } from '../src/lib/operations/schema.mjs';
await mkdir(new URL('../drizzle/', import.meta.url), { recursive: true });
await writeFile(new URL('../drizzle/0000_operations.sql', import.meta.url), operationsSchema.map(sql => `${sql};`).join('\n--> statement-breakpoint\n') + '\n');
console.log('Generated drizzle/0000_operations.sql from the operations schema.');

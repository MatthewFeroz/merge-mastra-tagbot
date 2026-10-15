import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { demoPage } from '../src/mastra/demo-page';

const destination = resolve(process.argv[2] ?? 'web/demo.html');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, demoPage);
console.log(`Demo page exported to ${destination}`);

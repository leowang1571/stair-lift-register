import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
await mkdir(new URL('.portable/public/', root), { recursive: true });
await copyFile(new URL('register.html', root), new URL('.portable/public/index.html', root));
await copyFile(new URL('public/app.js', root), new URL('.portable/public/app.js', root));
console.log('Portable frontend prepared at ' + fileURLToPath(new URL('.portable/public/', root)));

await copyFile(new URL('public/register-model.mjs', root), new URL('.portable/public/register-model.mjs', root));

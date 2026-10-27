import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../wrangler.jsonc', import.meta.url);
const config = JSON.parse(await readFile(file, 'utf8'));
const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id || '') || id === '00000000-0000-4000-8000-000000000000') throw new Error('請設定有效的 CLOUDFLARE_D1_DATABASE_ID。');
config.d1_databases[0].database_id = id;
await writeFile(file, JSON.stringify(config, null, 2) + '\n');
console.log('D1 資料庫設定完成。');

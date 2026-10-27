import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('docs/',root);
await mkdir(out,{recursive:true});
const html=await readFile(new URL('register.html',root),'utf8');
if(!html.includes('src="./app.js?v=8"'))throw new Error('網頁資源須使用相對路徑。');
await writeFile(new URL('index.html',out),html);
for(const file of ['app.js','register-model.mjs','github-storage.mjs'])await copyFile(new URL('public/'+file,root),new URL(file,out));
await writeFile(new URL('.nojekyll',out),'');
console.log('GitHub Pages 網頁已建立，資料直接儲存於 GitHub。');

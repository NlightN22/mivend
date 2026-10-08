import { chromium } from '@playwright/test';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1360,height:900}});
p.on('console',m=>{ if(m.type()==='error') console.log('ERR',m.text().slice(0,150)) });
for (const u of ['/','/dashboard/']) { await p.goto('http://localhost:5185'+u,{waitUntil:'networkidle'}).catch(e=>console.log(e.message.slice(0,80))); await p.waitForTimeout(3000); console.log(u,'->',p.url(),(await p.title()),(await p.locator('body').innerText()).slice(0,80).replace(/\n/g,' ')); }
await b.close();

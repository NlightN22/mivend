import { chromium } from '@playwright/test';
const S='/tmp/claude-0/-opt-mivend/2c47e495-aa81-46dd-bfba-8a4289a19e67/scratchpad';
const b=await chromium.launch(); 
async function run(tag){
  const ctx=await b.newContext({viewport:{width:1360,height:900}}); const p=await ctx.newPage();
  await p.goto('http://localhost:5173/login');
  await p.locator('input[type="email"]').fill('credit-limited@buyer.example');
  await p.locator('input[type="password"]').fill('Password123!');
  await p.getByRole('button',{name:/Войти|Sign in|Log in/i}).click();
  await p.waitForURL(u=>!u.pathname.includes('/login'));
  await p.evaluate(async()=>{await fetch('/shop-api',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'mutation{addItemToOrder(productVariantId:"56",quantity:1){__typename}}'})})});
  await p.goto('http://localhost:5173/checkout'); await p.waitForTimeout(2500);
  await p.locator('text=/Deferred|Отсрочка/i').first().click().catch(()=>{});
  await p.waitForTimeout(800);
  await p.screenshot({path:S+'/'+tag+'-1-checkout.png'});
  await p.locator('.checkout-summary__pay-btn').click();
  await p.waitForTimeout(3000);
  await p.screenshot({path:S+'/'+tag+'-2-result.png'});
  console.log(tag,p.url());
  await ctx.close();
}
const P=process.argv[2]; await run(P); await b.close();

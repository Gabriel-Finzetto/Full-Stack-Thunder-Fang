// Security regression harness. Private APIs/Auth and remote sockets are mocked.
// The only real API control is a credential-free local GET that must return 401.
// Synthetic fixtures only; no remote account, email, profile or order is used.
const { chromium } = require('@playwright/test');
const { loadEnvConfig } = require('@next/env');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
loadEnvConfig(root);
const base = new URL(process.argv[2] || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Run the privacy regression against a local application server.');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Configure the public Supabase URL and publishable key before running the privacy regression.');
}
const output = path.join(root, 'test-results', 'privacy');
fs.mkdirSync(output, { recursive: true });
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const authOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const authCookie = `sb-${new URL(authOrigin).hostname.split('.')[0]}-auth-token`;
const at = new Date().toISOString();
const privateNames = { [A]:'Conta Alfa Privada', [B]:'Conta Beta Privada' };
const profile = owner => ({ id:owner, name:privateNames[owner], email:owner === A ? 'alpha@example.invalid' : 'beta@example.invalid', defaultDelivery:{ delivery:{ country:'BR',region:'SP-CAPITAL',postal:'01001-000',street:owner===A?'Rua Privada Alfa':'Rua Privada Beta',number:'10',noNumber:false,complement:'',district:'Sé',city:'São Paulo',province:'SP',reference:'',instructions:'' },method:'standard' } });
const order = owner => ({ id:owner===A?'00000000-0000-4000-8000-000000000011':'00000000-0000-4000-8000-000000000012',number:owner===A?'TF-ALFA-PRIVADO':'TF-BETA-PRIVADO',ownerId:owner,status:'simulation_completed',currency:'BRL',createdAt:at,expiresAt:new Date(Date.parse(at)+86400000).toISOString(),items:[{slug:'original',name:'Original',quantity:6,unitPriceInCents:1279,lineTotalInCents:7674}],quantity:6,subtotalInCents:7674,discountInCents:767,productsTotalInCents:6907,shippingInCents:800,totalInCents:7707,delivery:{...profile(owner).defaultDelivery.delivery,regionName:'São Paulo capital',zone:'BR',resolvedAddress:profile(owner).defaultDelivery.delivery.street,referenceApplied:false,method:'standard',priceInCents:800,businessDays:{min:null,max:7}} });
const catalog=['original','citricos','tropicais','frutas-vermelhas'].map((slug,index)=>({slug,name:['Original','Cítricos','Tropicais','Frutas Vermelhas'][index],flavorProfile:'Perfil demonstrativo',description:'Descrição demonstrativa',priceInCents:1279,volumeMl:500,available:true,order:index+1,image:`/images/products/${slug}.png`,canImage:`/images/cans/${slug}.png`,labelImage:`/images/labels/${slug}.png`,accent:'#00A7AB',background:'#004EAB',ornament:'#AB9100'}));
function deferred() { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; }
const state={owner:A,profileStatus:200,profileGate:null,listGate:null,lastListAt:0,patchGate:null,patchStatus:200,deleteGate:null,deleteStatus:204,logoutStatus:204,logoutGate:null,name:null};
const report={checks:[],errors:[],requests:{profile:0,list:0,patch:0,delete:0,logout:0},patchOwners:[],deleteOwners:[],blockedExternal:0,blockedWrites:[],socketsClosed:0};
async function check(name,run) { await run(); report.checks.push({name,passed:true}); console.log('PASS: '+name); }
async function until(predicate) { const started=Date.now();while(!predicate()){if(Date.now()-started>12000)throw Error('Expected mocked request did not arrive');await new Promise(resolve=>setTimeout(resolve,20));} }
function session(owner) { const expiry=Math.floor(Date.now()/1000)+3600; const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'); const user={id:owner,email:profile(owner).email,email_confirmed_at:at,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},identities:[]}; return {access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:owner,aud:'authenticated',role:'authenticated',exp:expiry,iat:expiry-3600,session_id:'00000000-0000-4000-8000-000000000099'})+'.'+Buffer.from('synthetic-invalid-signature').toString('base64url'),refresh_token:'synthetic-refresh-token',expires_at:expiry,expires_in:3600,token_type:'bearer',user}; }
(async()=>{
 const browser=await chromium.launch({headless:true}); const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 let page;
 try {
  await context.addCookies([{name:authCookie,value:'base64-'+Buffer.from(JSON.stringify(session(A))).toString('base64url'),url:base,sameSite:'Lax'}]);
  await context.addInitScript(()=>{try{localStorage.setItem('tf-demo-notice-v1','acknowledged');}catch{}});
  await context.routeWebSocket('**', socket=>{
   const target=new URL(socket.url()),local=new URL(base);
   if(target.hostname===local.hostname&&target.port===local.port){socket.connectToServer();return;}
   report.socketsClosed++;socket.close();
  });
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.origin===authOrigin){
    if(url.pathname==='/auth/v1/logout'&&method==='POST'){report.requests.logout++;if(state.logoutGate)await state.logoutGate.promise;state.owner=null;return state.logoutStatus===204?route.fulfill({status:204}):json({code:'unexpected_failure',msg:'Synthetic unavailable'},state.logoutStatus);}
    if(url.pathname==='/auth/v1/token')return state.owner?json(session(state.owner)):json({code:'refresh_token_not_found'},400);
    if(url.pathname==='/auth/v1/user')return state.owner?json(session(state.owner).user):json({code:'session_not_found'},401);
    report.blockedExternal++;return route.abort('blockedbyclient');
   }
   if(url.origin!==base){report.blockedExternal++;return route.abort('blockedbyclient');}
   if(url.pathname.startsWith('/api/')){
    if(url.pathname==='/api/products'&&method==='GET')return json({products:catalog});
    if(url.pathname==='/api/profile'&&method==='GET') {report.requests.profile++;const owner=state.owner,status=state.profileStatus;const payload=owner?{...profile(owner),name:state.name??profile(owner).name}:null;if(state.profileGate)await state.profileGate.promise;return owner&&status===200?json({profile:payload}):json({code:owner?'SERVICE_UNAVAILABLE':'AUTH_REQUIRED',message:'provider-secret-must-not-be-visible'},owner?status:401);}
    if(url.pathname==='/api/profile'&&method==='PATCH'){report.requests.patch++;report.patchOwners.push(request.headers()['x-tf-account']);const owner=state.owner,input=request.postDataJSON();if(state.patchGate)await state.patchGate.promise;return state.patchStatus===409?json({code:'SESSION_CHANGED'},409):json({profile:{...profile(owner),...input}});}
    if(url.pathname==='/api/orders'&&method==='GET'){report.requests.list++;state.lastListAt=Date.now();const owner=state.owner;if(state.listGate)await state.listGate.promise;return owner?json({orders:[order(owner)],nextCursor:null}):json({code:'AUTH_REQUIRED'},401);}
    if(url.pathname.startsWith('/api/orders/')&&method==='DELETE'){report.requests.delete++;report.deleteOwners.push(request.headers()['x-tf-account']);if(state.deleteGate)await state.deleteGate.promise;if(state.deleteStatus===401){state.owner=null;return json({code:'SESSION_EXPIRED'},401);}return route.fulfill({status:204});}
    if(url.pathname.startsWith('/api/orders/')&&method==='GET')return state.owner?json({order:order(state.owner)}):json({code:'AUTH_REQUIRED'},401);
    report.blockedWrites.push({method,path:url.pathname});return route.abort('blockedbyclient');
   }
   if(!['GET','HEAD','OPTIONS'].includes(method)){report.blockedWrites.push({method,path:url.pathname});return route.abort('blockedbyclient');}
   // Browser Auth sees synthetic cookies; the actual Next proxy must never send
   // those fixtures to the real Auth service while serving the application shell.
   const headers={...request.headers()};delete headers.cookie;return route.continue({headers});
  });
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  const refresh=async()=>page.evaluate(()=>window.dispatchEvent(new Event('thunderfang:sessionchange')));
  const account=async owner=>{state.owner=owner;state.name=null;await refresh();await page.locator('header summary[title="'+privateNames[owner]+'"]').waitFor();await page.getByRole('heading',{name:order(owner).number,exact:true}).waitFor();};
  const edit=async()=>{await page.getByRole('button',{name:'Atualizar dados do perfil',exact:true}).click();await page.locator('#profile-name').waitFor();};
  const navigation=await page.goto(base+'/pt-BR/conta',{waitUntil:'networkidle'});
  await page.locator('header summary[title="'+privateNames[A]+'"]').waitFor();
  await check('HTML and unauthenticated API enforce security headers and browser framing is blocked',async()=>{
   // This credential-free local control request is the only API not mocked.
   // The server rejects it before constructing an external Auth client.
   const api=await fetch(base+'/api/profile');assert.equal(api.status,401);
   for(const headers of [navigation.headers(),Object.fromEntries(api.headers.entries())]){
    assert.equal(headers['x-content-type-options'],'nosniff');assert.equal(headers['referrer-policy'],'no-referrer');assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);
   }
   const framed=await page.evaluate(()=>new Promise(resolve=>{const frame=document.createElement('iframe');frame.src='/pt-BR/conta';frame.onload=()=>{let hasHeader=false;try{hasHeader=Boolean(frame.contentDocument?.querySelector('header'));}catch{}frame.remove();resolve(hasHeader);};document.body.append(frame);}));assert.equal(framed,false);
  });
  await check('Private profile, saved address and orders initially belong only to owner A',async()=>{await page.getByRole('heading',{name:order(A).number,exact:true}).waitFor();const text=await page.locator('main').innerText();assert(text.includes('Rua Privada Alfa'));assert(!text.includes('Rua Privada Beta'));});
  await check('Changing identity clears the old name and address editor before the new profile arrives',async()=>{
   await edit();await page.locator('#profile-name').fill('Nome privado ainda não salvo Alfa');
   const gate=deferred();state.profileGate=gate;state.owner=B;await refresh();
   await page.getByText('Verificando sua sessão…',{exact:true}).first().waitFor();
   assert.equal(await page.locator('#profile-name').count(),0);assert(!(await page.locator('main').innerText()).includes('Rua Privada Alfa'));
   state.profileGate=null;gate.resolve();await page.locator('header summary[title="'+privateNames[B]+'"]').waitFor();await edit();assert.equal(await page.locator('#profile-name').inputValue(),privateNames[B]);assert.equal(await page.locator('#default-street').inputValue(),'Rua Privada Beta');
   await page.getByRole('button',{name:'Cancelar edição',exact:true}).click();
  });
  await check('A late profile save cannot overwrite another owner; double submission sends one PATCH with owner tag',async()=>{
   await account(A);await edit();await page.locator('#profile-name').fill('Nome pendente Alfa');const gate=deferred();state.patchGate=gate;const before=report.requests.patch;
   await page.getByRole('button',{name:'Salvar alterações',exact:true}).evaluate(button=>{button.click();button.click();});
   await page.waitForFunction(()=>document.querySelector('#profile-name')?.closest('fieldset')?.disabled);
   await until(()=>report.requests.patch>before);
   assert.equal(report.requests.patch-before,1);assert.equal(report.patchOwners.at(-1),A);
   state.owner=B;await refresh();gate.resolve();state.patchGate=null;
   await page.locator('header summary[title="'+privateNames[B]+'"]').waitFor();await page.getByRole('heading',{name:order(B).number,exact:true}).waitFor();assert(!(await page.locator('main').innerText()).includes('Nome pendente Alfa'));
  });
  await check('A late list response cannot restore the previous owner order or delivery',async()=>{
   await account(A);await page.waitForFunction(last=>Date.now()-last>=450,state.lastListAt);const gate=deferred();state.listGate=gate;const before=report.requests.list;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await until(()=>report.requests.list>before);
   state.owner=B;await refresh();state.listGate=null;gate.resolve();await page.getByRole('heading',{name:order(B).number,exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:order(A).number,exact:true}).count(),0);assert(!(await page.locator('main').innerText()).includes('Rua Privada Alfa'));
  });
  await check('A late deletion cannot mutate a new owner cache and carries the initiating account tag',async()=>{
   await account(A);await page.getByRole('button',{name:'Excluir ou cancelar pedido',exact:true}).click();const gate=deferred();state.deleteGate=gate;const before=report.requests.delete;await page.getByRole('dialog').getByRole('button',{name:/Excluir/}).click();await until(()=>report.requests.delete>before);assert.equal(report.deleteOwners.at(-1),A);
   state.owner=B;await refresh();await page.getByRole('heading',{name:order(B).number,exact:true}).waitFor();state.deleteGate=null;gate.resolve();assert.equal(await page.getByRole('heading',{name:order(B).number,exact:true}).count(),1);
  });
  await check('A definitive profile SESSION_CHANGED rejection invalidates the private cache and fetches the current owner',async()=>{
   await account(A);await edit();await page.locator('#profile-name').fill('Rascunho da conta anterior');state.patchStatus=409;const pending=deferred();state.patchGate=pending;const before=report.requests.patch;await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();await until(()=>report.requests.patch>before);
   const profileRead=deferred();state.profileGate=profileRead;state.owner=B;state.patchGate=null;pending.resolve();await page.getByText('Verificando sua sessão…',{exact:true}).first().waitFor();assert(!(await page.locator('main').innerText()).includes('Rua Privada Alfa'));
   state.profileGate=null;profileRead.resolve();state.patchStatus=200;await page.locator('header summary[title="'+privateNames[B]+'"]').waitFor();
  });
  await check('A definitive DELETE 401 removes private data and the saved checkout draft immediately',async()=>{
   await account(A);state.deleteStatus=401;await page.getByRole('button',{name:'Excluir ou cancelar pedido',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Excluir/}).click();await page.locator('header').getByRole('link',{name:'Entre',exact:true}).waitFor();const text=await page.locator('main').innerText();assert(!text.includes('alpha@example.invalid'));assert(!text.includes('Rua Privada Alfa'));assert.equal(await page.evaluate(()=>sessionStorage.getItem('tf-checkout-draft-v1')),null);state.deleteStatus=204;
  });
  await check('BFCache restoration hides frozen private data while the session is revalidated',async()=>{
   await account(A);const gate=deferred();state.profileGate=gate;state.owner=null;
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   await page.getByText('Verificando sua sessão…',{exact:true}).first().waitFor();const text=await page.locator('main').innerText();assert(!text.includes('Rua Privada Alfa'));assert(!text.includes('alpha@example.invalid'));assert(!text.includes(order(A).number));
   state.profileGate=null;gate.resolve();await page.locator('header').getByRole('link',{name:'Entre',exact:true}).waitFor();
  });
  await check('Untrusted profile text is escaped and never creates an executable DOM element',async()=>{
   state.owner=A;state.name='<img src=x onerror="window.__securityXss=true">';await refresh();await page.locator('header summary[title]').waitFor();assert.equal(await page.evaluate(()=>window.__securityXss??false),false);assert.equal(await page.locator('main img[src="x"]').count(),0);assert((await page.locator('main').innerText()).includes('<img src=x'));
   state.name=null;await account(A);
  });
  await check('SDK logout failure leaves honest feedback visible after the account menu is removed',async()=>{
   state.logoutStatus=503;await page.locator('header summary[title]').click();await page.locator('#navbar-account').getByRole('button',{name:'Sair',exact:true}).click();await page.locator('header').getByRole('link',{name:'Entre',exact:true}).waitFor();await page.getByRole('alert').filter({hasText:'Você saiu deste navegador, mas não foi possível confirmar a saída no servidor.'}).waitFor();assert(report.requests.logout>0);assert(!(await page.locator('main').innerText()).includes('alpha@example.invalid'));
   await account(B);assert.equal(await page.getByText('Você saiu deste navegador, mas não foi possível confirmar a saída no servidor.',{exact:true}).count(),0);
  });
  await check('Profile, private orders and saved delivery are absent from persistent localStorage',async()=>{
   const values=await page.evaluate(()=>Object.keys(localStorage).map(key=>localStorage.getItem(key)).join('\n'));for(const marker of ['alpha@example.invalid','beta@example.invalid','Rua Privada Alfa','Rua Privada Beta','TF-ALFA-PRIVADO','TF-BETA-PRIVADO'])assert(!values.includes(marker));
   assert.equal(report.blockedWrites.length,0);assert.equal(report.errors.length,0);
  });
 } catch(error){if(page){report.debug={url:page.url(),text:(await page.locator('body').innerText().catch(()=>'' )).slice(0,1000)};await page.screenshot({path:path.join(output,'client-isolation-failure.png')}).catch(()=>{});}report.checks.push({name:'Regression run stopped',passed:false,error:error.message});process.exitCode=1;}
 finally{await context.close();await browser.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'client-isolation-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})().catch(error=>{console.log(error.name);process.exitCode=1;});

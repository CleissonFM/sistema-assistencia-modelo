// Teste: uma loja nova instalando o sistema do zero (usa o Supabase simulado).
// Rodar: node ferramentas/teste_instalacao.js   (precisa do Playwright)
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..');const ok=(c,m)=>{console.log((c?'  ok  ':'  FALHOU')+' '+m);if(!c)process.exitCode=1};
const srv=require('./mock_server.js')();const S=srv.S;
(async()=>{
  const b=await chromium.launch();const erros=[];
  const site=fs.readFileSync(R+'/site-pronto/index.html','utf8');
  const pasta=fs.mkdtempSync('/tmp/teste-site-');
  fs.writeFileSync(pasta+'/index.html',site);
  // 1) sem configurar o config.js
  fs.copyFileSync(R+'/fonte/config.exemplo.js',pasta+'/config.js');
  const ab=async(n,vp)=>{const c=await b.newContext(vp||{viewport:{width:1440,height:900}});const p=await c.newPage();p.on('pageerror',e=>erros.push(n+': '+e.message));await srv.ligar(p);await p.goto('file://'+pasta+'/index.html');await p.waitForTimeout(600);return p};
  let p=await ab('sem-config');
  ok((await p.textContent('#login')).includes('Falta configurar o arquivo config.js'),'sem config.js: avisa o que fazer');
  // 2) configurado
  fs.writeFileSync(pasta+'/config.js',"window.SISTEMA_CONFIG={supabaseUrl:'https://teste.supabase.co',supabaseChavePublica:'sb_publishable_teste'};");
  p=await ab('admin');
  ok((await p.textContent('#login')).includes('Sistema da loja'),'tela de entrada genérica');
  await p.fill('#lgUser','admin');await p.fill('#lgPass','admin123');await p.click('#lgGo');await p.waitForTimeout(1500);
  ok(await p.evaluate(()=>$('#login').hidden),'administrador entrou');
  ok(await p.isVisible('#bv-fantasia'),'abre o "Bem-vindo! Vamos configurar a sua loja"');
  await p.screenshot({path:pasta+'/1-boas-vindas.png'});
  await p.fill('#bv-fantasia','Assistência Silva');await p.fill('#bv-razao','Silva Reparos Ltda');await p.fill('#bv-cidade','Recife');await p.selectOption('#bv-uf','PE');
  await p.click('[data-act=onBoasVindasOk]');await p.waitForTimeout(900);
  const cfg=[...S.reg.values()].find(r=>r.colecao==='config');
  ok(cfg&&cfg.dados.fantasia==='Assistência Silva'&&cfg.dados.cuf===26,'dados da loja salvos no banco (UF PE = código 26)');
  ok((await p.textContent('#brandLoja'))==='Assistência Silva'&&(await p.textContent('.side .mark')).includes('AS'),'menu com o nome e as iniciais "AS"');
  const fun=[...S.reg.values()].filter(r=>r.colecao==='funcionarios').map(r=>r.dados.nome);
  ok(fun.length===1&&fun[0]==='Administrador Teste','equipe começa só com o administrador: '+fun.join(','));
  const txt=await p.evaluate(()=>document.body.innerText+JSON.stringify(DB));
  ok(!/Cleisson|ID Soluções|Kaique|Luciana|57\.631|Holandeses/.test(txt),'nenhum dado da ID Soluções');
  await p.screenshot({path:pasta+'/2-painel.png'});
  // 3) cria um técnico e ele entra
  await p.evaluate(()=>location.hash='funcionarios');await p.waitForTimeout(300);
  await p.click('#view .ph [data-act=formFunc]');await p.waitForTimeout(200);await p.fill('[data-f="d.nome"]','Pedro');await p.fill('[data-f="d.comServico"]','25');await p.click('[data-act=salvarFunc]');await p.waitForTimeout(600);
  await p.click('[data-act=onNovoAcesso]');await p.waitForTimeout(200);
  await p.fill('#acNomeP','Pedro');await p.fill('#acUser','pedro');await p.fill('#acSenha','pedro123');
  const fid=await p.evaluate(()=>DB.funcionarios.find(f=>f.nome==='Pedro').id);await p.selectOption('#acFunc',fid);
  await p.click('[data-act=onSalvarAcesso]');await p.waitForTimeout(600);
  const t=await ab('tecnico');await t.fill('#lgUser','pedro');await t.fill('#lgPass','pedro123');await t.click('#lgGo');await t.waitForTimeout(1500);
  ok(await t.evaluate(()=>$('#login').hidden&&!document.querySelector('#nav a[href="#config"]')),'técnico criado entra, sem Configurações');
  ok(!(await t.isVisible('#bv-fantasia')),'técnico não vê a tela de boas-vindas');
  console.log('erros:',JSON.stringify(erros.slice(0,5)));if(erros.length)process.exitCode=1;
  console.log('capturas em',pasta);await b.close();
})();

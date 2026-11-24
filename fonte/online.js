/* ========== Versão online: login, banco único (Supabase) e tempo real ========== */
const ONLINE=(()=>{const c=window.SISTEMA_CONFIG||{};return {url:String(c.supabaseUrl||'').replace(/\/+$/,''),key:String(c.supabaseChavePublica||''),dominio:'loja.app'}})();
const ON={sb:null,uid:null,perfil:null,perfis:[],snap:new Map(),timer:null,busy:false,again:false,pend:false,orfas:{},estado:'ok',falhas:0};
const ON_COLS=['clientes','iphones','acessorios','os','vendas','notas','funcionarios','metas','gastos','movs','pagamentosCom'];
const ON_SO_DONO=['config','funcionarios','metas','comPagas','pagamentosCom'];
const ON_SO_CRIA=['procedencias','gastos'];
// quem não é dono só cria (não altera) procedência; o técnico também só cria gastos; a vendedora edita gastos, menos compra de aparelho
const onSoCria=r=>r.colecao==='procedencias'||(r.colecao==='gastos'&&(ON.perfil.papel!=='vendedor'||(r.dados&&r.dados.categoria)==='Compra de aparelho'));
const ON_ROTAS={tecnico:['painel','ia','os','planilha','estoque','acessorios','clientes','comissoes','metas'],vendedor:['painel','ia','os','planilha','vendas','crm','gastos','estoque','acessorios','clientes','comissoes','metas']};
const PAPEL_NOME={dono:'Administrador',tecnico:'Técnico',vendedor:'Vendedor(a)'};
const ehDono=()=>!!(ON.perfil&&ON.perfil.papel==='dono');
const emailDe=u=>String(u||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'')+'@'+ONLINE.dominio;

/* ---- dados <-> linhas do banco ---- */
function dbVazio(){
  const lojaBase=(()=>{const keep=DB;ON.mudo=true;try{seed()}finally{ON.mudo=false}const l=clone(DB.loja);DB=keep;return l})();
  ['fantasia','razao','cnpj','ie','im','end','bairro','cidade','uf','cep','tel','whats'].forEach(k=>lojaBase[k]='');lojaBase.cuf=0;
  return {loja:{...lojaBase,margemPadrao:lojaBase.margemPadrao??30},tecnicos:[],funcionarios:[],clientes:[],iphones:[],acessorios:[],os:[],vendas:[],notas:[],metas:[],gastos:[],movs:[],comPagas:{},pagamentosCom:[],seq:{os:1,venda:1,gasto:0,nf:{'NFC-e':1,'NF-e':1,'NFS-e':1}}};
}
function dbInicial(){
  const D=dbVazio();
  D.funcionarios=[{id:'f0',nome:(ON.perfil&&ON.perfil.nome)||'Administrador',funcao:'Dono',dono:true,tel:'',cpf:'',pix:'',comServico:0,comVenda:0,soSemDono:false,vendaAparelho:false,ativo:true}];
  DB=D;D.metas=metasPadrao();return D;
}
function onLinhas(){
  const m=new Map(),put=(c,id,d)=>m.set(c+'|'+id,{colecao:c,id:String(id),dados:d});
  put('config','loja',DB.loja);put('seq','seq',DB.seq);
  ON_COLS.forEach(c=>(DB[c]||[]).forEach(x=>{if(!x||x.id==null)return;if(c==='iphones'){const {procedencia,...r}=x;put(c,x.id,r);if(procedencia&&procedencia.tipo)put('procedencias',x.id,procedencia)}else put(c,x.id,x)}));
  Object.entries(DB.comPagas||{}).forEach(([k,v])=>put('comPagas',k,{data:v}));
  return m;
}
const T0=x=>new Date(x||0).getTime()||0;
function onOrdenar(D){
  D.os.sort((a,b)=>T0(b.criada)-T0(a.criada));D.vendas.sort((a,b)=>T0(b.data)-T0(a.data));D.notas.sort((a,b)=>T0(b.data)-T0(a.data));
  D.iphones.sort((a,b)=>T0(b.entrada)-T0(a.entrada));D.movs.sort((a,b)=>T0(b.data)-T0(a.data));D.gastos.sort((a,b)=>(b.num||0)-(a.num||0));
  D.pagamentosCom.sort((a,b)=>T0(b.data)-T0(a.data));D.clientes.sort((a,b)=>T0(a.criado)-T0(b.criado));
  D.acessorios.sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt'));
  D.funcionarios.sort((a,b)=>(b.dono?1:0)-(a.dono?1:0)||String(a.id).localeCompare(String(b.id)));
}
function onMontar(rows){
  const D=dbVazio(),proc={};
  rows.forEach(r=>{const d=r.dados;
    if(r.colecao==='config'&&r.id==='loja')D.loja=d;
    else if(r.colecao==='seq')D.seq=d;
    else if(r.colecao==='comPagas')D.comPagas[r.id]=d.data;
    else if(r.colecao==='procedencias')proc[r.id]=d;
    else if(Array.isArray(D[r.colecao]))D[r.colecao].push(d)});
  D.iphones.forEach(i=>{if(proc[i.id])i.procedencia=proc[i.id]});
  onOrdenar(D);return D;
}

/* ---- gravação: só o que mudou, com nova tentativa se cair a conexão ---- */
function onAgendar(){clearTimeout(ON.timer);ON.timer=setTimeout(onSincronizar,350);onStatus('salvando')}
async function onSincronizar(){
  if(!ON.sb||!ON.perfil)return;
  if(ON.busy){ON.again=true;return}ON.busy=true;
  const agora=onLinhas(),up=[],ins=[],del={},dono=ehDono();
  agora.forEach((r,k)=>{const j=JSON.stringify(r.dados);if(ON.snap.get(k)===j)return;
    if(!dono&&ON_SO_DONO.includes(r.colecao))return;
    if(!dono&&onSoCria(r)){if(!ON.snap.has(k))ins.push([k,j,r]);return}
    up.push([k,j,r])});
  if(dono)ON.snap.forEach((j,k)=>{if(!agora.has(k)){const [c,...id]=k.split('|');(del[c]=del[c]||[]).push(id.join('|'))}});
  const lin=a=>a.map(([,,r])=>({colecao:r.colecao,id:r.id,dados:r.dados,atualizado:new Date().toISOString(),atualizado_por:ON.uid}));
  try{
    for(let i=0;i<up.length;i+=400){const p=up.slice(i,i+400);const {error}=await ON.sb.from('registros').upsert(lin(p),{onConflict:'colecao,id'});if(error)throw error;p.forEach(([k,j])=>ON.snap.set(k,j))}
    for(const x of ins){const {error}=await ON.sb.from('registros').upsert(lin([x]),{onConflict:'colecao,id',ignoreDuplicates:true});ON.snap.set(x[0],x[1]);if(error)console.warn('registro interno',error.message)}
    for(const c in del){const ids=del[c];for(let i=0;i<ids.length;i+=200){const p=ids.slice(i,i+200);const {error}=await ON.sb.from('registros').delete().eq('colecao',c).in('id',p);if(error)throw error;p.forEach(id=>ON.snap.delete(c+'|'+id))}}
    ON.falhas=0;onStatus('ok');
  }catch(e){
    ON.falhas++;onStatus('erro',e);
    if(/JWT|token|auth/i.test(e.message||''))await ON.sb.auth.refreshSession().catch(()=>{});
    setTimeout(onAgendar,Math.min(30000,2000*ON.falhas));
  }finally{ON.busy=false;if(ON.again){ON.again=false;onAgendar()}}
}
function onPendente(){const a=onLinhas();for(const [k,r] of a){const j=JSON.stringify(r.dados);if(ON.snap.get(k)!==j){if(!ehDono()&&ON_SO_DONO.includes(r.colecao))continue;if(!ehDono()&&onSoCria(r)&&ON.snap.has(k))continue;return true}}return false}
function onStatus(s,e){ON.estado=s;const el=$('#onSync');if(!el)return;
  el.className='on-sync '+s;el.textContent=s==='ok'?'Tudo salvo':s==='salvando'?'Salvando…':'Sem conexão · tentando de novo';
  el.title=s==='erro'&&e?String(e.message||e):''}

/* ---- tempo real: o que outro computador salvar aparece aqui ---- */
function onAplicar(p){
  const r=(p.new&&p.new.colecao)?p.new:p.old;if(!r||!r.colecao)return;
  if(p.eventType!=='DELETE'&&p.new.atualizado_por&&p.new.atualizado_por===ON.uid)return;
  const c=r.colecao,id=r.id,k=c+'|'+id;
  if(p.eventType==='DELETE'){
    ON.snap.delete(k);
    if(c==='comPagas')delete DB.comPagas[id];else if(c==='procedencias'){const i=DB.iphones.find(x=>x.id===id);if(i)delete i.procedencia}
    else if(Array.isArray(DB[c]))DB[c]=DB[c].filter(x=>x.id!==id);
  }else{
    const d=r.dados;ON.snap.set(k,JSON.stringify(d));
    if(c==='config'&&id==='loja')DB.loja=d;
    else if(c==='seq'){const s=DB.seq;['os','venda','gasto'].forEach(q=>s[q]=Math.max(+s[q]||0,+d[q]||0));s.nf=s.nf||{};Object.keys(d.nf||{}).forEach(q=>s.nf[q]=Math.max(+s.nf[q]||0,+d.nf[q]||0));if(JSON.stringify(s)!==JSON.stringify(d))onAgendar()}
    else if(c==='comPagas')DB.comPagas[id]=d.data;
    else if(c==='procedencias'){const i=DB.iphones.find(x=>x.id===id);if(i)i.procedencia=d;else ON.orfas[id]=d}
    else if(Array.isArray(DB[c])){const a=DB[c],i=a.findIndex(x=>x.id===id);
      if(c==='iphones'){const pr=(i>=0&&a[i].procedencia)||ON.orfas[id];if(pr){d.procedencia=pr;delete ON.orfas[id]}}
      if(i>=0)a[i]=d;else{a.unshift(d);onOrdenar(DB)}}
  }
  ON.pend=true;onRenderSePuder();
}
function onRenderSePuder(){
  if(!ON.pend)return;const a=document.activeElement;
  const ocupado=!$('#drawer').hidden||!$('#modal').hidden||(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.id!=='gsInput');
  if(ocupado)return;ON.pend=false;route();
}
setInterval(onRenderSePuder,2000);
function onAssinar(){
  ON.sb.channel('registros-'+ON.uid).on('postgres_changes',{event:'*',schema:'public',table:'registros'},onAplicar)
    .subscribe(st=>{if(st==='CHANNEL_ERROR'||st==='TIMED_OUT')setTimeout(()=>onRecarregar(true),5000)});
}
async function onRecarregar(silencioso){
  try{const rows=await onBaixarTudo();if(onPendente())return;ON.snap=new Map(rows.map(r=>[r.colecao+'|'+r.id,JSON.stringify(r.dados)]));DB=onMontar(rows);ON.pend=true;onRenderSePuder()}catch(e){if(!silencioso)toast('Não foi possível atualizar agora')}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ON.perfil&&!ON.busy&&!onPendente())onRecarregar(true)});
window.addEventListener('beforeunload',e=>{if(ON.perfil&&(ON.busy||onPendente())){e.preventDefault();e.returnValue=''}});

async function onBaixarTudo(){
  const out=[];for(let de=0;;de+=1000){const {data,error}=await ON.sb.from('registros').select('colecao,id,dados').order('colecao').order('id').range(de,de+999);if(error)throw error;out.push(...data);if(data.length<1000)break}
  return out;
}

/* ---- tela de entrada ---- */
function onLoginHTML(){
  return `<div class="lg-card"><div class="brand lg-brand"><div class="mark">${(()=>{try{const l=localStorage.getItem(KEY+'-logo');if(l)return '<img class="logo-img" src="'+l+'" alt="Logo">'}catch(e){}return LOGO_SVG})()}</div><div><b>${esc((()=>{try{return localStorage.getItem(KEY+'-nome')}catch(e){return ''}})()||'Sistema da loja')}</b><small>Sistema da loja</small></div></div>
  <h1>Entrar</h1><p class="muted" style="margin:0">Use o usuário e a senha que o administrador criou para você.</p>
  <form id="lgForm" class="form" autocomplete="on" novalidate>
    ${fld('Usuário',`<input id="lgUser" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="ex.: kaique" required>`)}
    ${fld('Senha','<input id="lgPass" name="password" type="password" autocomplete="current-password" required>')}
    <span class="form-err" id="lgErr" role="alert"></span>
    <button class="btn pri lg-go" type="submit" id="lgGo">Entrar</button>
  </form>
  <p class="ai-note" style="text-align:center">Esqueceu a senha? Peça ao administrador para trocar.</p></div>`;
}
function onMostrarLogin(modo,msg){
  let el=$('#login');if(!el){el=document.createElement('div');el.id='login';el.className='login';document.body.appendChild(el)}
  el.hidden=false;el.innerHTML=onLoginHTML();if(msg)$('#lgErr').textContent=msg;setTimeout(()=>{const u=$('#lgUser');if(u)u.focus()},30);
}
function onCarregando(t){let el=$('#login');if(!el){el=document.createElement('div');el.id='login';el.className='login';document.body.appendChild(el)}el.hidden=false;el.innerHTML=`<div class="lg-card lg-wait"><div class="pulse"></div><span>${esc(t)}</span></div>`}
function onErroAuth(e){const m=String(e&&e.message||e||'');
  if(/Invalid login credentials|invalid_credentials/i.test(m))return 'Usuário ou senha incorretos.';
  if(/Email not confirmed/i.test(m))return 'Conta incompleta. Peça ao administrador para trocar sua senha.';
  if(/already registered|already exists/i.test(m))return 'Esse usuário já criou a senha. Use "Entrar", ou peça ao administrador para liberar nova senha.';
  if(/Database error|não autorizado/i.test(m))return 'Este usuário não está liberado. Peça ao administrador para cadastrar ou liberar nova senha.';
  if(/Password should be|at least 6|weak/i.test(m))return 'A senha precisa ter pelo menos 6 caracteres.';
  if(/confirm/i.test(m))return 'Falta desligar a confirmação de e-mail no Supabase (veja o passo a passo).';
  if(/email.*invalid|invalid.*email/i.test(m))return 'O Supabase recusou o nome de usuário. Avise o suporte do sistema.';
  if(/fetch|network|Failed/i.test(m))return 'Sem conexão com a internet.';
  if(/rate limit/i.test(m))return 'Muitas tentativas. Espere um minuto e tente de novo.';
  return 'Não foi possível entrar: '+m;
}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='lgForm')return;e.preventDefault();
  const u=$('#lgUser').value.trim().toLowerCase().replace(/\s+/g,''),s=$('#lgPass').value,err=$('#lgErr'),go=$('#lgGo');
  if(!u||!s){err.textContent='Preencha usuário e senha.';return}
  go.disabled=true;err.textContent='';
  try{const r=await ON.sb.auth.signInWithPassword({email:emailDe(u),password:s});if(r.error)throw r.error;await onEntrar()}
  catch(x){err.textContent=onErroAuth(x);go.disabled=false}
});

/* ---- entrar no sistema ---- */
async function onEntrar(){
  const {data:{session}}=await ON.sb.auth.getSession();if(!session){onMostrarLogin('entrar');return}
  ON.uid=session.user.id;onCarregando('Carregando os dados da loja…');
  const {data:pf,error:pe}=await ON.sb.from('perfis').select('*').eq('user_id',ON.uid).maybeSingle();
  if(pe||!pf||!pf.ativo){await ON.sb.auth.signOut();onMostrarLogin('entrar',pe?onErroAuth(pe):'Acesso bloqueado. Fale com o administrador.');return}
  ON.perfil=pf;
  let rows;try{rows=await onBaixarTudo()}catch(x){onMostrarLogin('entrar','Não foi possível carregar os dados: '+(x.message||x));return}
  ON.snap=new Map(rows.map(r=>[r.colecao+'|'+r.id,JSON.stringify(r.dados)]));
  if(!rows.length){if(!ehDono()){await ON.sb.auth.signOut();ON.perfil=null;onMostrarLogin('entrar','O sistema ainda está vazio. O administrador precisa entrar primeiro.');return}DB=dbInicial()}
  else DB=onMontar(rows);
  try{migrarLoja();migrar2();migrar3();migrarDono()}catch(x){console.warn(x)}
  if(ehDono())await onCarregarPerfis();
  onAplicarPapel();
  CART=novoCarrinho();LAY=loadLay();$('#ai').innerHTML=aiShellHTML();$('#pz').innerHTML=pzShellHTML();applyLayout();route();
  $('#login').hidden=true;onAssinar();onAgendar();
  if(ehDono()&&!String(DB.loja.fantasia||'').trim())setTimeout(onBoasVindas,300);
}
function onAplicarPapel(){
  const p=ON.perfil.papel;document.body.classList.add('online');document.body.classList.toggle('nao-dono',p!=='dono');
  const ok=ON_ROTAS[p];if(ok){Object.keys(NAV_DEF).forEach(k=>{if(!ok.includes(k)&&k!=='config')delete NAV_DEF[k]});Object.keys(VIEWS).forEach(k=>{if(!ok.includes(k))delete VIEWS[k]});delete NAV_DEF.config;if(!ok.includes(LAY&&LAY.inicio))try{LAY.inicio='painel'}catch(e){}}
  if(p==='tecnico')document.body.classList.add('papel-tecnico');
  const sf=$('.side-foot');if(sf)sf.innerHTML=`<span class="on-user"><b>${esc(ON.perfil.nome)}</b><span>${PAPEL_NOME[p]||p} · ${esc(ON.perfil.usuario)}</span></span><span id="onSync" class="on-sync ok">Tudo salvo</span><span class="tgs"><button type="button" class="btn sm" data-act="onMinhaSenha">Trocar senha</button><button type="button" class="btn sm" data-act="onSair">Sair</button></span>`;
}

/* ---- o que muda para quem não é o dono ---- */
const _comissoesTodas=comissoes;
comissoes=function(per){const r=_comissoesTodas(per);if(!ON.perfil||ehDono())return r;const f=ON.perfil.funcionario_id;return f&&r[f]?{[f]:r[f]}:{}};

/* ---- acessos (só o dono) ---- */
async function onCarregarPerfis(){const {data,error}=await ON.sb.from('perfis').select('*').order('criado');if(!error)ON.perfis=data||[]}
function onAcessosHTML(){
  if(!ehDono())return '';
  const fn=id=>(funcById(id)||{}).nome||'—';
  return `<section class="card"><div class="card-h"><h3>Usuários do sistema</h3><button class="btn sm pri" data-act="onNovoAcesso">${ic('plus',15)}Novo usuário</button></div>
  <div class="tbl-wrap"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Função</th><th>Funcionário</th><th>Situação</th><th></th></tr></thead><tbody>${ON.perfis.map(p=>`<tr><td><b class="mono">${esc(p.usuario)}</b></td><td>${esc(p.nome)}</td><td>${p.papel==='dono'?'Administrador':PAPEL_NOME[p.papel]||p.papel}</td><td>${esc(fn(p.funcionario_id))}</td><td>${!p.ativo?'<span class="chip bad">Bloqueado</span>':'<span class="chip ok">Ativo</span>'}</td><td class="r">${p.user_id===ON.uid?'<span class="muted">você</span>':`<button class="btn sm" data-act="onSenhaDe" data-u="${esc(p.usuario)}">Trocar senha</button> <button class="btn sm" data-act="onBloquear" data-u="${esc(p.usuario)}">${p.ativo?'Bloquear':'Desbloquear'}</button> <button class="btn sm danger" data-act="onApagar" data-u="${esc(p.usuario)}">Apagar</button>`}</td></tr>`).join('')}</tbody></table></div>
  <div class="card-b"><p class="ai-note" style="margin-top:12px">Só você, como administrador, cria e apaga usuários. Bloquear tira o acesso na hora, sem apagar. O que a pessoa lançou no sistema continua salvo mesmo se o usuário for apagado.</p></div></section>`;
}
const _vFuncionarios=vFuncionarios;vFuncionarios=()=>_vFuncionarios()+onAcessosHTML();
const _procHTML=procHTML;procHTML=d=>(!ON.perfil||ehDono()||!FORM||!FORM.id)?_procHTML(d):'';
const _procBox=procBox;procBox=itens=>(!ON.perfil||ehDono())?_procBox(itens):'';
ACT.onSair=async()=>{if(onPendente()||ON.busy){toast('Salvando… tente sair em alguns segundos.');onAgendar();return}await ON.sb.auth.signOut();location.reload()};
const onErroRpc=e=>String(e&&e.message||e||'Erro');
ACT.onNovoAcesso=()=>{FORM={kind:'acesso',d:{usuario:'',nome:'',papel:'tecnico',funcionario_id:'',senha:''}};
  openDrawer('Novo usuário',`<div class="form"><div class="sec"><div class="g2">
    ${fld('Nome',`<input data-f="d.nome" id="acNomeP" placeholder="ex.: João Silva">`)}
    ${fld('Usuário (para entrar)',`<input data-f="d.usuario" id="acUser" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="ex.: joao">`,'','Uma palavra só, minúscula, sem espaço nem acento.')}
    ${fld('Senha',`<input data-f="d.senha" id="acSenha" type="text" autocomplete="off" placeholder="mínimo 6 caracteres">`,'','Passe a senha para a pessoa. Ela pode trocar depois.')}
    ${fld('Função',`<select data-f="d.papel" id="acPapel">${optV([['tecnico','Técnico: OS, aparelhos, clientes'],['vendedor','Vendedor(a): vendas, estoque, clientes']],'tecnico')}</select>`)}
    ${fld('Funcionário (comissões e metas)',`<select data-f="d.funcionario_id" id="acFunc">${optV([['','—'],...funcsAtivos().filter(f=>!f.dono).map(f=>[f.id,f.nome])],'')}</select>`,'span2','Cadastre a pessoa antes em Funcionários para ela ter comissão e metas.')}
  </div></div></div>`,`<span class="form-err" id="formErr"></span><button class="btn" data-act="closeDrawer">Cancelar</button><button class="btn pri" data-act="onSalvarAcesso">${ic('check')}Criar usuário</button>`)};
ACT.onSalvarAcesso=async b=>{const d=FORM.d,u=String(d.usuario||'').trim().toLowerCase();
  if(!String(d.nome||'').trim())return formErr('Informe o nome.');
  if(!/^[a-z0-9._-]{2,30}$/.test(u))return formErr('Usuário inválido: uma palavra só, minúscula, sem espaço nem acento.');
  if(String(d.senha||'').length<6)return formErr('A senha precisa ter pelo menos 6 caracteres.');
  b.disabled=true;const {error}=await ON.sb.rpc('criar_usuario',{u,n:d.nome.trim(),p:d.papel,f:d.funcionario_id||'',senha:d.senha});b.disabled=false;
  if(error)return formErr(onErroRpc(error));
  await onCarregarPerfis();closeDrawer();route();toast(`Usuário ${u} criado. Passe a senha para a pessoa.`)};
function onSenhaModal(u,minha){FORM={kind:'senha',u};
  openModal(minha?'Trocar minha senha':`Trocar senha de ${esc(u)}`,`<div class="sec"><div class="g2">${fld('Nova senha','<input id="snNova" type="password" autocomplete="new-password">','','Mínimo 6 caracteres.')}${fld('Repita a senha','<input id="snNova2" type="password" autocomplete="new-password">')}</div></div>`,
  `<span class="form-err" id="snErr"></span><button class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" data-act="onSenhaOk">${ic('check')}Salvar senha</button>`,true);setTimeout(()=>{const e=$('#snNova');if(e)e.focus()},30)}
ACT.onMinhaSenha=()=>onSenhaModal(ON.perfil.usuario,true);
ACT.onSenhaDe=b=>onSenhaModal(b.dataset.u,false);
ACT.onSenhaOk=async b=>{const s1=$('#snNova').value,s2=$('#snNova2').value,e=$('#snErr');
  if(s1.length<6){e.textContent='A senha precisa ter pelo menos 6 caracteres.';return}if(s1!==s2){e.textContent='As duas senhas não são iguais.';return}
  b.disabled=true;const {error}=await ON.sb.rpc('trocar_senha',{u:FORM.u,senha:s1});b.disabled=false;
  if(error){e.textContent=onErroRpc(error);return}closeModal();toast('Senha trocada')};
ACT.onBloquear=async b=>{const p=ON.perfis.find(x=>x.usuario===b.dataset.u);if(!p)return;const {error}=await ON.sb.from('perfis').update({ativo:!p.ativo}).eq('usuario',p.usuario);if(error)return toast(onErroRpc(error));await onCarregarPerfis();route();toast(p.ativo?`${p.usuario} bloqueado`:`${p.usuario} desbloqueado`)};
ACT.onApagar=async b=>{if(!b.dataset.armed){b.dataset.armed='1';b.textContent='Confirmar apagar';setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent='Apagar'}},4000);return}
  const {error}=await ON.sb.rpc('apagar_usuario',{u:b.dataset.u});if(error)return toast(onErroRpc(error));await onCarregarPerfis();route();toast(`Usuário ${b.dataset.u} apagado`)};

/* ---- cópia de segurança (dono) ---- */
function onBaixarBlob(nome,txt,tipo){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:tipo}));a.download=nome;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
baixarArquivo=async(nome,txt)=>{onBaixarBlob(nome,txt,nome.endsWith('.json')?'application/json':'text/csv;charset=utf-8');toast('Arquivo baixado')};
const _vConfig=vConfig;
vConfig=()=>_vConfig().replace(/<section class="sec"><div class="sec-h"><h3>Dados do protótipo<\/h3>[\s\S]*?<\/section>/,`<section class="sec"><div class="sec-h"><h3>Cópia de segurança</h3></div><p class="muted" style="margin:0">O plano grátis do banco não guarda cópias sozinho. Baixe uma cópia toda semana e guarde no computador ou no Google Drive.</p><div class="tgs"><button class="btn" data-act="backupJSON">${ic('doc',16)}Baixar cópia dos dados</button><label class="btn">${ic('swap',16)}Importar cópia<input type="file" accept=".json,application/json" id="onImport" hidden></label></div><p class="ai-note">Importar substitui todos os dados do sistema pelos do arquivo.</p></section>`);
document.addEventListener('change',async e=>{if(e.target.id!=='onImport')return;const f=e.target.files[0];if(!f)return;
  try{const d=JSON.parse(await f.text());if(!d||!Array.isArray(d.os)||!d.loja)throw new Error('arquivo não é uma cópia do sistema');
    openModal('Importar cópia',`<p style="margin:0">Substituir <b>todos</b> os dados do sistema pelos do arquivo <b>${esc(f.name)}</b>?</p><p class="muted">${d.os.length} OS · ${(d.vendas||[]).length} vendas · ${(d.clientes||[]).length} clientes · ${(d.iphones||[]).length} aparelhos</p>`,`<button class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" data-act="onImportOk">Substituir</button>`,true);
    ON.importar=d}catch(x){toast('Não deu para importar: '+x.message)}e.target.value=''});
ACT.onImportOk=()=>{const d=ON.importar;if(!d)return;const base=dbVazio();DB={...base,...d,loja:{...base.loja,...d.loja}};try{migrarLoja();migrar2();migrar3();migrarDono()}catch(x){}onOrdenar(DB);closeModal();route();onAgendar();toast('Cópia importada. Salvando no banco…')};

/* ---- início ---- */
async function onIniciar(){
  if(!ONLINE.url||!ONLINE.key||/SEU-PROJETO/.test(ONLINE.url)||/COLE_AQUI/.test(ONLINE.key)){onCarregando('Falta configurar o arquivo config.js com o endereço e a chave pública do seu Supabase (veja o guia de instalação).');return}
  if(!window.supabase||!window.supabase.createClient){onCarregando('Sem conexão com a internet. Recarregue a página.');return}
  ON.sb=window.supabase.createClient(ONLINE.url,ONLINE.key,{auth:{persistSession:true,autoRefreshToken:true}});
  ON.sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'&&ON.perfil)location.reload()});
  const {data:{session}}=await ON.sb.auth.getSession();
  if(session)await onEntrar();else onMostrarLogin('entrar');
}

/* ---- assistente de IA: usa a função "assistente" do Supabase (a chave fica lá, não no site) ---- */
function onSampleShim(){
  async function chamar(input,opts,json){
    opts=opts||{};
    const {data:{session}}=await ON.sb.auth.getSession();if(!session)throw {code:'sem_login'};
    const messages=typeof input==='string'?[{role:'user',content:input}]:input.map(m=>({role:m.role,content:String(m.content)}));
    let r;
    try{r=await fetch(ONLINE.url+'/functions/v1/assistente',{method:'POST',signal:opts.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,apikey:ONLINE.key},body:JSON.stringify({messages,tier:opts.modelTier==='quick'?'quick':'default',json:!!json})})}
    catch(e){throw {code:(e&&e.name==='AbortError')?'cancelled':'upstream_error'}}
    if(!r.ok){let j={};try{j=await r.json()}catch(e){}throw {code:(j.error&&j.error.code)||(r.status===404?'sem_funcao':'upstream_error')}}
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='',text='',stop=null;
    try{
      for(;;){const {value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
        while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;const o=JSON.parse(l);
          if(o.error)throw {code:o.error.code,text};
          if(o.t){text+=o.t;if(opts.onText)opts.onText({text,delta:o.t})}
          else if(o.done)stop=o.stop}}
    }catch(e){if(opts.signal&&opts.signal.aborted)throw {code:'cancelled',text};throw (e&&e.code)?e:{code:'upstream_error',text}}
    if(!text&&stop!=='max_tokens')throw {code:'empty_completion'};
    return {text,truncated:stop==='max_tokens'};
  }
  const s=(input,opts)=>chamar(input,opts,false);
  s.json=async(input,opts)=>{const r=await chamar(input,opts,true);const m=r.text.match(/\{[\s\S]*\}/);return m?JSON.parse(m[0]):null};
  s.limits=async()=>({images:false});
  return s;
}
Object.assign(AI_ERR,{
  sem_chave:'O assistente ainda não foi ligado: falta a chave da IA no Supabase.',
  sem_credito:'Acabou o crédito da IA. O administrador precisa colocar crédito na conta da Anthropic.',
  sem_funcao:'O assistente ainda não foi instalado no Supabase (função "assistente").',
  sem_login:'Sua sessão expirou. Saia e entre de novo.',
  grande:'Os dados da loja ficaram grandes demais para uma pergunta só.',
  pedido:'Não foi possível enviar a pergunta.'
});

/* ---- comprovantes no Supabase Storage (espaço privado "comprovantes") ---- */
anexoGuardar=async p=>{
  const id=uid('ax'),path=`${new Date().getFullYear()}/${id}-${String(p.nome).replace(/[^\w.-]+/g,'_')}`;
  const {error}=await ON.sb.storage.from('comprovantes').upload(path,p.blob,{contentType:p.tipo,upsert:false});
  if(error)throw new Error(/bucket|not.?found/i.test(error.message||'')?'Falta criar o espaço de comprovantes no Supabase (texto do SQL Editor).':'Não foi possível enviar: '+(error.message||'erro'));
  return {id,nome:p.nome,tipo:p.tipo,path,em:new Date().toISOString()};
};
anexoURL=async a=>{if(a.data)return a.data;const {data,error}=await ON.sb.storage.from('comprovantes').createSignedUrl(a.path,3600);if(error||!data)throw error||new Error('sem link');return data.signedUrl};


/* ---- primeiro acesso do administrador: dados da loja ---- */
const UFS='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const CUF={RO:11,AC:12,AM:13,RR:14,PA:15,AP:16,TO:17,MA:21,PI:22,CE:23,RN:24,PB:25,PE:26,AL:27,SE:28,BA:29,MG:31,ES:32,RJ:33,SP:35,PR:41,SC:42,RS:43,MS:50,MT:51,GO:52,DF:53};
function onBoasVindas(){
  const L=DB.loja;FORM={kind:'boasvindas',d:{fantasia:L.fantasia||'',razao:L.razao||'',cnpj:L.cnpj||'',whats:L.whats||'',end:L.end||'',bairro:L.bairro||'',cidade:L.cidade||'',uf:L.uf||'',cep:L.cep||''}};
  const f=(l,k,x='',cls='')=>fld(l,`<input data-f="d.${k}" id="bv-${k}" value="${esc(FORM.d[k])}" ${x}>`,cls);
  openModal('Bem-vindo! Vamos configurar a sua loja',`<div class="sec"><p class="muted" style="margin:0">Estes dados aparecem no menu, nos comprovantes e nas mensagens aos clientes. Dá para mudar depois em Configurações.</p><div class="g2">
    ${f('Nome da loja','fantasia','placeholder="Ex.: Assistência Silva"','span2')}${f('Razão social','razao')}${f('CNPJ','cnpj','data-mask="cpf" inputmode="numeric"')}
    ${f('WhatsApp','whats','data-mask="tel" inputmode="tel"')}${f('CEP','cep')}${f('Endereço','end','placeholder="Rua, número, loja"','span2')}${f('Bairro','bairro')}${f('Cidade','cidade')}
    ${fld('UF',`<select data-f="d.uf" id="bv-uf">${optV([['','—'],...UFS.map(u=>[u,u])],FORM.d.uf)}</select>`)}
  </div></div>`,`<span class="form-err" id="bvErr"></span><button class="btn" data-act="closeModal">Depois</button><button class="btn pri" data-act="onBoasVindasOk">${ic('check')}Salvar e começar</button>`);
  setTimeout(()=>{const e=$('#bv-fantasia');if(e)e.focus()},50);
}
ACT.onBoasVindasOk=()=>{const d=FORM&&FORM.kind==='boasvindas'?FORM.d:null;if(!d)return;
  if(!String(d.fantasia||'').trim()){$('#bvErr').textContent='Informe o nome da loja.';return}
  Object.keys(d).forEach(k=>DB.loja[k]=String(d[k]||'').trim());DB.loja.cuf=CUF[DB.loja.uf]||0;save();closeModal();route();
  toast('Pronto! Agora cadastre a equipe em Funcionários e envie a logo em Configurações.')};

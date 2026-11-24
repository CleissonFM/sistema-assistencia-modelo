// "Servidor" do Supabase de mentira, com as mesmas regras do banco.sql
module.exports=function(){
  const S={users:{'admin@loja.app':{id:'u0',pw:'admin123'}},tokens:{},perfis:[
    {usuario:'admin',nome:'Administrador Teste',papel:'dono',funcionario_id:'f0',user_id:'u0',ativo:true,criado:'1'}],
    reg:new Map(),pages:new Set(),log:[]};
  let n=0;const uid=()=>'u'+(++n);
  const papel=u=>{const p=S.perfis.find(p=>p.user_id===u&&p.ativo);return p?p.papel:null};
  const LER_DONO=['procedencias','gastos'],ESC_DONO=['config','funcionarios','metas','comPagas','pagamentosCom'];
  const apar=r=>r&&r.dados&&r.dados.categoria==='Compra de aparelho';
  const podeLer=(u,c,r)=>papel(u)==='dono'||(papel(u)&&!LER_DONO.includes(c))||(papel(u)==='vendedor'&&c==='gastos'&&!apar(r));
  const podeCriar=(u,c)=>papel(u)==='dono'||(papel(u)&&!ESC_DONO.includes(c));
  const podeAlterar=(u,c,r)=>papel(u)==='dono'||(papel(u)&&!ESC_DONO.includes(c)&&!LER_DONO.includes(c))||(papel(u)==='vendedor'&&c==='gastos'&&!apar(r));
  async function emitir(p,skipPage){for(const pg of S.pages){if(pg===skipPage)continue;const u=pg.__uid;const rr=p.new&&p.new.colecao?p.new:p.old;if(!u||!podeLer(u,rr.colecao,p.new&&p.new.colecao?p.new:S.reg.get(rr.colecao+'|'+rr.id)))continue;await pg.evaluate(x=>window.__rt&&window.__rt(x),p).catch(()=>{})}}
  async function handle(raw,page){
    const o=JSON.parse(raw),u=S.tokens[o.token]||null;page.__uid=u;
    const err=m=>({data:null,error:{message:m}});
    if(o.kind==='whoami')return {uid:u};
    if(o.kind==='signin'){const x=S.users[o.email];if(!x||x.pw!==o.password)return {error:{message:'Invalid login credentials'}};const t='t'+Math.random();S.tokens[t]=x.id;page.__uid=x.id;return {token:t,uid:x.id}}
    if(o.kind==='signup'){if(S.users[o.email])return {error:{message:'User already registered'}};if(o.password.length<6)return {error:{message:'Password should be at least 6 characters.'}};const us=o.email.split('@')[0];const p=S.perfis.find(p=>p.usuario===us&&!p.user_id&&p.ativo);if(!p)return {error:{message:'Database error saving new user'}};const id=uid();S.users[o.email]={id,pw:o.password};p.user_id=id;const t='t'+Math.random();S.tokens[t]=id;page.__uid=id;return {token:t,uid:id}}
    if(o.kind==='st_up'){if(!['dono','vendedor'].includes(papel(u)))return {error:{message:'new row violates row-level security policy'}};S.files=S.files||{};S.files[o.path]=o.data;return {data:{path:o.path},error:null}}
    if(o.kind==='st_url'){if(!['dono','vendedor'].includes(papel(u))||!(S.files||{})[o.path])return {data:null,error:{message:'Object not found'}};return {data:{signedUrl:S.files[o.path]},error:null}}
    if(o.kind==='rpc'){const a=o.args,ok={data:null,error:null},me=S.perfis.find(p=>p.user_id===u);
      if(o.fn==='criar_usuario'){if(papel(u)!=='dono')return err('Só o administrador pode criar usuários.');if(!['tecnico','vendedor'].includes(a.p))return err('Função inválida.');const us=String(a.u).trim().toLowerCase();if(S.perfis.some(p=>p.usuario===us))return err('Esse usuário já existe.');if(!/^[a-z0-9._-]{2,30}$/.test(us))return err('Usuário inválido: use só letras minúsculas e números, sem espaço.');if(String(a.senha).length<6)return err('A senha precisa ter pelo menos 6 caracteres.');const id=uid();S.users[us+'@loja.app']={id,pw:a.senha};S.perfis.push({usuario:us,nome:a.n,papel:a.p,funcionario_id:a.f||null,user_id:id,ativo:true,criado:String(Date.now())});return ok}
      if(o.fn==='trocar_senha'){const p=S.perfis.find(p=>p.usuario===a.u);if(!p)return err('Usuário não encontrado.');if(papel(u)!=='dono'&&p.user_id!==u)return err('Você só pode trocar a sua própria senha.');for(const e in S.users)if(S.users[e].id===p.user_id)S.users[e].pw=a.senha;return ok}
      if(o.fn==='apagar_usuario'){if(papel(u)!=='dono')return err('Só o administrador pode apagar usuários.');const p=S.perfis.find(p=>p.usuario===a.u);if(p&&p.user_id===u)return err('Você não pode apagar o seu próprio usuário.');S.perfis=S.perfis.filter(x=>x!==p);if(p)for(const e in S.users)if(S.users[e].id===p.user_id)delete S.users[e];return ok}
      return err('rpc desconhecida')}
    const q=o.q;if(!u)return err('JWT expired');
    const f=(rows)=>rows.filter(r=>q.filters.every(([op,c,v])=>op==='eq'?r[c]===v:v.includes(r[c])));
    if(q.table==='perfis'){
      if(q.op==='select'){const r=f(S.perfis);return {data:q.single?(r[0]||null):r,error:null}}
      if(papel(u)!=='dono')return {data:null,error:null};
      if(q.op==='insert'){for(const r of q.rows){if(S.perfis.some(p=>p.usuario===r.usuario))return err('duplicate key value violates unique constraint');S.perfis.push({ativo:true,user_id:null,criado:String(Date.now()),...r})}return {data:null,error:null}}
      if(q.op==='update'){f(S.perfis).forEach(p=>Object.assign(p,q.values));return {data:null,error:null}}
    }
    if(q.table==='registros'){
      if(q.op==='select'){const all=[...S.reg.values()].filter(r=>podeLer(u,r.colecao,r)).sort((a,b)=>a.colecao.localeCompare(b.colecao)||a.id.localeCompare(b.id));const [a,z]=q.range||[0,1e9];return {data:all.slice(a,z+1).map(r=>({colecao:r.colecao,id:r.id,dados:JSON.parse(JSON.stringify(r.dados))})),error:null}}
      if(q.op==='upsert'){
        for(const r of q.rows){const k=r.colecao+'|'+r.id,ex=S.reg.get(k);
          if(ex){if(q.opts.ignoreDuplicates)continue;if(!podeAlterar(u,r.colecao,ex)||!podeAlterar(u,r.colecao,r))return err('new row violates row-level security policy for table "registros"')}
          else if(!podeCriar(u,r.colecao))return err('new row violates row-level security policy for table "registros"')}
        for(const r of q.rows){const k=r.colecao+'|'+r.id;if(S.reg.has(k)&&q.opts.ignoreDuplicates)continue;const ev=S.reg.has(k)?'UPDATE':'INSERT';S.reg.set(k,{...r,atualizado_por:r.atualizado_por||u});S.log.push(ev+' '+k);await emitir({eventType:ev,new:S.reg.get(k),old:{}},null)}
        return {data:null,error:null}}
      if(q.op==='delete'){if(papel(u)!=='dono')return {data:null,error:null};for(const r of f([...S.reg.values()])){S.reg.delete(r.colecao+'|'+r.id);S.log.push('DELETE '+r.colecao+'|'+r.id);await emitir({eventType:'DELETE',new:{},old:{colecao:r.colecao,id:r.id}},null)}return {data:null,error:null}}
    }
    return err('op desconhecida');
  }
  return {S,async ligar(page){S.pages.add(page);await page.exposeFunction('__sbCall',raw=>handle(raw,page).then(r=>JSON.stringify(r)));
    await page.route('**/supabase-js@*/**',r=>r.fulfill({contentType:'application/javascript',body:require('fs').readFileSync(__dirname+'/mock_supabase.js','utf8')}))}};
};

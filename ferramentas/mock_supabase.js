// Supabase de mentira para os testes: o "servidor" fica no Node (window.__sbCall)
window.supabase={createClient(){
  const call=(op)=>window.__sbCall(JSON.stringify({...op,token:localStorage.getItem('mock-token')})).then(r=>JSON.parse(r));
  const subs=[];window.__rt=p=>subs.forEach(f=>f(p));
  function qb(table){
    const q={table,op:'select',filters:[],opts:{}};
    const b={
      select(c){if(q.op==='select')q.op='select';return b},
      order(){return b},range(a,z){q.range=[a,z];return b},
      eq(c,v){q.filters.push(['eq',c,v]);return b},in(c,v){q.filters.push(['in',c,v]);return b},
      maybeSingle(){q.single=true;return b},
      insert(v){q.op='insert';q.rows=Array.isArray(v)?v:[v];return b},
      upsert(v,o){q.op='upsert';q.rows=v;q.opts=o||{};return b},
      update(v){q.op='update';q.values=v;return b},
      delete(){q.op='delete';return b},
      then(res,rej){return call({kind:'q',q}).then(res,rej)}
    };return b}
  const authSubs=[];
  return {
    from:qb,
    rpc:(fn,args)=>call({kind:'rpc',fn,args}),
    storage:{from(){return {async upload(path,blob,opts){const data=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob)});return call({kind:'st_up',path,data})},async createSignedUrl(path){return call({kind:'st_url',path})}}}},
    channel(){const ch={on(_e,_f,cb){subs.push(cb);return ch},subscribe(cb){cb&&cb('SUBSCRIBED');return ch}};return ch},
    auth:{
      async getSession(){const t=localStorage.getItem('mock-token');if(!t)return {data:{session:null}};const r=await call({kind:'whoami'});return {data:{session:r.uid?{user:{id:r.uid}}:null}}},
      async signInWithPassword({email,password}){const r=await call({kind:'signin',email,password});if(r.error)return {data:{},error:r.error};localStorage.setItem('mock-token',r.token);return {data:{session:{user:{id:r.uid}}},error:null}},
      async signUp({email,password}){const r=await call({kind:'signup',email,password});if(r.error)return {data:{},error:r.error};localStorage.setItem('mock-token',r.token);return {data:{session:{user:{id:r.uid}}},error:null}},
      async signOut(){localStorage.removeItem('mock-token');authSubs.forEach(f=>f('SIGNED_OUT'));return {error:null}},
      onAuthStateChange(f){authSubs.push(f);return {data:{subscription:{unsubscribe(){}}}}},
      async refreshSession(){return {}}
    }
  };
}};

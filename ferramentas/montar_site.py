import sys, re, os
import pathlib
R=pathlib.Path(__file__).resolve().parent.parent  # pasta do projeto
D=str(R)+'/'
SB_URL='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js'
s=open(D+'fonte/sistema.html',encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    n=s.count(old)
    if n!=count: sys.exit(f'anchor count {n}!={count}: {old[:110]!r}')
    s=s.replace(old,new)

css='''
/* Versão online */
.login{position:fixed;inset:0;z-index:100;background:var(--bg);display:grid;place-items:center;padding:16px;overflow:auto}
.lg-card{width:min(400px,100%);background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:28px;display:flex;flex-direction:column;gap:16px}
.lg-brand{padding:0}
.lg-brand b{color:var(--fg)}
.lg-card h1{font-size:22px}
.lg-go{height:44px;width:100%}
.lg-wait{flex-direction:row;align-items:center;justify-content:center;color:var(--muted)}
#lgModo{align-self:center}
.on-user{display:flex;flex-direction:column;color:var(--rail-hi)}
.on-user b{font-weight:600}
.on-user span{color:var(--muted);font-size:12px}
.on-sync{font-size:12px;display:inline-flex;align-items:center;gap:6px}
.on-sync::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--ok)}
.on-sync.salvando::before{background:var(--warn)}
.on-sync.erro{color:var(--bad);font-weight:500}
.on-sync.erro::before{background:var(--bad)}
.side-foot .btn{align-self:flex-start;margin-top:6px}
body.nao-dono [data-act="comPagar"],body.nao-dono .ph [data-act="formMeta"]{display:none!important}
body.nao-dono .meta{pointer-events:none}
body.nao-dono [data-act="delGasto"]{display:none!important}
body.papel-tecnico [data-top="venda"]{display:none!important}
'''
rep('/* Adaptação à largura disponível */', css+'\n/* Adaptação à largura disponível */')
rep("function route(){\n","function route(){if(!DB||!ON.perfil||!LAY)return;\n")
rep("<title>Sistema da loja</title>","<title>Sistema da loja</title>")
rep("function save(){try{localStorage.setItem(KEY,JSON.stringify(DB))}catch(e){}}","function save(){if(ON.mudo||!ON.perfil)return;onAgendar()}")
init="load();CART=novoCarrinho();LAY=loadLay();$('#ai').innerHTML=aiShellHTML();$('#pz').innerHTML=pzShellHTML();applyLayout();route();"
rep(init, open(D+'fonte/online.js',encoding='utf-8').read()+"\nonIniciar();")
# a biblioteca do Supabase antes do sistema
i=s.index('<script>\n/* ========== Utilidades')
s=s[:i]+f'<script src="config.js"></script>\n<script src="{SB_URL}"></script>\n<script>window.claude={{use:function(n){{return Promise.resolve(n==="sample"?onSampleShim():null)}}}};</script>\n'+s[i:]
os.makedirs(D+'site-pronto',exist_ok=True)
ICON=open(D+'fonte/icone.b64').read().strip()
doc='<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="apple-mobile-web-app-title" content="Sistema da loja"><meta name="theme-color" content="#141821"><link rel="icon" type="image/png" href="data:image/png;base64,'+ICON+'"><link rel="apple-touch-icon" href="data:image/png;base64,'+ICON+'"></head><body>\n'+s+'\n</body></html>\n'
open(D+'site-pronto/index.html','w',encoding='utf-8').write(doc)
import zipfile
import shutil
if not os.path.exists(D+'site-pronto/config.js'): shutil.copy(D+'fonte/config.exemplo.js',D+'site-pronto/config.js')
with zipfile.ZipFile(D+'site-pronto/site.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.write(D+'site-pronto/index.html','index.html'); z.write(D+'site-pronto/config.js','config.js')
print('site pronto:',D+'site-pronto/site.zip')

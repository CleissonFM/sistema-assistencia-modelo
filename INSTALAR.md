# Como instalar o sistema na sua loja

Passo a passo para quem nunca mexeu com isso. Leva uns 30 minutos. Tudo é gratuito (o assistente de IA é opcional e pago por uso).

**Você vai precisar de:**
- uma conta no **Supabase** (banco de dados e login): https://supabase.com
- uma conta na **Cloudflare** (deixa o site no ar): https://dash.cloudflare.com — ou qualquer hospedagem de site (Hostinger, por exemplo)
- os arquivos deste pacote

---

## Passo 1 · Criar o banco de dados

1. Entre em https://supabase.com/dashboard e clique em **New project**.
2. Preencha:
   - **Name:** o nome da sua loja (ex.: `assistencia-silva`)
   - **Database Password:** clique em **Generate a password** e guarde
   - **Region:** **South America (São Paulo)**
3. Clique em **Create new project** e espere uns 2 minutos.
4. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
5. Abra o arquivo `banco/instalar-do-zero.sql` (no Bloco de Notas ou TextEdit), copie tudo e cole no Supabase.
6. **No fim do texto**, preencha as 3 linhas do administrador (quem vai cuidar do sistema):
   ```sql
   usuario text := 'joao';          -- uma palavra, minúscula, sem espaço nem acento
   nome    text := 'João Silva';    -- como aparece no sistema
   senha   text := 'suaSenha123';   -- mínimo 6 caracteres
   ```
7. Clique em **Run**. Deve aparecer **Success**.

> Se aparecer "Preencha usuário, nome e senha", é só fazer o item 6 e rodar de novo.

## Passo 2 · Pegar o endereço e a chave do banco

1. No Supabase, clique na engrenagem **Project Settings**.
2. Em **Data API**, copie a **Project URL** (ex.: `https://abcdefgh.supabase.co`).
3. Em **API Keys**, copie a chave **Publishable** (começa com `sb_publishable_`).
   ⚠️ **Nunca** use a chave **Secret**.

## Passo 3 · Ligar o site ao seu banco

1. Abra a pasta `site-pronto`. Ela tem dois arquivos: `index.html` (o sistema) e `config.js` (a configuração).
2. Abra o `config.js` no Bloco de Notas ou TextEdit e troque as duas linhas:
   ```js
   window.SISTEMA_CONFIG = {
     supabaseUrl: 'https://abcdefgh.supabase.co',        // a Project URL do passo 2
     supabaseChavePublica: 'sb_publishable_xxxxxxxx'     // a chave Publishable do passo 2
   };
   ```
3. Salve.

## Passo 4 · Colocar o site no ar

**Pela Cloudflare (grátis):**
1. Junte os dois arquivos (`index.html` e `config.js`) num arquivo `.zip`: selecione os dois, clique com o botão direito e escolha **Comprimir** (Mac) ou **Enviar para › Pasta compactada** (Windows).
2. Entre em https://dash.cloudflare.com › **Workers & Pages** › **Create** › **Upload your static files**.
3. Dê um nome, envie o `.zip` e clique em **Deploy**.
4. No fim aparece o endereço do seu sistema (ex.: `https://assistencia-silva.SEUNOME.workers.dev`).

**Pela Hostinger ou outra hospedagem:**
1. Abra o **Gerenciador de Arquivos**, entre em `public_html` (ou na pasta do subdomínio).
2. Envie o `index.html` e o `config.js`.
3. Confirme que o **SSL (https)** está ativo.

## Passo 5 · Primeiro acesso

1. Abra o endereço do sistema e entre com o **usuário e a senha do passo 1**.
2. Vai aparecer **"Bem-vindo! Vamos configurar a sua loja"**: preencha nome da loja, CNPJ, WhatsApp e endereço, e clique em **Salvar e começar**.
3. Em **Configurações › Logo da loja**, envie a sua logo.
4. Em **Funcionários**:
   - **Novo funcionário:** cadastre cada pessoa com a comissão dela (por serviço e/ou por venda).
   - **Usuários do sistema › Novo usuário:** crie o acesso de cada um (usuário, senha, função **Técnico** ou **Vendedor(a)**, e o funcionário ligado).
5. Passe o endereço, o usuário e a senha para cada pessoa da equipe.

Pronto: o sistema está funcionando.

---

## Opcional · Assistente de IA

Permite perguntar coisas sobre a loja em português ("quais OS estão atrasadas?"). É pago por uso, direto para a Anthropic, e custa centavos por pergunta no modo Rápido.

1. Crie uma conta em https://platform.claude.com, coloque crédito (**Billing**, mínimo US$ 5) e, se quiser, um limite mensal (**Limits**).
2. **API Keys › Create Key** › "Em outro lugar" › copie a chave (`sk-ant-...`).
3. No Supabase: **Edge Functions › Secrets** › Name `ANTHROPIC_API_KEY`, Value = a chave › **Save**.
4. No Supabase: **Edge Functions › Deploy a new function › Via Editor** › nome `assistente` › cole o conteúdo de `supabase-funcao/assistente.ts` › **Deploy function**.
5. Na página da função, desligue **Verify JWT** e salve.

---

## Dia a dia
- **Cópia de segurança:** toda semana, em Configurações › **Baixar cópia dos dados**. O plano grátis do Supabase não faz cópia sozinho.
- O banco grátis **pausa após 7 dias sem uso**. Se acontecer, entre no painel do Supabase e clique em **Restore**.
- **Esqueceu a senha?** O administrador troca em Funcionários › Usuários do sistema. A senha do próprio administrador pode ser redefinida rodando de novo o fim do `instalar-do-zero.sql` com a senha nova.

## Problemas comuns
| Aparece | O que fazer |
|---|---|
| "Falta configurar o arquivo config.js" | Faça o passo 3 e envie o `config.js` junto com o `index.html` |
| "Usuário ou senha incorretos" | Confira o usuário (uma palavra, minúscula) e a senha do passo 1 |
| "Não foi possível carregar os dados" | Confira a Project URL e a chave Publishable no `config.js` |
| Assistente: "ainda não foi instalado" | Faça o item 4 do Assistente de IA (o nome da função tem que ser `assistente`) |
| Comprovantes: "Falta criar o espaço de comprovantes" | Rode de novo o `banco/instalar-do-zero.sql` |

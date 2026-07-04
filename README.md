# Legno Portal Web

Portal para clientes montarem estimativas de módulos (com preço calculado
automaticamente por medida e cor) e, futuramente, subirem listas de peças de
corte avulsas.

## Como funciona

- Um **módulo pai** é a unidade que o cliente configura (ex: "Armário 2
  Portas"). Ele tem um range de largura/altura/profundidade que o cliente
  pode escolher, e uma lista de **cores disponíveis**.
- Cada módulo é composto por **peças (componentes)**: laterais, tampo, portas
  etc. Cada peça tem fórmulas de dimensão baseadas nas medidas do módulo pai
  (`W`, `H`, `D`), uma fórmula de área de chapa (m²), uma fórmula de metro
  linear de fita de borda, e um custo de mão de obra por unidade.
- **O preço do módulo pai é a soma do cálculo de todas as suas peças**,
  considerando a cor escolhida (cada cor tem seu próprio preço de chapa e de
  fita).
- **O cliente só vê o preço final do módulo pai** — o detalhamento por peça
  (breakdown) fica disponível apenas no painel admin, para conferência.

## Estrutura do projeto

```
database/schema.sql   Schema Supabase (tabelas + RLS policies)
js/pricing.js         Motor de cálculo (avaliador de fórmulas + soma de peças)
js/config.js          Credenciais do Supabase (preencher)
js/admin.js           Lógica do painel admin
js/client.js          Lógica da calculadora do cliente
admin.html            Painel para você configurar módulos, peças e cores
index.html            Página que o cliente usa para montar a estimativa
css/style.css         Estilo compartilhado
```

## Setup

1. **Crie um projeto no Supabase** (supabase.com).
2. Abra o **SQL Editor** do projeto e rode o conteúdo de `database/schema.sql`
   inteiro.
3. Em **Project Settings → API**, copie a `Project URL` e a chave `anon
   public`, e cole em `js/config.js`:
   ```js
   const SUPABASE_URL = 'https://xxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';
   ```
4. Abra `admin.html` num navegador (ou publique via GitHub Pages/Netlify/
   Vercel) e cadastre suas cores, módulos e peças.
5. Abra `index.html` para testar a calculadora do cliente.

## Segurança — importante antes de publicar

O schema vem com RLS (Row Level Security) ligado e **sem policy de escrita**
para `modules`, `module_pieces`, `colors` e `module_colors`. Isso significa
que, por padrão, **ninguém consegue alterar preços/configurações** pelo site
público — inclusive `admin.html`, até você:

1. Criar um usuário administrador no **Supabase Auth**.
2. Adicionar as policies de escrita comentadas no final de
   `database/schema.sql` (restritas a `auth.role() = 'authenticated'`).
3. Adicionar um login (Supabase Auth) em `admin.html` antes de publicá-lo,
   ou mantê-lo fora do domínio público / atrás de senha do próprio host.

A tabela `quotes` aceita `insert` público (para o cliente enviar
orçamentos), mas não aceita leitura pública — só você, autenticado, deve
conseguir ler os orçamentos recebidos.

## Publicar no GitHub

Esta pasta já está pronta para virar um repositório:

```bash
cd "LEGNO PORTAL WEB"
git init
git add .
git commit -m "Setup inicial: schema + motor de cálculo + admin + calculadora"
git branch -M main
git remote add origin <url-do-seu-repositorio>
git push -u origin main
```

(A automação aqui não tem acesso à sua conta do GitHub para fazer o push
diretamente — esses comandos você roda localmente.)

## O que falta (próximas etapas)

- Autenticação do painel admin (Supabase Auth).
- Upload de lista de peças de corte avulsas pelo cliente (funcionalidade
  separada da estimativa por módulo, mencionada no escopo original).
- Visualização 3D do módulo configurado.
- Checklist e tela de confirmação de pedido.
- Deploy (GitHub Pages, Netlify ou Vercel).

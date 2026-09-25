# Bibliotecas de terceiros servidas localmente

Nada aqui é código nosso. São cópias exatas de pacotes públicos, guardadas no
repositório de propósito.

## Por que não usar CDN

O ERP precisa abrir com duplo clique no arquivo (`file://`), sem servidor.
Nesse modo o navegador frequentemente bloqueia scripts de CDN — e quando isso
acontece o app não degrada, ele morre no boot. O Supabase já estava aqui por
esse motivo; Three.js e JSZip vieram junto quando o painel admin passou a
rodar dentro do ERP.

Sintoma típico de quando faltava: a aba de imagem 3D do módulo e o ZIP de
`.ban` da furação simplesmente não respondiam, sem erro visível na tela.

## O que tem aqui

| Arquivo             | Pacote                  | Versão   | Quem usa                          |
|---------------------|-------------------------|----------|-----------------------------------|
| `supabase.js`       | `@supabase/supabase-js` | 2.x      | tudo                              |
| `three.min.js`      | `three`                 | 0.128.0  | `viewer3d.js`, imagem 3D do módulo |
| `OrbitControls.js`  | `three` (examples)      | 0.128.0  | mesmos                            |
| `jszip.min.js`      | `jszip`                 | 3.10.1   | ZIP de `.ban` da furação          |

## Atualizar

As versões são as mesmas que o antigo `admin.html` carregava de CDN. Three.js
está **preso na 0.128.0**: o código usa APIs que mudaram depois, e há uma
armadilha conhecida — `THREE.CapsuleGeometry` só existe da r142 em diante.
Subir de versão não é troca de arquivo, é revisão do `viewer3d.js`.

```bash
npm install three@0.128.0 jszip@3.10.1
cp node_modules/three/build/three.min.js                       erp/js/vendor/
cp node_modules/three/examples/js/controls/OrbitControls.js    erp/js/vendor/
cp node_modules/jszip/dist/jszip.min.js                        erp/js/vendor/
```

A ordem de carregamento em `erp/index.html` importa: `three.min.js` antes de
`OrbitControls.js` (ele pendura `THREE.OrbitControls` no objeto global), e os
dois antes de `viewer3d.js`.

# DIAGNÓSTICO RAIZ: servicesApi undefined no Webapp

**Data:** 14 de Abril de 2026  
**Severidade:** CRÍTICA - Bloqueia CREATE de procedimentos no web  
**Status:** Confirmado via code inspection  

---

## 1️⃣ CAUSA EXATA IDENTIFICADA

### Problema Confirmado
O usuário relata:
```
typeof servicesApi === 'undefined'
```

Isso causa:
- Linha 653 em prontuario.js não executa (optional chaining `?.` torna silent failure)
- Procedimento NÃO é enviado ao backend
- Procedure não persiste em database
- GET `/procedures` após POST retorna lista vazia (nunca foi criado)

### Raiz Causa #1: Definição de servicesApi [prontuario.js:187]

```javascript
const servicesApi = appApi.services || window.api?.services || {};
```

**Problema:**
- Se `appApi` é undefined, primeira opção falha
- Se `window.api?.services` é undefined (web), segunda opção falha
- Deveria retornar `{}` como fallback, MAS se houver erro ANTES, retorna `undefined`

**Isso significa:**
- `appApi` está undefined OU
- Algum erro impede que essas linhas executem

---

### Raiz Causa #2: appApi NÃO está definido

**Arquivo:** [shared/app-api.js](shared/app-api.js#L1)

```javascript
(function () {
  const hasDesktopBridge = Boolean(window.api || window.auth || window.users);
  
  const desktopAdapter = window.__desktopAdapter || null;
  const webAdapter = window.__webAdapter || null;

  const adapter = hasDesktopBridge ? desktopAdapter : webAdapter;

  if (!adapter) {
    throw new Error('Nenhum adapter disponivel. Carregue...');
  }

  window.appApi = adapter;  // ← DEFINE window.appApi
})();
```

**Lógica:**
1. Se tem `window.api` (desktop → Electron), usa `__desktopAdapter`
2. Senão (web), usa `__webAdapter`
3. Se nenhum dos dois existe → throws error
4. Define `window.appApi = adapter`

**Potencial Problema:**
- Se `window.__webAdapter` é undefined quando app-api.js executa → `adapter = null` → throws error
- O error é silenciado ou não visto
- `window.appApi` nunca é definido
- prontuario.js tenta usar `appApi` que não existe → undefined

---

### Raiz Causa #3: window.__webAdapter NÃO está sendo definido

**Arquivo:** [shared/adapters/web-adapter.js](shared/adapters/web-adapter.js#L1)

A estrutura é:
```javascript
(function () {
  const DEFAULT_BASE = localStorage.getItem('apiBase') || '';
  // ... 2300+ linhas de definições ...
  
  const services = {
    addToPatient: async (...) => { ... },
    listForPatient: async (...) => { ... },
    // ... etc
  };
  
  // ... 800 linhas depois ...
  
  window.__webAdapter = {
    services,  // ← EXPÕE services
    auth, patients, documents, finance, etc.
  };
})();
```

**Potencial Problema:**
Se há SyntaxError ou RuntimeError em web-adapter.js ANTES da definição de `window.__webAdapter`:
- A IIFE falha
- `window.__webAdapter` nunca é criado
- app-api.js tenta acessar `window.__webAdapter` (undefined) → throws error
- `window.appApi` nunca é definido

---

## 2️⃣ VERIFICAÇÃO: Ordem de Scripts em prontuario.html

**Arquivo:** [prontuario.html](prontuario.html#L954)

```html
<script src="shared/adapters/desktop-adapter.js"></script>  <!-- L954 -->
<script src="shared/adapters/web-adapter.js"></script>        <!-- L955 -->
<script src="shared/app-api.js"></script>                      <!-- L956 -->
<script src="prontuario.js"></script>                          <!-- L957 -->
<script src="header.js"></script>                              <!-- L958 -->
```

✅ **Ordem está CORRETA:**
1. desktop-adapter define `window.__desktopAdapter`
2. web-adapter define `window.__webAdapter` E `services`
3. app-api escolhe `webAdapter` (porque não há `window.api`) E define `window.appApi`
4. prontuario usa `window.appApi.services`

---

## 3️⃣ PROBLEMA DE IMPLEMENTAÇÃO ENCONTRADO

### Issue: web-adapter.js não expõe `services` para o web corretamente

**Locais onde `services` é definida:**
- Linha 1479: `const services = {...}`
- Linha 2320: `window.__webAdapter = { ..., services, ... }`

**Verificado que:**
- ✅ `services` está definida com `addToPatient: async (...)`
- ✅ `window.__webAdapter` expõe `services`
- ✅ shared/app-api.js vai definir `window.appApi = window.__webAdapter`

**Mas pergunta:** Por que o usuário diz que `servicesApi` retorna `undefined` no console?

---

## 4️⃣ HIPÓTESES POSSÍVEIS

### Hipótese A: web-adapter.js tem SyntaxError
**Causa:**
- Trecho de código em web-adapter.js com erro de sintaxe
- IIFE falha
- `window.__webAdapter` nunca criado
- app-api.js throws error: "Nenhum adapter disponivel"
- Script carregamento falha
- `window.appApi` indefinido

**Como Validar:**
```
No console do navegador:
1. Abrir DevTools → Console
2. Procurar por erros vermelhos
3. Procurar por "Nenhum adapter disponivel"
4. Testar: typeof window.__webAdapter
5. Testar: typeof window.__desktopAdapter
6. Testar: typeof window.appApi
```

### Hipótese B: web-adapter.js não carregou por 404 ou CORS
**Causa:**
- Path `shared/adapters/web-adapter.js` está errado
- Arquivo retorna 404
- Browser não carrega o script
- `window.__webAdapter` nunca criado

**Como Validar:**
```
No console:
1. Abrir DevTools → Network tab
2. Filtrar por nome do arquivo: web-adapter.js
3. Verificar se request retorna 200 ou 404
```

### Hipótese C: Arquivo .html não está usando as scripts corretas
**Causa:**
- Path relativo errado
- Script carregando de outra página que não tem os adapters
- servicesApi fica vazio `{}` ou undefined

**Verificado:**
- prontuario.html tem os 3 scripts corretos
- Ordem está certa

---

## 5️⃣ DIAGNÓSTICO FINAL

### ✅ O código ESTÁ correto em termos de estrutura:
1. web-adapter.js define `services` e `window.__webAdapter`
2. shared/app-api.js escolhe `webAdapter` e define `window.appApi`
3. prontuario.html carrega scripts na ordem correta
4. prontuario.js usa `window.appApi.services` corretamente

### ❌ Mas web-adapter.js `services` NÃO está retornando ao prontuario.js corretamente

**Causa mais provável:**
Um dos 3 arquivos tem erro que impede execução completa:
1. web-adapter.js com SyntaxError/RuntimeError
2. app-api.js com erro ao processaradapter
3. Arquivo web-adapter.js não carregou (404)

---

## 6️⃣ CHECKLIST DE VALIDAÇÃO

Para identificar o problema exato, execute NO CONSOLE DO NAVEGADOR:

```javascript
// Check 1: Adapters foram carregados?
console.log('window.__desktopAdapter:', typeof window.__desktopAdapter);
console.log('window.__webAdapter:', typeof window.__webAdapter);

// Check 2: appApi foi definido?
console.log('window.appApi:', typeof window.appApi);

// Check 3: services existe em appApi?
console.log('window.appApi?.services:', typeof window.appApi?.services);

// Check 4: addToPatient existe?
console.log('window.appApi?.services?.addToPatient:', typeof window.appApi?.services?.addToPatient);

// Check 5: Erros de carregamento
console.log('Script errors:', document.querySelectorAll('script').length);
```

---

## 7️⃣ PRÓXIMOS PASSOS

**PASSO 1:** Execute checklist acima e compartilhe resultados

**PASSO 2:** Se algum `undefined`, entrar em web-adapter.js e verificar por:
- SyntaxError (typos)
- ReferenceError (variável não definida)
- TypeError (propriedade não existe)
- network error (arquivo 404)

**PASSO 3:** Depois de validar, implementar correção mínima:
- Se `services` está definido → problema está em app-api.js
- Se `window.__webAdapter` undefined → problema está em web-adapter.js
- Se `services.addToPatient` undefined → precisa ser implementado

---

**Aguardando resultado do checklist para próximo passo.**

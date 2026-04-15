# 🔍 SCRIPT DE DIAGNÓSTICO: Validar Carregamento de Adapters

**Data:** 14 de Abril de 2026  
**Objetivo:** Validar se web-adapter.js, app-api.js estão carregando corretamente  
**Tipo:** JavaScript pronto para colar no DevTools Console  
**Segurança:** Read-only, sem modificações no sistema  

---

## 📋 Como Usar

### Passo 1: Abrir DevTools
```
Navegador (webapp Voithos)
  → Pressionar: F12 ou CTRL+SHIFT+I
  → Ir para aba: Console
```

### Passo 2: Copiar e Colar o Script
```
1. Abrir arquivo: SCRIPT-DIAGNOSTICO-ADAPTERS.js
2. Selecionar TODO o conteúdo (CTRL+A)
3. Copiar (CTRL+C)
4. Colar no Console do navegador (CTRL+V)
5. Pressionar ENTER
```

### Passo 3: Analisar Saída
O script vai exibir:
- ✅ Tudo em verde = sucesso
- ❌ Tudo em vermelho = falha crítica
- ⚠️ Em amarelo = aviso

---

## 🎯 O que o Script Verifica

### 1. **Scripts Carregados**
Lista TODOS os `<script>` tags na página

### 2. **Adapters Específicos**
Procura por:
- `web-adapter.js` ✅
- `app-api.js` ✅
- `desktop-adapter.js` ✅

### 3. **Objetos Globais**
Valida se existem:
- `window.__desktopAdapter` (Electron)
- `window.__webAdapter` (Web)
- `window.appApi` (Seletor)

### 4. **Services Disponível**
Verifica se existe:
- `window.appApi.services` ✅
- `window.appApi.services.addToPatient` ✅

### 5. **Ambiente**
Valida:
- `localStorage.apiBase` (URL backend web)
- `window.__APP_API_BASE__` (URL backend alternativa)

---

## 📊 Exemplo de Saída

### ✅ CASO SUCESSO (Tudo OK):

```
════════════════════════════════════════════
🔍 DIAGNÓSTICO: Carregamento de Adapters Voithos
════════════════════════════════════════════

📋 PASSO 1: Scripts carregados na página
─────────────────────────────────────────

Total de scripts encontrados: 27

(tabela com todos os scripts)

📌 PASSO 2: Procurando adapters específicos
─────────────────────────────────────────

✅ Encontrados 3 adapter(s):

(tabela com adapters encontrados)

🔗 PASSO 3: Verificação de presença no DOM
─────────────────────────────────────────

desktop-adapter.js: ✅ SIM
web-adapter.js: ✅ SIM
app-api.js: ✅ SIM

🌍 PASSO 4: Objetos globais criados
─────────────────────────────────────────

(tabela mostrando todos ✅)

🔧 PASSO 5: Verificação de appApi.services
─────────────────────────────────────────

✅ window.appApi existe!
   Modo: web
✅ window.appApi.services existe!

   Métodos disponíveis em services:
   - addToPatient: ✅ function
   - listForPatient: ✅ function
   - update: ✅ function
   - delete: ✅ function
   - markDone: ✅ function

📊 DIAGNÓSTICO FINAL
════════════════════

(tabela final com tudo ✅)

💡 RECOMENDAÇÕES:

✅ TUDO OK! window.appApi.services.addToPatient está disponível
   A API está pronta para ser utilizada
```

---

### ❌ CASO FALHA (Crítico):

```
🌍 PASSO 4: Objetos globais criados
─────────────────────────────────────────

❌ window.__webAdapter: NÃO
❌ window.appApi: NÃO

❌ PROBLEMA CRÍTICO: window.appApi não está disponível!

   Possíveis causas:
   1. shared/app-api.js não foi carregado
   2. web-adapter.js ou desktop-adapter.js falharam ao carregar
   3. Há erro de sintaxe em um dos adapters
   4. localStorage ou window.__APP_API_BASE__ não está configurado

   Ações recomendadas:
   • Abrir DevTools → Console e procurar por erro em vermelho
   • Ir para Network → procurar por "adapter" e verificar status HTTP
   • Verificar se localStorage.apiBase ou window.__APP_API_BASE__ estão configurados
```

---

## 🚨 Interpretando os Resultados

### Resultado 1: Todos ✅

**Significado:** Sistema funcionando corretamente  
**Ação:** Feche o console, tudo está OK

---

### Resultado 2: window.__webAdapter e window.appApi = ❌

**Significado:** Scripts carregados, mas não foram executados  
**Causa Provável:**
- Erro de sintaxe em web-adapter.js
- localStorage.getItem() falhando
- Erro não capturado na IIFE

**Ação:**
1. Abrir DevTools → Console
2. Procurar por erro em VERMELHO
3. Se houver erro, compartilhe o texto
4. Se não houver erro, recarregar página e tentar de novo

---

### Resultado 3: Scripts não encontrados (❌ para todos)

**Significado:** Arquivos não estão sendo carregados  
**Causa Provável:**
- Página não tem os `<script>` tags
- Caminho relativo errado (../shared/adapters/...)
- Arquivo deletado ou renomeado

**Ação:**
1. Abrir DevTools → Network tab
2. Procurar por "adapter"
3. Verificar status HTTP (deve ser 200)
4. Se status 404, arquivo não existe no path

---

### Resultado 4: desktop-adapter ✅, web-adapter ❌

**Significado:** Está em Electron (desktop), não web  
**Ação:**
- Este é o modo CORRETO para Electron
- Se quiser testar web, abrir em navegador separado (não Electron)

---

## 🔧 Troubleshooting

### Erro: "ReferenceError: localStorage is not defined"
```
Causa: Sandbox ou restrição de acesso
Solução: Pode ignorar, é apenas um warning
```

### Erro: "Uncaught SyntaxError in web-adapter.js"
```
Causa: Há typo ou código inválido em web-adapter.js
Solução: Procure pela linha do erro no arquivo
```

### Erro: "Nenhum adapter disponivel"
```
Causa: app-api.js não conseguiu carregar nenhum adapter
Solução: Verificar se window.__webAdapter existe
```

---

## 📝 Notas Importantes

1. **O script NÃO modifica nada** - apenas lê informações
2. **O script é seguro** - pode rodar várias vezes
3. **O script usa apenas APIs nativas** - sem bibliotecas externas
4. **Os dados mostrados são do estado atual** - recarregue página para re-testar

---

## 🎯 Próximos Passos

### Se tudo está ✅:
- Feche o console
- Teste a funcionalidade de criar procedimento
- Verifique se request POST aparece em Network tab

### Se algo está ❌:
1. Compartilhe a saída do script
2. Compartilhe o erro vermelho do console (se houver)
3. Compartilhe resultado de Network tab (se solicitado)

---

## 📌 Referência Rápida

```javascript
// Para testar manualmente após diagnóstico bem-sucedido:

// 1. Verificar tipo de adapter
console.log(window.appApi.mode);  // Deve ser: 'web' ou 'desktop'

// 2. Verificar se addToPatient é function
console.log(typeof window.appApi.services.addToPatient);  // Deve ser: 'function'

// 3. Verificar disponibilidade de métodos
console.log(Object.keys(window.appApi.services));  // Lista todos os métodos
```

---

**Script criado: 14 de Abril de 2026**  
**Arquivo: SCRIPT-DIAGNOSTICO-ADAPTERS.js**

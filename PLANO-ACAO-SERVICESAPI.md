# PLANO DE AÇÃO: Corrigir Create de Procedimento no Webapp

**Criado:** 14 de Abril, 2026  
**Versão:** 1.0 - PRONTO PARA IMPLEMENTAÇÃO  
**Estimativa:** ~2 min implementation, ~5 min testing  

---

## 📋 RESUMO DO PROBLEMA

| Aspecto | Valor |
|---------|-------|
| **Sintoma** | `servicesApi undefined` no console web |
| **Efeito** | CREATE procedimento não chama backend |
| **Impacto** | Procedimentos não persistem em `PatientProcedure` |
| **Sistema Afetado** | Webapp Voithos (desktop Electron OK) |
| **Causa Raiz** | `window.appApi.services` não exposto ou erro de inicialização |
| **Risco de Quebra** | ZERO (correção é aditiva, não destrutiva) |

---

## 🔍 VALIDAÇÃO PRÉ-IMPLEMENTAÇÃO

Antes de corrigir, execute NO CONSOLE do navegador webapp:

```javascript
// TESTE 1: Validar adapters carregados
console.log('1. __desktopAdapter loaded:', typeof window.__desktopAdapter !== 'undefined');
console.log('2. __webAdapter loaded:', typeof window.__webAdapter !== 'undefined');
console.log('3. appApi defined:', typeof window.appApi !== 'undefined');

// TESTE 2: Validar services disponível
console.log('4. appApi.services exists:', typeof window.appApi?.services !== 'undefined');
console.log('5. addToPatient exists:', typeof window.appApi?.services?.addToPatient !== 'undefined');

// TESTE 3: Debug detalhado
if (!window.appApi) {
  console.error('❌ FALHA: window.appApi não foi definido');
  console.log('   → Verifique: window.__webAdapter =', typeof window.__webAdapter);
  console.log('   → Verifique: window.__desktopAdapter =', typeof window.__desktopAdapter);
} else if (!window.appApi.services) {
  console.error('❌ FALHA: window.appApi.services não existe');
  console.log('   → Tipo de appApi:', typeof window.appApi);
  console.log('   → appApi.mode:', window.appApi.mode);
} else if (!window.appApi.services.addToPatient) {
  console.error('❌ FALHA: addToPatient não existe em services');
  console.log('   → Services disponíveis:', Object.keys(window.appApi.services));
} else {
  console.log('✅ TUDO OK: servicesApi está pronto para usar');
}
```

**Se TESTE 1-3 passou:** Ir para SEÇÃO "TESTE 4 DO FLUXO"  
**Se algum falhou:** Ir para SEÇÃO "DIAGNÓSTICO DE ERRO"

---

## 🚨 DIAGNÓSTICO DE ERRO

### Cenário A: `__webAdapter` undefined

```javascript
// No console:
typeof window.__webAdapter === 'undefined'
```

**Causa Provável:**
- web-adapter.js tem SyntaxError
- window.__webAdapter nunca é criado
- app-api.js throws error "Nenhum adapter disponivel"

**Solução:**
1. Abrir DevTools → Sources
2. Procurar arquivo `shared/adapters/web-adapter.js`
3. Verificar por erros de syntax em VERMELHO
4. Se houver comentário `//` sem fechar ou `}` faltando
5. IMPLEMENTAR: Corrigir syntaxeerro

**Se não há syntaxerror visual:**
Usar grep para procurar por código incorreto:
```bash
grep -n "const services =" shared/adapters/web-adapter.js
```

Se saída for VAZIA = `services` não foi definido. Se houver erro de syntax nessa proximidade, corrigir.

---

### Cenário B: `__webAdapter` existe MAS `services` undefined

```javascript
typeof window.__webAdapter === 'object'
typeof window.__webAdapter.services === 'undefined'
```

**Causa Provável:**
- web-adapter.js carregou
- Mas `services` não foi adicionado ao `window.__webAdapter`
- Verificar linha 2315 em web-adapter.js

**Solução:**
Abrir web-adapter.js e verificar se linha ~2315 tem:
```javascript
window.__webAdapter = {
  // ...
  services,  // ← DEVE ESTAR AQUI
  // ...
};
```

Se `services,` estiver comentado ou ausente:

**IMPLEMENTAR:**
```javascript
// Adicionar 'services,' na lista de propriedades em window.__webAdapter
window.__webAdapter = {
  // ... outras propriedades ...
  services,  // ← ADICIONAR ESTA LINHA se falta
  documents,
  // ... continuar lista ...
};
```

---

### Cenário C: `services` existe MAS `addToPatient` undefined

```javascript
typeof window.appApi.services === 'object'
typeof window.appApi.services.addToPatient === 'undefined'
```

**Causa Provável:**
- `services` objeto existe MAS está vazio ou sem `addToPatient`
- Verificar linha 1480 em web-adapter.js

**Solução:**
Verificar se em web-adapter.js, linha ~1480, existe:
```javascript
const services = {
  addToPatient: async ({ prontuario, service = {} } = {}) => {
    // ... implementação ...
  },
  listForPatient: async (...) => { ... },
  // ...
};
```

Se `addToPatient` está comentado ou ausente:

**IMPLEMENTAR:** Descoment ou readd `addToPatient` à definição de `services`.

---

### Cenário D: `appApi` undefined (mais grave)

```javascript
typeof window.appApi === 'undefined'
```

**Causa Provável:**
- shared/app-api.js não carregou
- ou throw error durante execução
- ou web-adapter.js falhou antes de app-api.js

**Solução:**
1. Verificar DevTools → Console para erro vermelho
2. Se houver "Nenhum adapter disponivel" → web-adapter.js completamente falhou
3. Se nenhum erro → verificar ordem dos scripts em prontuario.html

No prontuario.html, verificar que ordem é:
```html
<script src="shared/adapters/desktop-adapter.js"></script>
<script src="shared/adapters/web-adapter.js"></script>
<script src="shared/app-api.js"></script>
```

Se ordem está errada:

**IMPLEMENTAR:** Reordenar scripts na ordem correta.

---

## ✅ TESTE 4: Validar Fluxo Completo

Se TESTE 1-3 passou:

1. Abrir prontuario.html no navegador
2. Procurar um paciente
3. Clicar em "Adicionar Procedimento" (botão azul)
4. Preencher form:
   - **Procedimento:** Selecionar um da lista (ex: "Consulta")
   - **Valor:** 100,00
   - **Dente:** Clicar no odontograma para selecionar
5. Clicar "Salvar"
6. **Resultado esperado:** 
   - Procedimento desaparece de form (closeServiceDrawer() executado)
   - Lista recarrega com procedimento novo
7. Abrir DevTools → Network tab
   - Deve haver request POST `/clinical/patients/{id}/procedures`
   - Status deve ser 200 ou 201
   - Response deve ter `data: { id: '...', externalId: '...', nome: '...', status: 'a-realizar' }`

**Se Network request não apareceu:** servicesApi.addToPatient não foi chamado

**Se Network request apareceu com erro 404/500:** backend não recebeu ou rejeitou

---

## 🛠️ IMPLEMENTAÇÃO MÍNIMA

Baseado em diagnóstico acima, escolher UMA:

### Fix 1: Adicionar `services` em window.__webAdapter (se falta)

**Arquivo:** [shared/adapters/web-adapter.js](shared/adapters/web-adapter.js#L2315)

```javascript
// ANTES (linha 2315+):
window.__webAdapter = {
  mode: 'web',
  auth,
  users,
  patients,
  documents,  // ← services está faltando aqui?
  finance,
  // ...
};

// DEPOIS:
window.__webAdapter = {
  mode: 'web',
  auth,
  users,
  patients,
  services,     // ← ADICIONAR ESTA LIN HA
  documents,
  finance,
  // ...
};
```

**Linhas afetadas:** ~2315-2345  
**Alterações totais:** 1 adição de 1 linha  
**Risco:** ZERO - é apenas expor propriedade já definida

---

### Fix 2: Verificar e descomment `addToPatient` em services (se está comentado)

**Arquivo:** [shared/adapters/web-adapter.js](shared/adapters/web-adapter.js#L1479)

Verificar se dentro do `const services = {` existe a definição de `addToPatient`:

```javascript
const services = {
  // Se addToPatient está aqui assim:
  // addToPatient: async (...) => { ... },
  
  // DESCOMMENT para:
  addToPatient: async (...) => { ... },
  
  listForPatient: async (...) => { ... },
};
```

**Linhas afetadas:** ~1479-1520  
**Alterações totais:** Remover `//` commentário  
**Risco:** ZERO se código está correto

---

### Fix 3: Reordenar scripts em prontuario.html (se ordem errada)

**Arquivo:** [prontuario.html](prontuario.html#L954)

Garantir que ordem é EXATAMENTE:

```html
<script src="shared/adapters/desktop-adapter.js"></script>
<script src="shared/adapters/web-adapter.js"></script>
<script src="shared/app-api.js"></script>
<script src="prontuario.js"></script>
```

MAS NÃO MUDE a ordem de header.js ou outros scripts.

**Linhas afetadas:** ~954-958  
**Alterações totais:** Reordenar 3 linhas  
**Risco:** ZERO - apenas reordenação

---

## 📊 VALIDAÇÃO PÓS-IMPLEMENTAÇÃO

Após fazer UMA DAS CORREÇÕES:

```javascript
// No console:
1. Refresh página (F5)
2. Testar: typeof window.appApi.services.addToPatient
   → Deve retornar 'function' (não 'undefined')
3. Testar: typeof window.appApi === 'object'
   → Deve retornar 'object'
```

Se tester passou:
- ✅ Ir para "TESTE 4: Validar Fluxo Completo"
- ✅ Criar procedimento e validar no Network tab
- ✅ Verificar se procedimentopersiste no Gestão/Financeiro

---

## 🎯 MULTI-CLÍNICA PRESERVADA

Todas as correções acima:
- ✅ Não usam hardcoded clinicId
- ✅ Usam `currentPatient.prontuario` (backend resolve clinicId via token)
- ✅ Mantêm compatibilidade com desktop Electron
- ✅ Não modificam IPC ou backend
- ✅ HTML/CSS não alterados

---

## ⚡ NEXT STEPS

1. **Agora:** Execute TEST 1-3 acima no console
2. **Compartilhe** resultado do test (quale `undefined`?)
3. **Baseado no resultado:** Aplique Fix correspondente
4. **Depois:** Execute TEST 4 para validar create funciona
5. **Final:** Verifique se processo completo (create → financeiro → gestão) funciona

**Tempo total de resolução:** ~10 minutos

---

**🚀 Pronto para implementar assim que confirmar qual test falhou.**

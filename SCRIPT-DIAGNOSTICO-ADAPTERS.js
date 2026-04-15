// ════════════════════════════════════════════════════════════════
// DIAGNÓSTICO DE CARREGAMENTO DE ADAPTERS - Voithos Web
// Data: 14 Abril 2026
// Propósito: Validar se web-adapter.js, app-api.js e desktop-adapter.js
//            foram carregados e se window.appApi está disponível
// ════════════════════════════════════════════════════════════════

(function() {
  const ADAPTERS_TO_FIND = ['web-adapter', 'app-api', 'desktop-adapter'];
  const DEBUG_SEPARATOR = '════════════════════════════════════════════';
  
  console.log('\n' + DEBUG_SEPARATOR);
  console.log('🔍 DIAGNÓSTICO: Carregamento de Adapters Voithos');
  console.log(DEBUG_SEPARATOR + '\n');

  // ─────────────────────────────────────────────────────────────────
  // 1. LISTAR TODOS OS SCRIPTS CARREGADOS
  // ─────────────────────────────────────────────────────────────────
  console.log('📋 PASSO 1: Scripts carregados na página');
  console.log('─────────────────────────────────────────\n');
  
  const allScripts = Array.from(document.querySelectorAll('script'));
  console.log(`Total de scripts encontrados: ${allScripts.length}`);
  
  const scriptTable = allScripts.map((script, idx) => ({
    '#': idx + 1,
    'Type': script.type || 'module',
    'Src': script.src || '(inline)',
    'Loaded': script.src ? '✅' : '(inline)'
  }));
  
  console.table(scriptTable);

  // ─────────────────────────────────────────────────────────────────
  // 2. FILTRAR ADAPTERS ESPECÍFICOS
  // ─────────────────────────────────────────────────────────────────
  console.log('\n📌 PASSO 2: Procurando adapters específicos');
  console.log('─────────────────────────────────────────\n');
  
  const adapterScripts = allScripts.filter(script => 
    ADAPTERS_TO_FIND.some(adapter => script.src && script.src.includes(adapter))
  );
  
  if (adapterScripts.length === 0) {
    console.error('❌ CRÍTICO: Nenhum adapter encontrado no DOM!');
  } else {
    console.log(`✅ Encontrados ${adapterScripts.length} adapter(s):\n`);
  }
  
  const adapterTable = adapterScripts.map((script, idx) => {
    const adapter = ADAPTERS_TO_FIND.find(name => script.src.includes(name));
    const isLoaded = script.src ? '✅ Carregado' : '⏳ Inline';
    
    return {
      '#': idx + 1,
      'Adapter': adapter || 'unknown',
      'URL completa': script.src,
      'Status': isLoaded,
      'Ready State': script.parentNode ? '✅ No DOM' : '❌ Não está no DOM'
    };
  });
  
  if (adapterTable.length > 0) {
    console.table(adapterTable);
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. VERIFICAR SE ESTÃO NO DOM (já feito acima, mas detalhado aqui)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n🔗 PASSO 3: Verificação de presença no DOM');
  console.log('─────────────────────────────────────────\n');
  
  ADAPTERS_TO_FIND.forEach(adapter => {
    const found = allScripts.find(s => s.src && s.src.includes(adapter));
    const status = found ? '✅ SIM' : '❌ NÃO';
    const url = found ? found.src : '(não encontrado)';
    console.log(`${adapter}.js: ${status} - ${url}`);
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. VERIFICAR OBJETOS GLOBAIS (window.__webAdapter, etc)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n🌍 PASSO 4: Objetos globais criados');
  console.log('─────────────────────────────────────────\n');
  
  const globalObjects = [
    { name: 'window.__desktopAdapter', value: window.__desktopAdapter },
    { name: 'window.__webAdapter', value: window.__webAdapter },
    { name: 'window.appApi', value: window.appApi }
  ];
  
  const globalTable = globalObjects.map(obj => {
    const exists = typeof obj.value !== 'undefined';
    const type = typeof obj.value;
    const hasServices = obj.value && typeof obj.value.services !== 'undefined';
    const hasAddToPatient = obj.value && obj.value.services && typeof obj.value.services.addToPatient !== 'undefined';
    
    return {
      'Objeto': obj.name,
      'Existe?': exists ? '✅ SIM' : '❌ NÃO',
      'Type': exists ? type : '-',
      'Tem .services?': exists && hasServices ? '✅ SIM' : '⚠️ NÃO',
      'Tem .addToPatient?': exists && hasAddToPatient ? '✅ SIM' : '⚠️ NÃO'
    };
  });
  
  console.table(globalTable);

  // ─────────────────────────────────────────────────────────────────
  // 5. VERIFICAÇÃO DETALHADA DE appApi.services
  // ─────────────────────────────────────────────────────────────────
  console.log('\n🔧 PASSO 5: Verificação de appApi.services');
  console.log('─────────────────────────────────────────\n');
  
  if (window.appApi) {
    console.log('✅ window.appApi existe!');
    console.log(`   Modo: ${window.appApi.mode || '(não definido)'}`);
    
    if (window.appApi.services) {
      console.log('✅ window.appApi.services existe!');
      
      const servicesMethods = [
        'addToPatient',
        'listForPatient',
        'update',
        'delete',
        'markDone'
      ];
      
      console.log('\n   Métodos disponíveis em services:');
      servicesMethods.forEach(method => {
        const exists = typeof window.appApi.services[method] !== 'undefined';
        const type = typeof window.appApi.services[method];
        const status = exists ? `✅ ${type}` : '❌ não existe';
        console.log(`   - ${method}: ${status}`);
      });
    } else {
      console.error('❌ window.appApi.services NÃO existe!');
    }
  } else {
    console.error('❌ window.appApi NÃO existe!');
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. VERIFICAÇÃO DE localStorage E AMBIENTE
  // ─────────────────────────────────────────────────────────────────
  console.log('\n⚙️  PASSO 6: Verificação do ambiente');
  console.log('─────────────────────────────────────────\n');
  
  try {
    const apiBase = localStorage.getItem('apiBase');
    const appBaseUrl = window.__APP_API_BASE__;
    
    console.log(`localStorage.apiBase: ${apiBase ? `✅ "${apiBase}"` : '❌ vazio'}`);
    console.log(`window.__APP_API_BASE__: ${appBaseUrl ? `✅ "${appBaseUrl}"` : '❌ vazio'}`);
  } catch (err) {
    console.error('❌ Erro ao acessar localStorage:', err.message);
  }

  // ─────────────────────────────────────────────────────────────────
  // DIAGNÓSTICO FINAL
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + DEBUG_SEPARATOR);
  console.log('📊 DIAGNÓSTICO FINAL');
  console.log(DEBUG_SEPARATOR + '\n');
  
  const hasDesktopadapter = typeof window.__desktopAdapter !== 'undefined';
  const hasWebAdapter = typeof window.__webAdapter !== 'undefined';
  const hasAppApi = typeof window.appApi !== 'undefined';
  const hasServices = hasAppApi && typeof window.appApi.services !== 'undefined';
  const hasAddToPatient = hasServices && typeof window.appApi.services.addToPatient !== 'undefined';
  
  const diagnosticTable = [
    {
      'Componente': 'desktop-adapter.js',
      'Status': hasDesktopadapter ? '✅ CARREGADO' : '❌ NÃO CARREGADO'
    },
    {
      'Componente': 'web-adapter.js',
      'Status': hasWebAdapter ? '✅ CARREGADO' : '❌ NÃO CARREGADO'
    },
    {
      'Componente': 'app-api.js',
      'Status': hasAppApi ? '✅ CARREGADO' : '❌ NÃO CARREGADO'
    },
    {
      'Componente': 'window.appApi',
      'Status': hasAppApi ? '✅ DISPONÍVEL' : '❌ INDISPONÍVEL'
    },
    {
      'Componente': 'appApi.services',
      'Status': hasServices ? '✅ DISPONÍVEL' : '❌ INDISPONÍVEL'
    },
    {
      'Componente': 'services.addToPatient',
      'Status': hasAddToPatient ? '✅ DISPONÍVEL' : '❌ INDISPONÍVEL'
    }
  ];
  
  console.table(diagnosticTable);

  // ─────────────────────────────────────────────────────────────────
  // RECOMENDAÇÕES
  // ─────────────────────────────────────────────────────────────────
  console.log('\n💡 RECOMENDAÇÕES:');
  console.log('─────────────────────────────────────────\n');
  
  if (!hasAppApi) {
    console.error('❌ PROBLEMA CRÍTICO: window.appApi não está disponível!');
    console.log('   Possíveis causas:');
    console.log('   1. shared/app-api.js não foi carregado');
    console.log('   2. web-adapter.js ou desktop-adapter.js falharam ao carregar');
    console.log('   3. Há erro de sintaxe em um dos adapters');
    console.log('   4. localStorage ou window.__APP_API_BASE__ não está configurado\n');
    console.log('   Ações recomendadas:');
    console.log('   • Abrir DevTools → Console e procurar por erro em vermelho');
    console.log('   • Ir para Network → procurar por "adapter" e verificar status HTTP');
    console.log('   • Verificar se localStorage.apiBase ou window.__APP_API_BASE__ estão configurados');
  } else if (!hasServices) {
    console.warn('⚠️  window.appApi existe, mas services não está disponível');
    console.log('   window.appApi.services é undefined');
  } else if (!hasAddToPatient) {
    console.warn('⚠️  services existe, mas addToPatient não está disponível');
    console.log('   window.appApi.services.addToPatient é undefined');
  } else {
    console.log('✅ TUDO OK! window.appApi.services.addToPatient está disponível');
    console.log('   A API está pronta para ser utilizada');
  }
  
  console.log('\n' + DEBUG_SEPARATOR + '\n');
  
  // ─────────────────────────────────────────────────────────────────
  // TESTE MANUAL (OPCIONAL)
  // ─────────────────────────────────────────────────────────────────
  if (hasAddToPatient) {
    console.log('📝 Para testar a API manualmente, você pode executar:\n');
    console.log('// Teste simples (sem enviar):');
    console.log('console.log(typeof window.appApi.services.addToPatient);');
    console.log('\n// Resultado esperado: "function"\n');
  }
})();

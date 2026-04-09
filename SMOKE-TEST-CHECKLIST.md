# Smoke Test Checklist (Release)

## 1) Acesso e Sessao
- Abrir `login.html` e autenticar com perfil `admin`.
Resultado esperado: login concluido e redirecionamento para `index.html`.
- Fazer logout no cabecalho.
Resultado esperado: retorno para `login.html`.

## 2) Usuarios e Permissoes
- Abrir `users.html`, criar um `dentista` e uma `recepcionista`.
Resultado esperado: usuarios aparecem na lista e sem erro.
- Editar um usuario existente e salvar.
Resultado esperado: dados atualizados persistem apos recarregar.
- Redefinir senha de um usuario.
Resultado esperado: operacao concluida com mensagem de sucesso.

## 3) Pacientes
- Abrir `cadastro-paciente.html`, cadastrar paciente e salvar.
Resultado esperado: paciente aparece em `lista-pacientes.html`.
- Abrir `editar-paciente.html` do paciente e atualizar dados.
Resultado esperado: alteracoes persistidas apos recarregar.

## 4) Prontuario e Servicos
- Abrir `prontuario.html` do paciente e registrar um servico.
Resultado esperado: servico aparece na lista do prontuario.
- Editar e excluir servico.
Resultado esperado: lista reflete alteracoes sem quebrar tela.

## 5) Agenda
- Abrir `agendamentos.html` e criar agendamento.
Resultado esperado: item visivel no dia/mes.
- Abrir `agenda-dia.html`, editar e excluir agendamento.
Resultado esperado: atualizacao imediata no painel.

## 6) Documentos
- Emitir `atestado` em `atestado.html`.
Resultado esperado: documento salvo e aberto.
- Gerar `contrato` em `contratos.html`.
Resultado esperado: documento salvo e aberto.
- Testar `receita` e `anamnese` nas telas correspondentes.
Resultado esperado: salvar sem erro e abrir arquivo.

## 7) Comunicacao e Campanhas
- Abrir `comunicacao.html` e `campanhas.html`.
Resultado esperado: lista de campanhas carrega.
- Criar/editar/excluir campanha.
Resultado esperado: operacoes refletem na lista sem erro.

## 8) Configuracoes Clinica
- Abrir `clinica.html`, salvar dados da clinica.
Resultado esperado: dados persistem apos recarregar.
- Testar envio de WhatsApp (se configurado).
Resultado esperado: tentativa registrada no historico.

## 9) Financeiro e Laboratorio
- Abrir `faturamento.html` e registrar recebimento.
Resultado esperado: registro salvo e exibido.
- Abrir `laboratorio.html`, criar/editar/excluir registro.
Resultado esperado: dashboard e tabela atualizam.

## 10) Super Admin (se aplicavel)
- Abrir `super-admin.html`, criar clinica e abrir clinica por impersonacao.
Resultado esperado: criacao concluida e acesso a `index.html` da clinica.

## Critico para aprovar release
- Nenhum erro em console bloqueando fluxo principal.
- Nenhuma tela principal com carregamento quebrado.
- Login, agenda, prontuario, usuarios e documentos funcionando ponta a ponta.

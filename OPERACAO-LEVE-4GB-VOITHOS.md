# Operacao Leve da Voithos em Maquina com 4 GB de RAM

Objetivo:
- manter o ambiente local funcional
- evitar travamentos
- permitir testes manuais enquanto o produto e finalizado

## Sequencia recomendada

1. Subir o backend central

```powershell
cmd /c npm run backend:start
```

2. Subir o WhatsApp NG em modo headless

```powershell
cmd /c "cd whatsapp-engine && npm run start:all:headless"
```

3. Abrir o app Electron

```powershell
cmd /c npm start
```

## O que nao deve rodar junto

Nao rode ao mesmo tempo:
- `npm run whatsapp-ng`
- `npm run start:all`
- `npm run start:all:headless`
- `npm run bootstrap:platform:local`
- `npm run gate:platform:local`
- `npm run smoke:platform:local`

Escolha um fluxo por vez.

## Fluxo leve para teste manual

Quando o objetivo for so testar a aplicacao:

1. backend central
2. NG headless
3. Electron

So isso.

## Fluxo leve para smoke

Quando o objetivo for validar ambiente:

1. backend central
2. NG headless
3. rodar:

```powershell
cmd /c npm run smoke:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95
```

Depois feche o smoke. Nao deixe varios processos extras abertos.

## O que economiza RAM

- usar `start:all:headless` em vez de `whatsapp-ng`
- nao deixar builds e `tsc` rodando em paralelo
- nao abrir a UI do NG sem necessidade
- fechar navegador com muitas abas
- evitar rodar Electron + build + smoke + gate ao mesmo tempo

## Sequencia segura de reinicio

Se o ambiente travar:

1. feche o Electron
2. pare o NG
3. confirme que o backend ainda esta vivo
4. suba o NG headless de novo
5. abra o Electron por ultimo

## Quando usar bootstrap ou gate

Use apenas quando realmente precisar validar release local:

```powershell
cmd /c npm run bootstrap:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95
```

ou

```powershell
cmd /c npm run gate:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95
```

Esses comandos sao mais pesados. Nao sao o modo ideal para uso continuo numa maquina fraca.

## Recomendacao final

Para sua maquina atual, o modo mais estavel e:
- backend central em um terminal
- NG headless em outro terminal
- Electron sozinho

Esse e o modo operacional correto ate o produto ficar mais leve ou migrarmos mais carga para a camada web/SaaS.

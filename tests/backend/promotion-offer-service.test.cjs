const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

const servicePath = path.resolve(__dirname, '../../backend/src/services/promotionOfferService.js');
const repositoryPath = path.resolve(__dirname, '../../backend/src/repositories/promotionOfferRepository.js');
const prismaPath = path.resolve(__dirname, '../../backend/src/db/prisma.js');

test('promotionOfferService cria oferta ativa com preco promocional valido', async (t) => {
  const calls = [];
  const repoMock = {
    promotionOfferRepository: {
      findByCode: async () => null,
      create: async (data) => {
        calls.push(data);
        return {
          id: 'offer-1',
          ...data,
          usedCount: 0,
          createdAt: new Date('2026-05-10T00:00:00.000Z'),
          updatedAt: new Date('2026-05-10T00:00:00.000Z'),
        };
      },
    },
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(servicePath, {
    [repositoryPath]: repoMock,
    [prismaPath]: { prisma: {} },
  });
  t.after(restore);

  const result = await serviceModule.promotionOfferService.createOffer({
    actorId: 'super-1',
    payload: {
      title: 'Evento Odonto 2026',
      code: 'odonto-2026',
      planType: 'SEMIANNUAL',
      regularPrice: 499.9,
      promotionalPrice: 399.9,
      maxUses: 50,
      source: 'EVENT',
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].code, 'ODONTO-2026');
  assert.equal(calls[0].regularPriceCents, 49990);
  assert.equal(calls[0].promotionalPriceCents, 39990);
  assert.equal(calls[0].createdByUserId, 'super-1');
  assert.equal(result.code, 'ODONTO-2026');
  assert.equal(result.promotionalPrice, 399.9);
});

test('promotionOfferService bloqueia oferta expirada', async (t) => {
  const repoMock = {
    promotionOfferRepository: {
      findByCode: async () => ({
        id: 'offer-1',
        code: 'EXPIRADA',
        title: 'Oferta expirada',
        planType: 'ANNUAL',
        regularPriceCents: 89990,
        promotionalPriceCents: 69990,
        usedCount: 0,
        maxUses: 1,
        active: true,
        validUntil: new Date('2020-01-01T00:00:00.000Z'),
      }),
    },
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(servicePath, {
    [repositoryPath]: repoMock,
    [prismaPath]: { prisma: {} },
  });
  t.after(restore);

  await assert.rejects(
    () => serviceModule.promotionOfferService.validateOfferByCode({ code: 'EXPIRADA' }),
    (error) => {
      assert.equal(error.code, 'PROMOTION_OFFER_INVALID');
      return true;
    }
  );
});

test('promotionOfferService bloqueia preco promocional acima do preco normal', async (t) => {
  const repoMock = {
    promotionOfferRepository: {
      findByCode: async () => null,
      create: async () => {
        throw new Error('create should not be called');
      },
    },
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(servicePath, {
    [repositoryPath]: repoMock,
    [prismaPath]: { prisma: {} },
  });
  t.after(restore);

  await assert.rejects(
    () => serviceModule.promotionOfferService.createOffer({
      payload: {
        title: 'Preco invalido',
        planType: 'ANNUAL',
        regularPrice: 699.9,
        promotionalPrice: 899.9,
      },
    }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_ERROR');
      return true;
    }
  );
});

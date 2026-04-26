const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('campaignService.createCampaign ignora clinicId do payload e saneia audienceFilters/metadata', async (t) => {
  let createdPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/campaignService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/campaignRepository.js')]: {
        campaignRepository: {
          countByClinic: async () => 1,
          createCampaign: async (data) => {
            createdPayload = data;
            return data;
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: { patientRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: { patientClinicalRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/messagingDispatchService.js')]: { messagingDispatchService: {} },
      [path.resolve(__dirname, '../../backend/src/services/campaignAudienceResolver.js')]: { resolveAudiencePreviewData: () => ({}) },
      [path.resolve(__dirname, '../../shared/campaign-template-catalog.js')]: {
        listCampaignTemplatesCatalog: () => ({ annualTemplates: [] }),
        getCampaignTemplateById: () => null,
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.campaignService.createCampaign({
    clinicId: 'clinic-auth',
    payload: {
      clinicId: 'clinic-evil',
      nome: 'Campanha Teste',
      segmentKey: 'by_dentist',
      audienceFilters: {
        clinicId: 'clinic-evil',
        dentistId: 'dent-1',
        nested: {
          patientId: 'patient-evil',
          keep: 'ok',
        },
      },
      metadata: {
        clinicId: 'clinic-evil',
        selection: {
          patientIds: ['patient-evil'],
          keep: true,
        },
      },
    },
    actorName: 'user-1',
  });

  assert.equal(createdPayload.clinicId, 'clinic-auth');
  assert.deepEqual(createdPayload.audienceFilters, {
    dentistId: 'dent-1',
    nested: {
      keep: 'ok',
    },
  });
  assert.deepEqual(createdPayload.metadata, {
    selection: {
      keep: true,
    },
  });
  assert.equal(result.clinicId, 'clinic-auth');
});

test('campaignService.resolveAudiencePreview bloqueia campaignId fora do tenant antes de consultar datasets', async (t) => {
  let patientsLookupCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/campaignService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/campaignRepository.js')]: {
        campaignRepository: {
          findCampaignByIdAndClinic: async () => null,
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          listAudienceBaseByClinic: async () => {
            patientsLookupCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: { patientClinicalRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/messagingDispatchService.js')]: { messagingDispatchService: {} },
      [path.resolve(__dirname, '../../backend/src/services/campaignAudienceResolver.js')]: { resolveAudiencePreviewData: () => ({}) },
      [path.resolve(__dirname, '../../shared/campaign-template-catalog.js')]: {
        listCampaignTemplatesCatalog: () => ({ annualTemplates: [] }),
        getCampaignTemplateById: () => null,
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => serviceModule.campaignService.resolveAudiencePreview({
      clinicId: 'clinic-auth',
      campaignId: 'camp-foreign',
      segmentKey: 'inactive_90',
      filters: { clinicId: 'clinic-evil' },
    }),
    (error) => {
      assert.equal(error?.code, 'CAMPAIGN_NOT_FOUND');
      return true;
    }
  );
  assert.equal(patientsLookupCalled, false);
});

test('campaignService.deleteCampaign arquiva e remove dados apenas da clinica autenticada', async (t) => {
  const calls = [];
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/campaignService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/campaignRepository.js')]: {
        campaignRepository: {
          findCampaignByIdAndClinic: async ({ clinicId, campaignId }) => {
            calls.push({ method: 'findCampaignByIdAndClinic', clinicId, campaignId });
            return { id: campaignId, clinicId };
          },
          archiveCampaignWithData: async ({ clinicId, campaignId }) => {
            calls.push({ method: 'archiveCampaignWithData', clinicId, campaignId });
            return { success: true };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: { patientRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: { patientClinicalRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/messagingDispatchService.js')]: { messagingDispatchService: {} },
      [path.resolve(__dirname, '../../backend/src/services/campaignAudienceResolver.js')]: { resolveAudiencePreviewData: () => ({}) },
      [path.resolve(__dirname, '../../shared/campaign-template-catalog.js')]: {
        listCampaignTemplatesCatalog: () => ({ annualTemplates: [] }),
        getCampaignTemplateById: () => null,
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.campaignService.deleteCampaign({
    clinicId: 'clinic-auth',
    campaignId: 'camp-1',
  });

  assert.deepEqual(calls, [
    { method: 'findCampaignByIdAndClinic', clinicId: 'clinic-auth', campaignId: 'camp-1' },
    { method: 'archiveCampaignWithData', clinicId: 'clinic-auth', campaignId: 'camp-1' },
  ]);
  assert.deepEqual(result, { success: true });
});

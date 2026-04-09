import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { campaignRepository } = require('../backend/src/repositories/campaignRepository');
const { clinicRepository } = require('../backend/src/repositories/clinicRepository');
const { patientRepository } = require('../backend/src/repositories/patientRepository');
const { appointmentRepository } = require('../backend/src/repositories/appointmentRepository');
const { financialRepository } = require('../backend/src/repositories/financialRepository');
const { patientClinicalRepository } = require('../backend/src/repositories/patientClinicalRepository');

const data = {
  clinics: [
    { id: 'clinic-a', nomeFantasia: 'Clinica A', razaoSocial: 'Clinica A LTDA', operationalSettings: { campaigns: [] } },
    { id: 'clinic-b', nomeFantasia: 'Clinica B', razaoSocial: 'Clinica B LTDA', operationalSettings: { campaigns: [] } },
  ],
  patients: [
    { id: 'pa-ana', clinicId: 'clinic-a', nome: 'Ana', telefone: '11999990001', allowsMessages: true, createdAt: new Date('2025-01-10T10:00:00Z') },
    { id: 'pa-bruno', clinicId: 'clinic-a', nome: 'Bruno', telefone: '11999990002', allowsMessages: false, createdAt: new Date('2025-01-15T10:00:00Z') },
    { id: 'pa-carla', clinicId: 'clinic-a', nome: 'Carla', telefone: '11999990003', allowsMessages: true, createdAt: new Date('2025-01-20T10:00:00Z') },
    { id: 'pa-elisa', clinicId: 'clinic-a', nome: 'Elisa', telefone: '', allowsMessages: true, createdAt: new Date('2025-01-22T10:00:00Z') },
    { id: 'pb-iris', clinicId: 'clinic-b', nome: 'Iris', telefone: '21999990001', allowsMessages: true, createdAt: new Date('2025-01-25T10:00:00Z') },
  ],
  appointments: [
    { id: 'appt-ana-missed', clinicId: 'clinic-a', patientId: 'pa-ana', profissionalNome: 'Dra. Sofia', dataHora: new Date('2026-02-01T13:00:00Z'), createdAt: new Date('2026-01-20T13:00:00Z'), status: 'NAO_COMPARECEU', attendanceStatus: 'NO_SHOW' },
    { id: 'appt-bruno-missed', clinicId: 'clinic-a', patientId: 'pa-bruno', profissionalNome: 'Dra. Sofia', dataHora: new Date('2026-02-05T13:00:00Z'), createdAt: new Date('2026-01-22T13:00:00Z'), status: 'NAO_COMPARECEU', attendanceStatus: 'NO_SHOW' },
    { id: 'appt-carla-done', clinicId: 'clinic-a', patientId: 'pa-carla', profissionalNome: 'Dr. Leo', dataHora: new Date('2025-09-01T13:00:00Z'), createdAt: new Date('2025-09-01T13:00:00Z'), status: 'CONCLUIDO', attendanceStatus: 'ATTENDED' },
    { id: 'appt-elisa-done', clinicId: 'clinic-a', patientId: 'pa-elisa', profissionalNome: 'Dra. Sofia', dataHora: new Date('2025-08-01T13:00:00Z'), createdAt: new Date('2025-08-01T13:00:00Z'), status: 'CONCLUIDO', attendanceStatus: 'ATTENDED' },
    { id: 'appt-iris-done', clinicId: 'clinic-b', patientId: 'pb-iris', profissionalNome: 'Dr. Beto', dataHora: new Date('2025-07-15T13:00:00Z'), createdAt: new Date('2025-07-15T13:00:00Z'), status: 'CONCLUIDO', attendanceStatus: 'ATTENDED' },
  ],
  procedures: [
    { id: 'proc-carla-clean', clinicId: 'clinic-a', patientId: 'pa-carla', name: 'Profilaxia', procedureCode: 'LIMPEZA', dentistName: 'Dr. Leo', createdAt: new Date('2025-09-01T15:00:00Z'), performedAt: new Date('2025-09-01T15:00:00Z') },
  ],
  accounts: [],
  plans: [],
  campaigns: [],
  snapshots: [],
  snapshotMembers: [],
  batches: [],
  dispatches: [],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const toIso = (value) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

campaignRepository.countByClinic = async ({ clinicId }) => data.campaigns.filter((item) => item.clinicId === clinicId && !item.deletedAt).length;
campaignRepository.createManyCampaigns = async (items = []) => {
  data.campaigns.push(...clone(items));
  return { count: items.length };
};
campaignRepository.listCampaignsByClinic = async ({ clinicId }) => data.campaigns.filter((item) => item.clinicId === clinicId && !item.deletedAt).map(clone);
campaignRepository.findCampaignByIdAndClinic = async ({ clinicId, campaignId }) => clone(data.campaigns.find((item) => item.clinicId === clinicId && item.id === campaignId && !item.deletedAt) || null);
campaignRepository.createCampaign = async (input) => {
  const created = {
    ...clone(input),
    createdAt: input.createdAt || new Date(),
    updatedAt: input.updatedAt || new Date(),
    deletedAt: null,
  };
  data.campaigns.push(created);
  return clone(created);
};
campaignRepository.updateCampaign = async ({ clinicId, campaignId, data: patch }) => {
  const index = data.campaigns.findIndex((item) => item.clinicId === clinicId && item.id === campaignId);
  data.campaigns[index] = { ...data.campaigns[index], ...clone(patch), updatedAt: new Date() };
  return clone(data.campaigns[index]);
};
campaignRepository.softDeleteCampaign = async ({ clinicId, campaignId }) => {
  const index = data.campaigns.findIndex((item) => item.clinicId === clinicId && item.id === campaignId);
  if (index >= 0) data.campaigns[index] = { ...data.campaigns[index], deletedAt: new Date(), status: 'INACTIVE' };
  return { count: index >= 0 ? 1 : 0 };
};
campaignRepository.findLatestReusableBatch = async () => null;
campaignRepository.listExistingDispatchesByCampaignAndPatients = async ({ clinicId, campaignId, patientIds = [] }) =>
  data.dispatches
    .filter((item) => item.clinicId === clinicId && item.campaignId === campaignId && patientIds.includes(item.patientId))
    .map(clone);
campaignRepository.createAudienceSnapshotWithMembers = async ({ snapshot, members = [] }) => {
  const storedSnapshot = {
    ...clone(snapshot),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  data.snapshots.push(storedSnapshot);
  const storedMembers = members.map((item) => ({
    ...clone(item),
    snapshotId: storedSnapshot.id,
    createdAt: new Date(),
  }));
  data.snapshotMembers.push(...storedMembers);
  return { snapshot: clone(storedSnapshot), members: clone(storedMembers) };
};
campaignRepository.createBatchWithDispatches = async ({ batch, dispatches = [] }) => {
  const storedBatch = {
    ...clone(batch),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  data.batches.push(storedBatch);
  const storedDispatches = dispatches.map((item) => ({
    ...clone(item),
    batchId: storedBatch.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  data.dispatches.push(...storedDispatches);
  return { batch: clone(storedBatch), dispatches: clone(storedDispatches) };
};
campaignRepository.listDispatchesByBatch = async ({ clinicId, batchId }) => data.dispatches.filter((item) => item.clinicId === clinicId && item.batchId === batchId).map(clone);
campaignRepository.findBatchByIdAndClinic = async ({ clinicId, batchId }) => clone(data.batches.find((item) => item.clinicId === clinicId && item.id === batchId) || null);
campaignRepository.updateBatch = async ({ clinicId, batchId, data: patch }) => {
  const index = data.batches.findIndex((item) => item.clinicId === clinicId && item.id === batchId);
  data.batches[index] = { ...data.batches[index], ...clone(patch), updatedAt: new Date() };
  return clone(data.batches[index]);
};
campaignRepository.findDispatchByIdAndClinic = async ({ clinicId, dispatchId }) => clone(data.dispatches.find((item) => item.clinicId === clinicId && item.id === dispatchId) || null);
campaignRepository.updateDispatch = async ({ clinicId, dispatchId, data: patch }) => {
  const index = data.dispatches.findIndex((item) => item.clinicId === clinicId && item.id === dispatchId);
  data.dispatches[index] = { ...data.dispatches[index], ...clone(patch), updatedAt: new Date() };
  return clone(data.dispatches[index]);
};
campaignRepository.listDispatchesByClinic = async ({ clinicId }) => ({
  items: data.dispatches.filter((item) => item.clinicId === clinicId).map(clone),
  total: data.dispatches.filter((item) => item.clinicId === clinicId).length,
  page: 1,
  limit: 50,
  hasMore: false,
});
campaignRepository.listRecentDispatchesByClinic = async ({ clinicId }) => data.dispatches.filter((item) => item.clinicId === clinicId).map(clone);
campaignRepository.listBatchesByCampaign = async ({ clinicId, campaignId }) => data.batches.filter((item) => item.clinicId === clinicId && item.campaignId === campaignId).map(clone);

clinicRepository.findProfileById = async (clinicId) => clone(data.clinics.find((item) => item.id === clinicId) || null);
patientRepository.listAudienceBaseByClinic = async (clinicId) => data.patients.filter((item) => item.clinicId === clinicId).map(clone);
appointmentRepository.listAudienceBaseByClinic = async ({ clinicId }) => data.appointments.filter((item) => item.clinicId === clinicId).map(clone);
appointmentRepository.listByClinic = async ({ clinicId }) => data.appointments.filter((item) => item.clinicId === clinicId).map(clone);
patientClinicalRepository.listProcedureAudienceBaseByClinic = async ({ clinicId }) => data.procedures.filter((item) => item.clinicId === clinicId).map(clone);
financialRepository.listFinancialAccountsAudienceBaseByClinic = async ({ clinicId }) => data.accounts.filter((item) => item.clinicId === clinicId).map(clone);
financialRepository.listPatientPlansByClinic = async ({ clinicId }) => data.plans.filter((item) => item.clinicId === clinicId).map(clone);

const { campaignService } = require('../backend/src/services/campaignService');

const templates = await campaignService.listTemplates();
assert.ok(Array.isArray(templates.annualTemplates) && templates.annualTemplates.length >= 12, 'catalogo de templates indisponivel');

const missedPreview = await campaignService.resolveAudiencePreview({
  clinicId: 'clinic-a',
  templateId: 'annual-julho-retorno-de-faltas',
  actorName: 'smoke',
});

assert.equal(missedPreview.segmentKey, 'missed_followup');
assert.equal(missedPreview.total, 2);
assert.equal(missedPreview.includedCount, 1);
assert.equal(missedPreview.blockedCount, 1);
assert.deepEqual(missedPreview.members.map((item) => item.patientId).sort(), ['pa-ana', 'pa-bruno']);
assert.ok(missedPreview.members.some((item) => item.patientId === 'pa-ana' && item.flags?.missedFollowup === true));
assert.ok(missedPreview.members.some((item) => item.patientId === 'pa-bruno' && item.reasonCode === 'NO_CONSENT'));
assert.ok(!missedPreview.members.some((item) => item.patientId === 'pb-iris'));

const inactivePreview = await campaignService.resolveAudiencePreview({
  clinicId: 'clinic-a',
  templateId: 'annual-junho-sorriso-em-destaque',
  actorName: 'smoke',
});

assert.equal(inactivePreview.segmentKey, 'inactive_180');
assert.deepEqual(inactivePreview.members.map((item) => item.patientId).sort(), ['pa-carla', 'pa-elisa']);
assert.ok(inactivePreview.members.some((item) => item.patientId === 'pa-elisa' && item.reasonCode === 'NO_PHONE'));
assert.ok(inactivePreview.members.some((item) => item.patientId === 'pa-carla' && item.flags?.inactive180 === true));

const createdCampaign = await campaignService.createCampaign({
  clinicId: 'clinic-a',
  actorName: 'smoke',
  payload: {
    nome: 'Recuperar faltas de julho',
    descricao: 'Ola, {NOME_PACIENTE}! Podemos reagendar sua consulta?',
    segmentKey: 'missed_followup',
    status: 'ativa',
    templateId: 'annual-julho-retorno-de-faltas',
    templateTitle: 'Retome sua avaliacao nas ferias',
    templateCategory: 'RECOVERY',
    templateObjective: 'Recuperar faltas',
    templatePriority: 'HIGH',
    templateImpact: 'HIGH',
    messageTemplate: 'Ola, {NOME_PACIENTE}! Podemos reagendar sua consulta?',
    originType: 'TEMPLATE',
  },
});

assert.equal(createdCampaign.templateId, 'annual-julho-retorno-de-faltas');

const batchA = await campaignService.createBatch({
  clinicId: 'clinic-a',
  campaignId: createdCampaign.id,
  actorUserId: 'user-a',
  actorName: 'smoke',
  force: true,
  selectedPatientIds: ['pa-ana', 'pa-bruno'],
  templateId: 'annual-julho-retorno-de-faltas',
});

assert.equal(batchA.audienceCount, 2);
assert.equal(batchA.pendingCount, 1);
assert.equal(batchA.blockedCount, 1);
assert.ok(data.snapshots.some((item) => item.clinicId === 'clinic-a' && item.campaignId === createdCampaign.id));
assert.equal(data.snapshotMembers.filter((item) => item.snapshotId === batchA.audienceSnapshotId).length, 2);
assert.ok(data.snapshotMembers.every((item) => item.clinicId === 'clinic-a' || item.snapshotId !== batchA.audienceSnapshotId));
assert.ok(data.dispatches.some((item) => item.batchId === batchA.batchId && item.patientId === 'pa-ana' && item.status === 'PENDING'));
assert.ok(data.dispatches.some((item) => item.batchId === batchA.batchId && item.patientId === 'pa-bruno' && item.status === 'BLOCKED'));

const campaignB = await campaignService.createCampaign({
  clinicId: 'clinic-b',
  actorName: 'smoke',
  payload: {
    nome: 'Primavera clinic b',
    descricao: 'Ola, {NOME_PACIENTE}!',
    segmentKey: 'inactive_180',
    status: 'ativa',
    templateId: 'annual-setembro-primavera-do-sorriso',
    templateTitle: 'Primavera do sorriso',
  },
});

const batchB = await campaignService.createBatch({
  clinicId: 'clinic-b',
  campaignId: campaignB.id,
  actorUserId: 'user-b',
  actorName: 'smoke',
  force: true,
  selectedPatientIds: ['pb-iris'],
  templateId: 'annual-setembro-primavera-do-sorriso',
});

assert.equal(batchB.audienceCount, 1);
assert.ok(batchB.dispatches.every((item) => item.patientId === 'pb-iris'));
assert.ok(!batchB.dispatches.some((item) => item.patientId.startsWith('pa-')));

console.log([
  '[smoke:campaign-template] ok',
  `templates=${templates.annualTemplates.length}`,
  `clinicA_preview=${missedPreview.total}`,
  `clinicA_batch_pending=${batchA.pendingCount}`,
  `clinicA_batch_blocked=${batchA.blockedCount}`,
  `clinicB_batch_pending=${batchB.pendingCount}`,
].join(' '));

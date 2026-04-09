const express = require('express');
const { run, get, all } = require('../db');

const router = express.Router();

const nowIso = () => new Date().toISOString();
const trimOrNull = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

router.get('/', async (_req, res) => {
  try {
    const rows = await all('SELECT * FROM patients ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list patients.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Patient not found.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read patient.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const prontuario = trimOrNull(req.body.prontuario);
    const nome = trimOrNull(req.body.nome);
    if (!nome) return res.status(400).json({ error: 'Nome is required.' });

    const payload = {
      prontuario,
      nome,
      cpf: trimOrNull(req.body.cpf),
      data_nascimento: trimOrNull(req.body.data_nascimento),
      telefone: trimOrNull(req.body.telefone),
      email: trimOrNull(req.body.email),
      endereco: trimOrNull(req.body.endereco),
    };

    const ts = nowIso();
    const result = await run(
      `INSERT INTO patients (prontuario, nome, cpf, data_nascimento, telefone, email, endereco, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , [
        payload.prontuario,
        payload.nome,
        payload.cpf,
        payload.data_nascimento,
        payload.telefone,
        payload.email,
        payload.endereco,
        ts,
        ts,
      ]
    );

    const row = await get('SELECT * FROM patients WHERE id = ?', [result.id]);
    res.status(201).json(row);
  } catch (err) {
    const message = String(err && err.message ? err.message : 'Failed to create patient.');
    const status = message.includes('UNIQUE') ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const current = await get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Patient not found.' });

    const payload = {
      prontuario: trimOrNull(req.body.prontuario) ?? current.prontuario,
      nome: trimOrNull(req.body.nome) ?? current.nome,
      cpf: trimOrNull(req.body.cpf) ?? current.cpf,
      data_nascimento: trimOrNull(req.body.data_nascimento) ?? current.data_nascimento,
      telefone: trimOrNull(req.body.telefone) ?? current.telefone,
      email: trimOrNull(req.body.email) ?? current.email,
      endereco: trimOrNull(req.body.endereco) ?? current.endereco,
    };

    if (!payload.nome) return res.status(400).json({ error: 'Nome is required.' });

    await run(
      `UPDATE patients
       SET prontuario = ?, nome = ?, cpf = ?, data_nascimento = ?, telefone = ?, email = ?, endereco = ?, updated_at = ?
       WHERE id = ?`,
      [
        payload.prontuario,
        payload.nome,
        payload.cpf,
        payload.data_nascimento,
        payload.telefone,
        payload.email,
        payload.endereco,
        nowIso(),
        req.params.id,
      ]
    );

    const row = await get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
    res.json(row);
  } catch (err) {
    const message = String(err && err.message ? err.message : 'Failed to update patient.');
    const status = message.includes('UNIQUE') ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM patients WHERE id = ?', [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Patient not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete patient.' });
  }
});

module.exports = router;

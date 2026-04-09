const express = require('express');
const bcrypt = require('bcryptjs');
const { all, get } = require('../db');

const router = express.Router();

router.get('/users', async (_req, res) => {
  try {
    const rows = await all('SELECT id, nome, login, tipo FROM users ORDER BY nome');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const login = String(req.body.login || '').trim();
    const senha = String(req.body.senha || '').trim();
    if (!login || !senha) return res.status(400).json({ error: 'Login e senha obrigatorios.' });

    const user = await get('SELECT * FROM users WHERE login = ?', [login]);
    if (!user) return res.status(401).json({ error: 'Usuario ou senha invalidos.' });

    const ok = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Usuario ou senha invalidos.' });

    res.json({
      success: true,
      user: { id: user.id, nome: user.nome, login: user.login, tipo: user.tipo },
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao autenticar.' });
  }
});

module.exports = router;

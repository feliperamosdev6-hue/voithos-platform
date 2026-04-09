const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
} = require('../controllers/userController');

const router = express.Router();

router.use(authenticate);
router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.post('/:id/reset-password', resetPassword);
router.delete('/:id', deleteUser);

module.exports = router;

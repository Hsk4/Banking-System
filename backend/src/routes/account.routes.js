const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const accountController = require('../controllers/account.controller');
const router = express.Router();

/**
 * - POST /api/accounts/ 
 * - Create a new account 
 * - protected Routed
 */

router.post("/", authMiddleware, accountController.createAccount);

module.exports = router;

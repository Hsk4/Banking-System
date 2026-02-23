const {Router} = require('express');

const authMiddleware = require('../middleware/auth.middleware');

const transactionController = require('../controllers/transaction.controller');


/**
    * - POST /api/v1/transaction
    * - Create a new transaction
 */

transactionRoutes.post(
    "/", authMiddleware, transactionController.createTransaction
);

module.exports = transactionRoutes;
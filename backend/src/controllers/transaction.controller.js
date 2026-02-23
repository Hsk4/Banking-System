const transactionModel = require('../models/transaction.model');
const ledgerModel = require('../models/ledger.model');
const accountModel = require('../models/account.model');
const emailService = require('../services/email.service');
const { v4: uuidv4 } = require('uuid');

/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW :
    * 1. Validate request
    * 2. Validate Idempoteny key 
    * 3. check account status 
    * 4. Derive sender balance from ledger
    * 5. create transaction (pending)
    * 6. Create debit ledger entry 
    * 7. create creadit ledger entry 
    * 8. Mark transaction completed 
    * 9. Commit MongoDB session
    * 10. Send email notifications 
 */


async function createTransaction(req, res, next) {
    // 1. Validate request
    const {fromAccount, toAccount, amount, idempotencyKey} = req.body;

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const fromUserAccount = await accountModel.findOne({ _id: fromAccount });

    const toUserAccount = await accountModel.findOne({ _id: toAccount });

    if (!fromUserAccount || !toUserAccount) {
        return res.status(400).json({ message: 'Invalid account' });
    }


    // 2. Validate Idempotency key
    const existingTransaction = await transactionModel.findOne({ idempotencyKey : idempotencyKey });

    if (existingTransaction) {
        if (existingTransaction.status === 'completed') {
            return res.status(400).json({ message: 'Transaction already completed' });
        }
        else if (existingTransaction.status === 'pending') {
            return res.status(200).json({ message: 'Transaction already pending' });
        }
        else if (existingTransaction.status === 'failed') {
            return res.status(500).json({ message: 'Transaction already failed' });
        }
        else if (existingTransaction.status === 'Reversed') {
            return res.status(400).json({ message: 'Transaction already reversed' });
        }
        else {
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    // 3.check account status 

    if (fromAccount.status !== 'active' || toAccount.status !== 'active') {
        return res.status(400).json({ message: 'Account is not active' });
    }

    // 4. Derive sender balance from ledger
    const balance  = await fromUserAccount.getBalance();

    if (balance < req.body.amount) {
        return res.status(400).json({ message: `Insufficient balance. The current balance is ${balance}.requested amount is this ${amount}` });
    }
}
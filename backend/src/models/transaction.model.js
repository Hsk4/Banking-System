const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    fromAccount :{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'account',
        required: [true, "Transaction must be associated with a from account"],
        index: true,
    },


    toAccount :{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'account',
        required: [true, "Transaction must be associated with a to account"],
        index: true,
    },
    status : {
        type : String,
        enum: {
           values: ["pending", "completed", "failed","Reversed"],
           message: "{VALUE} is not supported",
        },
        default : "pending"
    },

    amount : {
        type: Number,
        required: [true, "Transaction must have an amount"],
        min: 0,
    },

    IdenmpotencyKey  : {
        type: String,
        required: [true, "Transaction must have an idempotency key"],
        index: true,
        unique: true,
    }
},{
timestamps: true,}
)

const transactionmodel = mongoose.model("transaction", transactionSchema);

module.exports = transactionmodel;
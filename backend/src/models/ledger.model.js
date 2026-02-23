const mongoose = require("mongoose");

const ledgerSchema = mongoose.Schema({
    
    account:{
        type : mongoose.Schema.Types.ObjectId,
        ref : "account",
        required : [true, "Ledger must be associated with an account"],
        index : true,
        immutable : true,
    },

    amount :{
        type : Number,
        required : [true, "Ledger must have an amount"],
        immutable : true 
    },

    transaction :{
        type : mongoose.Schema.Types.ObjectId,
        ref : "transaction",
        required : [true, "Ledger must be associated with a transaction"],
        index : true,
        immutable : true,
    },

    type : {
        type : String,
        enum : {
            values : ["credit", "debit"],
            message : "{VALUE} is not supported",
        },
    }

    
})


function preventLedgerModification (){
    throw new Error ("Ledger is immutable and cannot be modified or deleted ");
}

ledgerSchema.pre('finadOneAndUpdate', preventLedgerModification);
ledgerSchema.pre('updateOne', preventLedgerModification);
ledgerSchema.pre('deleteOne', preventLedgerModification);
ledgerSchema.pre('remove', preventLedgerModification);
ledgerSchema.pre('deleteMany', preventLedgerModification);


const ledgermodel = mongoose.model("ledger", ledgerSchema);

module.exports = ledgermodel;
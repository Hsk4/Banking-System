const mongoose = require("mongoose");
const ledgerModel = require("./ledger.model");
const accountSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: [true, "Account must e associated with a user"],
      index: true,
    },

    status: {
      type: String,
      enum: {
        values: ["active", "frozen", "closed"],
        message: "{VALUE} is not supported",
      },
      default: "active",
    },

    currency: {
      type: String,
      required: [true, "Account must have a currency"],
      default: "USD",
    },
  },

  {
    timestamps: true,
  },
);
accountSchema.index({ user: 1, status: 1 });

accountSchema.methods.getBalance = async function () {
  const balancedata = await ledgerModel.aggregate([
    { $match: { account: this._id } },
    {
      $group: {
        _id: "Null",
        totalDebit: {
          $sum: {
            $cond: [{ $eq: ["$type", "Debit"] }, "$amount", 0],
          },
        },
        totalCredit: {
          $sum: {
            $cond: [{ $eq: ["$type", "Credit"] }, "$amount", 0],
          },
        },
      },
    },
    {
      $project: {
        balance: {
          $subtract: ["$totalCredit", "$totalDebit"],
        },
      },
    },
  ]);
  if (balancedata.length > 0) {
    return balancedata[0].balance;
  } else {
    return 0;
  }
};


const accountmodel = mongoose.model("account", accountSchema);

module.exports = accountmodel;

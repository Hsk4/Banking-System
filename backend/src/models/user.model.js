const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const userSchema = mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
    trim: true,
    lowercase: true,
    match: [/\S+@\S+\.\S+/, "Please use a valid email address."],
    unique: true,
  },

  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
    lowercase: true,

  },

  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [8, "Password must be at least 8 characters long"],
    select: false,
  },
},
  {
    timestamps: true,
  }

);

userSchema.pre("save", async function () {

  if (!this.isModified("password")) {
    return ;
  }

  const hash = await bcrypt.hash(this.password, 10);
  this.password = hash;
  return ;

})


userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
}

const usermodel = mongoose.model("user", userSchema);

module.exports = usermodel;

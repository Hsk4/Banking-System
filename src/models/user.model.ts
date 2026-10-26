import mongoose from "mongoose";

/**
 * - User document shape
 * Represents a single user (account holder) in the system. `password` is
 * stored as a bcrypt hash, never in plain text.
 */
export interface IUser {
  /** unique, lower-cased email address used as the login identifier */
  email: string;
  /** display name of the user */
  name: string;
  /** bcrypt password hash; `select: false` on the schema hides it by default */
  password: string;
  /** virtual-only field used to confirm the password on registration */
  confirmPassword?: string;
  /** internal backing store for the `confirmPassword` virtual (not persisted) */
  _confirmPassword?: string;

  /** whether this user is a system user (not a real person) */
  systemUser: boolean;
}

/**
 * - User instance methods
 * Custom methods attached to every user document. Methods are declared
 * separately so the model can be typed without polluting the raw doc type.
 */
export interface IUserMethods {
  /**
   * Compare a plain-text password against the stored hash.
   * @param candidatePassword - the plain-text password to verify
   * @returns whether the candidate password matches the stored hash
   */
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/**
 * - User schema definition
 * Declares the persisted fields and attaches validation, hashing, and
 * instance methods to the `User` collection.
 */
const userSchema = new mongoose.Schema<IUser, {}, IUserMethods>(
  {
    // the user's email address - must be unique and match a basic email shape
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Please provide a valid email address"],
    },

    // the user's display name
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    // the user's password hash, hidden from query results unless explicitly selected
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
      minlength: [6, "Password must be at least 6 characters long"],
    },
    // marks internal service accounts - immutable so it can never be self-granted
    systemUser: {
      type: Boolean,
      default: false,
      immutable: true,
    },
  },

  {
    // adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  },
);

/**
 * - confirmPassword virtual
 * A non-persisted field that lets callers pass `confirmPassword` during
 * registration. A virtual is used so the plain-text confirmation is never
 * written to the database.
 */
userSchema
  .virtual("confirmPassword")
  .set(function (this: IUser, value: string) {
    this._confirmPassword = value;
  })
  .get(function (this: IUser) {
    return this._confirmPassword;
  });

/**
 * - Confirm password validation
 * Fails creation of a NEW user when `confirmPassword` is not supplied.
 * Existing documents are unaffected so updates never break validation.
 */
userSchema.path("password").validate({
  validator: function (this: mongoose.Document<unknown, {}, IUser> & IUser) {
    return !(this.isNew && !this.confirmPassword);
  },
  message: "Confirm Password is required",
});

/**
 * - Password hashing pre-save hook
 * Hashes the password with bcrypt (via Bun) before a document is saved,
 * but only when the password field was actually modified. This keeps the
 * hash from being re-hashed on unrelated updates.
 */
userSchema.pre("save", async function () {
  // skip hashing when the password has not changed
  if (!this.isModified("password")) {
    return;
  }

  // hash the plain-text password with a cost factor of 12
  const hash = await Bun.password.hash(this.password, {
    algorithm: "bcrypt",
    cost: 12,
  });
  this.password = hash;

  return;
});

/**
 * - comparePassword implementation
 * Verifies a plain-text password against the stored bcrypt hash.
 * See {@link IUserMethods.comparePassword}.
 */
userSchema.methods.comparePassword = async function (
  this: mongoose.Document<unknown, {}, IUser> & IUser,
  candidatePassword: string,
): Promise<boolean> {
  return await Bun.password.verify(candidatePassword, this.password);
};

/**
 * - User model
 * Compiled Mongoose model for the `users` collection. The two explicit
 * generics are required so TypeScript picks the overload that preserves
 * the instance methods (`comparePassword`) on query results.
 *
 * `password` is `select: false`, so it must be requested explicitly with
 * `.select("+password")` wherever it is needed (login only).
 */
const userModel = mongoose.model<
  IUser,
  mongoose.Model<IUser, {}, IUserMethods>
>("User", userSchema);
export default userModel;

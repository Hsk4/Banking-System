import type { Types } from "mongoose";
import type { IUser } from "./user.model";

/**
 * - Express request augmentation
 * `authMiddleware` / `authSystemUserMiddleware` attach the authenticated user
 * to `req.user`. Declaring it here (instead of casting at every call site)
 * gives every controller a typed `req.user`; the middleware is the only
 * place allowed to write it.
 */
declare global {
  namespace Express {
    interface Request {
      /** the authenticated user, attached by the auth middleware */
      user: IUser & { _id: Types.ObjectId };
    }
  }
}

export {};

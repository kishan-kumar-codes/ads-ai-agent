import type { NextFunction, Request, Response } from "express";
import { auth } from "../lib/auth.js";

export interface AuthedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: req.headers as any });
  if (!session?.user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.userId = session.user.id;
  req.sessionId = session.session.id;
  next();
}

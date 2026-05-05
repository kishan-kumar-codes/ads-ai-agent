import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { prisma } from "../lib/prisma.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, email: true, name: true, emailVerified: true, image: true },
  });
  if (!user) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }
  res.json({ user });
});

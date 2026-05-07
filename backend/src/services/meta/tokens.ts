import { prisma } from "../../lib/prisma.js";

export class MetaConnectionMissingError extends Error {
  constructor() {
    super("meta_connection_missing");
    this.name = "MetaConnectionMissingError";
  }
}

export async function getMetaConnection(userId: string) {
  return prisma.platformConnection.findUnique({
    where: { userId_platform: { userId, platform: "meta" } },
  });
}

export async function getMetaAccessTokenOrThrow(userId: string): Promise<string> {
  const connection = await getMetaConnection(userId);
  if (!connection?.accessToken) {
    throw new MetaConnectionMissingError();
  }
  return connection.accessToken;
}

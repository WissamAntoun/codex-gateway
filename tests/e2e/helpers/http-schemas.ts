import { z } from "zod";

export const hostRecordSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    sshHost: z.string().min(1),
    username: z.string().nullable(),
    port: z.number().int().positive().nullable(),
    authMode: z.enum(["agent", "privateKey", "password"]),
    hostKeyFingerprint: z.string().nullable(),
    privateKeyPath: z.string().nullable(),
    proxyUrl: z.string().nullable(),
    hasPassword: z.boolean(),
    hasPrivateKey: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .loose();

export const projectRecordSchema = z
  .object({
    hostId: z.number().int().positive(),
    name: z.string().min(1),
    remotePath: z.string().min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .loose();

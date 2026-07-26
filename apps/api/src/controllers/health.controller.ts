import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import net from "node:net";
import { prisma } from "@/lib/db";

async function storageReady() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return false;
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId, secretAccessKey }
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  } finally {
    client.destroy();
  }
}

async function scannerReady() {
  const host = process.env.CLAMAV_HOST;
  const port = Number(process.env.CLAMAV_PORT || 3310);
  if (!host || !Number.isInteger(port)) return false;
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(2_000, () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("connect", () => socket.write("zPING\0"));
    socket.once("data", (data) => finish(data.toString().includes("PONG")));
  });
}

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return this.live();
  }

  @Get("live")
  live() {
    return { status: "ok", service: "pulse-api" };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) response: Response) {
    const database = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    const [storage, scanner] = await Promise.all([storageReady(), scannerReady()]);
    const ready = database && storage && scanner;
    if (!ready) response.status(503);
    return {
      status: ready ? "ok" : "unavailable",
      components: {
        database: database ? "ok" : "unavailable",
        storage: storage ? "ok" : "unavailable",
        scanner: scanner ? "ok" : "unavailable"
      }
    };
  }

  @Get("database")
  async databaseHealth(@Res({ passthrough: true }) response: Response) {
    const database = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    if (!database) response.status(503);
    return { status: database ? "ok" : "unavailable", database: database ? "ok" : "unavailable" };
  }
}

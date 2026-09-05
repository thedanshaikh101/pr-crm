// Object storage behind one interface. S3-compatible (MinIO, AWS, R2) when S3_ENDPOINT
// is set; otherwise files land in ./.storage on disk and are served by /api/storage/get.
// Every key is prefixed with the accountId by the caller (`${accountId}/assets/${id}`), so
// tenancy is enforced by key construction, never by listing.
import { createHash, randomBytes } from "crypto";
import { mkdir, readFile, rm, writeFile, stat } from "fs/promises";
import path from "path";

export type PutTarget = { method: "PUT"; url: string; headers: Record<string, string> };

const LOCAL_ROOT = path.join(process.cwd(), ".storage");
const isS3 = () => !!process.env.S3_ENDPOINT && !!process.env.S3_BUCKET && process.env.STORAGE_DRIVER !== "local";

function safeKey(key: string) {
  const k = key.replace(/\\/g, "/").replace(/\.\.+/g, ".").replace(/^\/+/, "");
  if (!k || k.includes("/../")) throw new Error("Bad storage key");
  return k;
}

async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  });
}

export function newStorageKey(accountId: string, kind: string, fileName: string) {
  const ext = (fileName.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `${accountId}/${kind}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
}

export async function putObject(key: string, body: Buffer | Uint8Array | string, contentType = "application/octet-stream") {
  key = safeKey(key);
  if (isS3()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  } else {
    const p = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
    await writeFile(p + ".meta.json", JSON.stringify({ contentType }));
  }
  return key;
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  key = safeKey(key);
  if (isS3()) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const r = await (await s3()).send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      const body = Buffer.from(await r.Body!.transformToByteArray());
      return { body, contentType: r.ContentType ?? "application/octet-stream" };
    } catch { return null; }
  }
  const p = path.join(LOCAL_ROOT, key);
  try {
    await stat(p);
    const meta = JSON.parse(await readFile(p + ".meta.json", "utf8").catch(() => "{}"));
    return { body: await readFile(p), contentType: meta.contentType ?? "application/octet-stream" };
  } catch { return null; }
}

export async function deleteObject(key: string) {
  key = safeKey(key);
  if (isS3()) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  } else {
    await rm(path.join(LOCAL_ROOT, key), { force: true });
    await rm(path.join(LOCAL_ROOT, key) + ".meta.json", { force: true });
  }
}

/** Where a browser should PUT the bytes directly (presigned S3 URL, or our own route locally). */
export async function presignedPut(key: string, contentType: string, expiresSeconds = 900): Promise<PutTarget> {
  key = safeKey(key);
  if (isS3()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(await s3(), new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: expiresSeconds });
    return { method: "PUT", url, headers: { "content-type": contentType } };
  }
  const sig = signKey(key, Date.now() + expiresSeconds * 1000);
  return { method: "PUT", url: `/api/storage/put?key=${encodeURIComponent(key)}&exp=${sig.exp}&sig=${sig.sig}`, headers: { "content-type": contentType } };
}

/** A URL the browser can GET. Public S3 URLs when S3_PUBLIC_URL is set, else a presigned GET, else our own route. */
export async function urlFor(key: string, expiresSeconds = 3600): Promise<string> {
  key = safeKey(key);
  if (isS3()) {
    if (process.env.S3_PUBLIC_URL) return `${process.env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(await s3(), new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }), { expiresIn: expiresSeconds });
  }
  return `/api/storage/get?key=${encodeURIComponent(key)}`;
}

export function signKey(key: string, exp: number) {
  const sig = createHash("sha256").update(`${key}|${exp}|${process.env.SESSION_SECRET ?? ""}`).digest("hex").slice(0, 32);
  return { exp, sig };
}
export function verifyKeySig(key: string, exp: number, sig: string) {
  return exp > Date.now() && signKey(key, exp).sig === sig;
}

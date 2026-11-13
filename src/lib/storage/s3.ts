import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Object storage for user uploads (profile pictures today). Prod = a private
// MinIO bucket on claw, reachable only on the Docker network — browsers never
// talk to it; `/api/avatar/[userId]` streams objects through the app.
//
// The client is built lazily so `next build` (which imports route modules with
// no S3 env) doesn't throw; a missing var only fails the request that needs it.

type StorageConfig = { client: S3Client; bucket: string };

let cached: StorageConfig | null = null;

function storage(): StorageConfig {
  if (cached) return cached;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Object storage is not configured (S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET).",
    );
  }
  cached = {
    bucket,
    client: new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? "us-east-1",
      // MinIO serves buckets by path, not virtual-host subdomain.
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return cached;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
) {
  const { client, bucket } = storage();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Returns the object's bytes + type, or null if it doesn't exist. */
export async function getObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const { client, bucket } = storage();
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) return null;
    return {
      body: await res.Body.transformToByteArray(),
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

export async function deleteObject(key: string) {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

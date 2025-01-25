import { CloudFrontRequestEvent } from "aws-lambda";
import {
  S3Client,
  HeadObjectCommand,
  NotFound,
  S3ServiceException,
} from "@aws-sdk/client-s3";

// Constants
const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png)$/i;
const s3Client = new S3Client({
  followRegionRedirects: true,
  region: process.env.AWS_REGION,
});

/**
 * Lambda@Edge handler for WebP image conversion
 */
export const handler = async (event: CloudFrontRequestEvent) => {
  const request = event.Records[0].cf.request;
  const uri = request.uri;

  // Check WebP support using case-insensitive header check
  const acceptHeader = request.headers["accept"]?.[0]?.value ?? "";
  const supportsWebP = acceptHeader.toLowerCase().includes("image/webp");

  // Process if the request is for an image and browser supports WebP
  if (supportsWebP && IMAGE_EXTENSION_PATTERN.test(uri)) {
    // Extract bucket information from origin
    const s3Origin = request.origin?.s3;
    if (!s3Origin?.domainName) {
      return request;
    }

    const bucketName = s3Origin.domainName.split(".")[0];
    const webpKey = uri.startsWith("/")
      ? uri.slice(1) + ".webp"
      : uri + ".webp";

    try {
      // Check if WebP version exists
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: webpKey,
        })
      );

      // WebP exists, modify request
      request.headers["x-original-uri"] = [
        {
          key: "x-original-uri",
          value: uri,
        },
      ];
      request.uri = `${uri}.webp`;
    } catch (error) {
      if (error instanceof NotFound) {
        // WebP file doesn't exist, silently use original image
        return request;
      }

      // Log other errors
      console.error("Error checking WebP existence:", {
        region: process.env.AWS_REGION,
        bucket: bucketName,
        key: webpKey,
        error: error as S3ServiceException,
      });
    }
  }

  return request;
};

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
  const viewerAcceptWebP = acceptHeader.split(",").some((type) => {
    const [mimeType, params = ""] = type.trim().split(";");

    if (mimeType === "image/webp") {
      return true;
    }

    const qMatch = params.match(/q=([0-9.]+)/);
    const q = qMatch ? parseFloat(qMatch[1]) : 1.0;

    if (q < 1) {
      return false;
    }

    return mimeType === "*/*" || mimeType === "image/*";
  });

  console.debug({
    message: "WebP support check completed",
    uri,
    viewerAcceptWebP,
    acceptHeader,
  });

  // Process if the request is for an image and browser supports WebP
  if (viewerAcceptWebP && IMAGE_EXTENSION_PATTERN.test(uri)) {
    // Extract bucket information from origin
    const s3Origin = request.origin?.s3;
    if (!s3Origin?.domainName) {
      console.debug({
        message: "S3 origin not found",
        uri,
      });

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

      console.debug({
        message: "WebP version found and request modified",
        originalUri: uri,
        newUri: request.uri,
      });
    } catch (error) {
      if (error instanceof NotFound) {
        // WebP file doesn't exist, silently use original image
        console.debug({
          message: "WebP version not found, using original image",
          uri,
          webpKey,
        });
        return request;
      }

      // Log other errors
      console.error({
        message: "Error checking WebP existence",
        region: process.env.AWS_REGION,
        bucket: bucketName,
        key: webpKey,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorType: error instanceof S3ServiceException ? error.name : "Unknown",
      });
    }
  } else {
    console.debug({
      message: "Skipping WebP processing",
      uri,
      isImage: IMAGE_EXTENSION_PATTERN.test(uri),
      supportsWebP: viewerAcceptWebP,
    });
  }

  return request;
};

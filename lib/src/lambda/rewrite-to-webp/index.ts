import { CloudFrontRequestEvent, CloudFrontRequest } from "aws-lambda";
import * as https from "https";

// Constants
const TIMEOUT_MS = 2000;
const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png)$/i;

// Types
type WebPCheckResult = {
  availableWebP: boolean;
  error?: Error;
};

/**
 * Lambda@Edge handler for WebP image conversion
 */
export const handler = async (event: CloudFrontRequestEvent) => {
  const request = event.Records[0].cf.request;
  const uri = request.uri;

  // Check WebP support using the same logic as CloudFront Functions
  const acceptHeader = request.headers.accept?.[0]?.value ?? "";
  const supportsWebP = acceptHeader.includes("image/webp");

  // Process if the request is for an image and browser supports WebP
  if (supportsWebP && IMAGE_EXTENSION_PATTERN.test(uri)) {
    const webpCheckResult = await checkWebpAvailability(request);

    if (webpCheckResult.availableWebP) {
      // Store original URI in header
      request.headers["x-original-uri"] = [
        {
          key: "x-original-uri",
          value: uri,
        },
      ];
      request.uri = `${uri}.webp`;
    }
  }

  return request;
};

/**
 * Check if WebP version of the image is available
 */
async function checkWebpAvailability(
  request: CloudFrontRequest
): Promise<WebPCheckResult> {
  if (!request.origin?.s3?.domainName) {
    return { availableWebP: false };
  }

  try {
    const exists = await objectExists(
      request.origin.s3.domainName,
      `${request.uri}.webp`
    );

    return { availableWebP: exists };
  } catch (error) {
    console.error("Error checking WebP existence:", error);
    return {
      availableWebP: false,
      error: error instanceof Error ? error : new Error("Unknown error"),
    };
  }
}

/**
 * Check if object exists in S3 bucket
 */
function objectExists(domainName: string, path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: domainName,
        path: path,
        method: "HEAD",
        timeout: TIMEOUT_MS,
      },
      (response) => {
        if (response.statusCode === undefined) {
          reject(new Error("Status code is undefined"));
          return;
        }
        resolve(response.statusCode >= 200 && response.statusCode < 300);
      }
    );

    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy();
      reject(new Error(`Request timeout after ${TIMEOUT_MS}ms`));
    });

    request.end();
  });
}

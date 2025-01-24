import { Callback, CloudFrontResponseEvent, Context } from "aws-lambda";

export const handler = (
  event: CloudFrontResponseEvent,
  context: Context,
  callback: Callback
) => {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;

  console.log(JSON.stringify(response, null, 2));
  console.log(JSON.stringify(request, null, 2));

  // Check if it's a 404 for WebP image and has original URI
  if (
    response.status === "404" &&
    request.headers["x-original-uri"]?.[0]?.value
  ) {
    // Fallback to original image
    const newResponse = {
      status: "302", // Temporary redirect
      statusDescription: "Found",
      headers: {
        ...response.headers,
        location: [
          {
            key: "Location",
            value: request.headers["x-original-uri"][0].value,
          },
        ],
      },
    };

    callback(null, newResponse);
    return;
  }

  callback(null, response);
};

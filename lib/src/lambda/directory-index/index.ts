import { Callback, CloudFrontRequestEvent, Context } from "aws-lambda";

export const handler = (
  event: CloudFrontRequestEvent,
  context: Context,
  callback: Callback
) => {
  const request = event.Records[0].cf.request;
  const uri = request.uri;

  // Check whether the URI is missing a file name.
  if (uri.endsWith("/")) {
    request.uri += "index.html";
  }
  // Check whether the URI is missing a file extension.
  else if (!uri.includes(".")) {
    request.uri += "/index.html";
  }

  callback(null, request);
};

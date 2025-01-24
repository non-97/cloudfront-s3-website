async function handler(event) {
  const request = event.request;
  const uri = request.uri;

  // Check WebP support in Accept header
  const headers = request.headers;
  const acceptHeader = headers.accept ? headers.accept.value : '';
  const supportsWebP = acceptHeader.includes('image/webp');

  // Regular expression for image extensions
  const imageExtRegex = /\.(jpe?g|png)$/i;

  if (supportsWebP && imageExtRegex.test(uri)) {
    // Add custom header to track WebP conversion attempt
    request.headers['x-original-uri'] = {
      value: uri
    };
    // Append .webp to the URI for supported browsers
    request.uri = `${uri}.webp`;
  }
  // Handle .webp requests for non-supporting browsers
  else if (uri.endsWith('.webp') && !supportsWebP) {
    // Remove .webp extension to get original image
    request.uri = uri.slice(0, -5);
  }

  return request;
}

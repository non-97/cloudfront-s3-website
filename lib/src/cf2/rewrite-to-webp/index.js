async function handler(event) {
  const request = event.request;
  const uri = request.uri;

  // Check WebP support in Accept header
  const headers = request.headers;
  const acceptHeader = headers.accept ? headers.accept.value : '';
  const viewerAcceptWebP = acceptHeader.split(',')
    .some(type => {
      const parts = type.trim().split(";");
      const mimeType = parts[0];
      const params = parts[1] || "";

      if (mimeType === 'image/webp') {
        return true;
      }

      const qMatch = params.match(/q=([0-9.]+)/);
      const q = qMatch ? parseFloat(qMatch[1]) : 1.0;

      if (q < 1) {
        return false;
      }

      return mimeType === '*/*' || mimeType === 'image/*';
    });

  // Regular expression for image extensions
  const imageExtRegex = /\.(jpe?g|png)$/i;

  if (viewerAcceptWebP && imageExtRegex.test(uri)) {
    // Add custom header to track WebP conversion attempt
    request.headers['x-original-uri'] = {
      value: uri
    };
    // Append .webp to the URI for supported browsers
    request.uri = `${uri}.webp`;
  }
  // Handle .webp requests for non-supporting browsers
  else if (uri.endsWith('.webp') && !viewerAcceptWebP) {
    // Remove .webp extension to get original image
    request.uri = uri.slice(0, -5);
  }

  return request;
}

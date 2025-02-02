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

  if (imageExtRegex.test(uri)) {
    request.headers['x-viewer-accept-webp'] = {
      value: `${viewerAcceptWebP}`
    };
  }

  return request;
}

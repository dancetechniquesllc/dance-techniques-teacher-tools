// Email clients need hosted pictures; never copy large base64 images into email HTML.
const bucket = 'newsletter-email-images';
const imagePattern = /data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}/gi;
const maxImageBytes = 10 * 1024 * 1024;
const maxTotalBytes = 25 * 1024 * 1024;
const signedImageLifetime = 365 * 24 * 60 * 60;
export async function prepareNewsletterEmailImages(messages, client) {
  const images = new Map();
  for (const message of messages) for (const match of String(message.html || '').matchAll(imagePattern)) images.set(match[0], match[1].toLowerCase());
  if (!images.size) return messages;
  if (images.size > 40) throw new Error('This newsletter has too many uploaded pictures. Please keep it to 40 or fewer. Nothing was sent.');
  const {data, error} = await client.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Please sign in before preparing newsletter pictures. Nothing was sent.');
  const media = client.storage.from(bucket);
  const urls = new Map();
  let totalBytes = 0;
  // Process sequentially so large image buffers are released before the next upload.
  for (const [source, type] of images) {
    const encoded = source.slice(source.indexOf(',') + 1);
    const estimatedBytes = Math.floor(encoded.length * 3 / 4);
    if (estimatedBytes > maxImageBytes + 2 || totalBytes + estimatedBytes > maxTotalBytes + 2) throw new Error('The uploaded newsletter pictures are too large. Use smaller pictures and retry. Nothing was sent.');
    let binary;
    try { binary = atob(encoded); } catch { throw new Error('A newsletter picture could not be read. Replace that picture and retry. Nothing was sent.'); }
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    binary = '';
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > maxImageBytes || totalBytes > maxTotalBytes) throw new Error('The uploaded newsletter pictures are too large. Use smaller pictures and retry. Nothing was sent.');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
    const extension = type === 'jpeg' || type === 'jpg' ? 'jpg' : type;
    const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    const path = `${data.user.id}/${hash}.${extension}`;
    const {error: uploadError} = await media.upload(path, bytes, {contentType,upsert:false,cacheControl:'3600'});
    if (uploadError && String(uploadError.statusCode || uploadError.status) !== '409') throw new Error('Newsletter pictures could not be uploaded. Your draft is unchanged and nothing was sent. Please retry.');
    const {data: signed, error: signError} = await media.createSignedUrl(path,signedImageLifetime);
    if (signError || !signed?.signedUrl || !/^https:\/\//i.test(signed.signedUrl)) throw new Error('Secure newsletter picture links could not be prepared. Your draft is unchanged and nothing was sent. Please retry.');
    // Escape URL characters for both HTML attributes and CSS url() contexts.
    urls.set(source,signed.signedUrl.replace(/['"<>\\\s]/g, character => `%${character.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}`));
  }
  return messages.map(message => ({...message,html:String(message.html || '').replace(imagePattern,source => urls.get(source) || source)}));
}

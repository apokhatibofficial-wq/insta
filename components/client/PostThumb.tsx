/* eslint-disable @next/next/no-img-element -- Instagram CDN URLs are signed and short-lived; no optimizer */

/** Instagram thumbnail behind the tile content (shade keeps captions readable). */
export function PostThumb({ src }: { src?: string | null }) {
  if (!src) return null;
  return (
    <>
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="post-thumb" />
      <span className="post-shade" aria-hidden />
    </>
  );
}

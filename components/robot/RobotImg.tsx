// Plain <img>: the layered artwork must not be re-encoded by an image optimizer.
import type { CSSProperties, ImgHTMLAttributes } from "react";

/** One robot layer: lossless WebP with the original PNG as fallback. */
export function RobotImg({
  name,
  alt = "",
  className = "robot-layer",
  style,
  ...rest
}: { name: string; alt?: string; className?: string; style?: CSSProperties } & Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet"
>) {
  return (
    <picture>
      <source srcSet={`/robot/${name}.webp`} type="image/webp" />
      <img src={`/robot/${name}.png`} alt={alt} className={className} style={style} draggable={false} {...rest} />
    </picture>
  );
}

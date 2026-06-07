import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  /** Tiny blurred placeholder URL displayed while the full image loads. */
  blurSrc?: string;
  /** Class applied to the wrapping element. */
  wrapperClassName?: string;
};

/**
 * Image with shimmer skeleton + optional low-res blur placeholder.
 * The wrapper must have an explicit size (aspect-ratio / fixed dims).
 */
export function LazyImage({
  src,
  blurSrc,
  wrapperClassName,
  className,
  loading = "lazy",
  decoding = "async",
  onLoad,
  alt = "",
  ...rest
}: Props) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn("relative overflow-hidden", wrapperClassName)}>
      {!loaded && (
        <div className="absolute inset-0 shimmer" aria-hidden="true" />
      )}
      {blurSrc && !loaded && (
        <img
          src={blurSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg"
        />
      )}
      {src && (
        <img
          {...rest}
          src={src}
          alt={alt}
          loading={loading}
          decoding={decoding}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e);
          }}
          className={cn(
            "relative w-full h-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </div>
  );
}
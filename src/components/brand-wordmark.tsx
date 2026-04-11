import clsx from "clsx";
import { BRAND_WORDMARK_PNG_URL, BRAND_WORDMARK_TEXT } from "../lib/brand-wordmark";

export function BrandWordmark({
  className,
  isDark = false,
}: {
  className?: string;
  isDark?: boolean;
}) {
  return (
    <img
      src={BRAND_WORDMARK_PNG_URL}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={clsx(
        "select-none",
        isDark &&
          "brightness-[1.04] [filter:drop-shadow(0_0_0.65px_rgba(255,248,237,0.92))_drop-shadow(0_0_5px_rgba(255,244,220,0.22))]",
        className,
      )}
      data-brand-text={BRAND_WORDMARK_TEXT}
    />
  );
}

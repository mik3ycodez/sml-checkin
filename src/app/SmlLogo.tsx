/**
 * SML's logo, from the locked files in public/brand. The one place that knows
 * the file names, the 2.1:1 size and the alt text. A plain <img>, not
 * next/image, which would make resized copies of the locked files. `decorative`
 * gives it alt="" for when text beside it already names the link.
 */
export function SmlLogo({
  variant,
  decorative = false,
  className,
}: {
  variant: "black" | "white";
  decorative?: boolean;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/sml-logo-${variant}.png`}
      alt={decorative ? "" : "Seattle Men in Leather"}
      width={210}
      height={100}
      className={className}
    />
  );
}

import Image from "next/image";

type StruxientLogoVariant = "mark" | "wordmark" | "lockup";
type StruxientLogoSize = "sm" | "md" | "lg";

type BrandAsset = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

const heightClasses: Record<StruxientLogoSize, string> = {
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
};

const BRAND_ASSETS = {
  mark: {
    src: "/brand/struxient-mark.png",
    width: 261,
    height: 265,
    alt: "Struxient",
  },
  lockup: {
    light: {
      src: "/brand/struxient-lockup-light.png",
      width: 1004,
      height: 265,
      alt: "Struxient",
    },
    dark: {
      src: "/brand/struxient-lockup-dark.png",
      width: 1004,
      height: 265,
      alt: "Struxient",
    },
  },
  wordmark: {
    light: {
      src: "/brand/struxient-wordmark-light.png",
      width: 705,
      height: 71,
      alt: "Struxient",
    },
    dark: {
      src: "/brand/struxient-wordmark-dark.png",
      width: 705,
      height: 71,
      alt: "Struxient",
    },
  },
} as const;

export function StruxientLogo({
  variant = "lockup",
  size = "md",
  className,
  priority = false,
}: {
  variant?: StruxientLogoVariant;
  size?: StruxientLogoSize;
  className?: string;
  priority?: boolean;
}) {
  if (variant === "mark") {
    return (
      <BrandImage
        asset={BRAND_ASSETS.mark}
        size={size}
        className={className}
        priority={priority}
      />
    );
  }

  if (variant === "wordmark") {
    return (
      <ThemeBrandImage
        light={BRAND_ASSETS.wordmark.light}
        dark={BRAND_ASSETS.wordmark.dark}
        size={size}
        className={className}
        priority={priority}
      />
    );
  }

  return (
    <ThemeBrandImage
      light={BRAND_ASSETS.lockup.light}
      dark={BRAND_ASSETS.lockup.dark}
      size={size}
      className={className}
      priority={priority}
    />
  );
}

function BrandImage({
  asset,
  size,
  className,
  priority,
}: {
  asset: BrandAsset;
  size: StruxientLogoSize;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={asset.src}
      alt={asset.alt}
      width={asset.width}
      height={asset.height}
      priority={priority}
      className={[heightClasses[size], "w-auto object-contain", className].filter(Boolean).join(" ")}
    />
  );
}

function ThemeBrandImage({
  light,
  dark,
  size,
  className,
  priority,
}: {
  light: BrandAsset;
  dark: BrandAsset;
  size: StruxientLogoSize;
  className?: string;
  priority?: boolean;
}) {
  const imageClassName = [heightClasses[size], "w-auto object-contain"].join(" ");

  return (
    <span className={["inline-flex items-center", className].filter(Boolean).join(" ")}>
      <Image
        src={light.src}
        alt={light.alt}
        width={light.width}
        height={light.height}
        priority={priority}
        className={[imageClassName, "dark:hidden"].join(" ")}
      />
      <Image
        src={dark.src}
        alt={dark.alt}
        width={dark.width}
        height={dark.height}
        priority={priority}
        className={[imageClassName, "hidden dark:block"].join(" ")}
      />
    </span>
  );
}

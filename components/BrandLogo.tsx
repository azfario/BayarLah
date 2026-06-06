import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  className?: string;
  href?: string;
  inverted?: boolean;
  label?: string;
  size?: number;
};

export default function BrandLogo({
  className = "",
  href = "/",
  inverted = false,
  label = "BayarLah",
  size = 36,
}: BrandLogoProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 font-semibold ${className}`}
      aria-label={label}
    >
      <span
        className={inverted ? "rounded-full bg-white p-0.5" : undefined}
        style={{ width: size, height: size }}
      >
        <Image
          src="/bayarlah-logo.svg"
          alt=""
          width={size}
          height={size}
          priority
          className="h-full w-full"
        />
      </span>
      <span>{label}</span>
    </Link>
  );
}

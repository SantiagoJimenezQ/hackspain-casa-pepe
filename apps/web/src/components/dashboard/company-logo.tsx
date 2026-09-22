import { cn } from "@/lib/utils";

type CompanyLogoProperties = {
  name: string;
  shortName: string;
  accent: string;
  logo?: string;
  className?: string;
};

/**
 * Original vector marks keep their colours on a light plate in either theme.
 */
export function CompanyLogo({ name, shortName, accent, logo, className }: CompanyLogoProperties) {
  if (logo) {
    return (
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-logo-plate p-[3px] shadow-sm",
          className,
        )}
        style={{ borderColor: "var(--logo-plate-border)" }}
      >
        <span
          role="img"
          aria-label={name}
          className="size-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${logo})` }}
        />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white shadow-sm ring-1 ring-black/10 dark:ring-white/20",
        className,
      )}
      style={{ background: accent }}
    >
      {shortName[0]}
    </span>
  );
}

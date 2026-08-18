import { cn } from "@/lib/utils";

interface LogoProps {
  name: string;
  logoUrl?: string | null;
  className?: string;
  showWordmark?: boolean;
}

export function Logo({ name, logoUrl, className, showWordmark = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {logoUrl ? (
        <img src={logoUrl} alt={`${name} logo`} className="h-8 w-8 rounded-lg object-cover" />
      ) : (
        <span className="brand-gradient-bg glow-shadow grid h-8 w-8 place-items-center rounded-lg">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="M8 4v16M8 12l7-8M8 12l7 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary-foreground"
            />
          </svg>
        </span>
      )}
      {showWordmark ? (
        <span className="font-display text-lg font-bold tracking-tight uppercase">{name}</span>
      ) : null}
    </span>
  );
}

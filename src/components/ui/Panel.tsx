import { cn } from "@/lib/utils";

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  code?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  brackets?: boolean;
  noPadding?: boolean;
  children: React.ReactNode;
}

export function Panel({
  title,
  code,
  subtitle,
  actions,
  brackets = false,
  noPadding = false,
  children,
  className,
  ...props
}: PanelProps) {
  return (
    <div
      className={cn(
        "bg-[#0C1013] border border-[#1C252C] rounded-[2px] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.45)]",
        brackets && "aegis-brackets",
        className
      )}
      {...props}
    >
      {(title || actions || code) && (
        <div className="px-3.5 py-2 border-b border-[#1C252C] bg-[#080B0D] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {code && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[#11161B] border border-[#24303A] text-[#38BDF8] rounded-[2px] tracking-widest shrink-0">
                {code}
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[#C5D1DC] uppercase truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="font-mono text-[9px] text-[#53616E] tracking-wider uppercase truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn("flex-1 flex flex-col min-h-0", !noPadding && "p-3.5")}>
        {children}
      </div>
    </div>
  );
}

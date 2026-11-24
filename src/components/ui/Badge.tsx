import { cn } from "@/lib/utils";

export type BadgeVariant = 'green' | 'cyan' | 'amber' | 'red' | 'blue' | 'gray';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  green: "bg-[#12271B] border-[#265438] text-[#4ADE80]",
  cyan: "bg-[#0F2430] border-[#1E4B63] text-[#38BDF8]",
  blue: "bg-[#112333] border-[#224563] text-[#38BDF8]",
  amber: "bg-[#281E0E] border-[#594019] text-[#F59E0B]",
  red: "bg-[#2A1215] border-[#5B2329] text-[#F87171]",
  gray: "bg-[#141A1F] border-[#25303A] text-[#8B98A5]",
};

const dotColors: Record<BadgeVariant, string> = {
  green: "bg-[#3ECF72]",
  cyan: "bg-[#38BDF8]",
  blue: "bg-[#38BDF8]",
  amber: "bg-[#F59E0B]",
  red: "bg-[#EF4444]",
  gray: "bg-[#53616E]",
};

export function Badge({
  variant = 'gray',
  dot = false,
  pulse = false,
  children,
  className,
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-[2px] text-[10px] font-mono font-medium tracking-wider uppercase select-none",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            dotColors[variant],
            pulse && "animate-pulse"
          )}
        />
      )}
      {children}
    </div>
  );
}

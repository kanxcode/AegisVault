import { cn } from "@/lib/utils";
import { Panel } from "./Panel";

interface ChartContainerProps {
  title: string;
  code?: string;
  subtitle?: string;
  legend?: { label: string; color: string }[];
  actions?: React.ReactNode;
  heightClass?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartContainer({
  title,
  code,
  subtitle,
  legend,
  actions,
  heightClass = "h-[280px]",
  children,
  className,
}: ChartContainerProps) {
  return (
    <Panel
      title={title}
      code={code}
      subtitle={subtitle}
      actions={
        <div className="flex items-center gap-3">
          {legend && legend.length > 0 && (
            <div className="hidden sm:flex items-center gap-3 font-mono text-[10px]">
              {legend.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5 text-[#8B98A5]">
                  <span className="w-2.5 h-0.5 inline-block" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
          {actions}
        </div>
      }
      className={cn(className)}
    >
      <div className={cn("w-full relative", heightClass)}>
        {children}
      </div>
    </Panel>
  );
}


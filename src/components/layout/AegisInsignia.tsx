import { cn } from "@/lib/utils";

export function AegisInsignia({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-7 h-7 shrink-0", className)}
      aria-hidden="true"
    >
      {/* Outer octagonal facility containment frame */}
      <polygon
        points="11,2 25,2 34,11 34,25 25,34 11,34 2,25 2,11"
        stroke="#2A3844"
        strokeWidth="1.25"
        fill="#080B0D"
      />
      {/* Inner orbital telemetry ring */}
      <circle
        cx="18"
        cy="18"
        r="10"
        stroke="#38BDF8"
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeDasharray="3 2.5"
      />
      {/* Shield / vault core chevron */}
      <path
        d="M18 7.5L26 12V18.8C26 23.4 22.5 27.1 18 28.5C13.5 27.1 10 23.4 10 18.8V12L18 7.5Z"
        stroke="#3ECF72"
        strokeWidth="1.4"
        fill="#12271B"
        fillOpacity="0.65"
      />
      {/* Core center node */}
      <circle cx="18" cy="18" r="2.2" fill="#3ECF72" />
      <path d="M18 11V14.5M18 21.5V25M12.5 18H15M21 18H23.5" stroke="#38BDF8" strokeWidth="1.1" strokeOpacity="0.8" />
    </svg>
  );
}


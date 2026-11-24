import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "CONFIRM",
  cancelLabel = "CANCEL",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-[#050708]/85 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0C1013] border border-[#2A3844] rounded-[2px] max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 aegis-brackets">
        <div className="flex items-center justify-between border-b border-[#1C252C] pb-3">
          <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-wider uppercase text-[#E6EDF3]">
            <AlertTriangle className={destructive ? "w-4 h-4 text-[#F87171]" : "w-4 h-4 text-[#F59E0B]"} />
            <span>{title}</span>
          </div>
          <button
            onClick={onCancel}
            className="text-[#53616E] hover:text-[#E6EDF3] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="font-mono text-xs text-[#8B98A5] leading-relaxed">
          {description}
        </p>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1C252C]">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 bg-[#11161B] hover:bg-[#171E24] border border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3] font-mono text-xs rounded-[2px] transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              destructive
                ? "h-8 px-4 bg-[#2A1215] hover:bg-[#3A191D] border border-[#5B2329] text-[#F87171] font-mono text-xs font-bold rounded-[2px] transition-colors cursor-pointer"
                : "h-8 px-4 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-mono text-xs font-bold rounded-[2px] transition-colors cursor-pointer"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}


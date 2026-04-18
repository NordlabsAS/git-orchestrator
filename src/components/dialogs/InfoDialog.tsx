import { useUiStore } from "../../stores/uiStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export function InfoDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  const open = dialog?.kind === "info";

  return (
    <Dialog
      open={open}
      onClose={close}
      title={open ? dialog.title : ""}
      wide
      footer={
        <Button variant="primary" onClick={close}>
          OK
        </Button>
      }
    >
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-surface-2 p-3 font-mono text-xs text-zinc-200">
        {open ? dialog.body : ""}
      </pre>
    </Dialog>
  );
}

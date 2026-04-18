import { useUiStore } from "../../stores/uiStore";
import { GitErrorPanel } from "../errors/GitErrorPanel";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export function GitErrorDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  const open = dialog?.kind === "gitError";
  if (!open || dialog?.kind !== "gitError") return null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={dialog.title}
      wide
      footer={
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
      }
    >
      <GitErrorPanel error={dialog.error} repoId={dialog.repoId} />
    </Dialog>
  );
}

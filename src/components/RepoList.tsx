import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Folders } from "lucide-react";
import { useReposStore } from "../stores/reposStore";
import { RepoRow } from "./RepoRow";

export function RepoList() {
  const statuses = useReposStore((s) => s.statuses);
  const reorder = useReposStore((s) => s.reorder);
  const loading = useReposStore((s) => s.loading);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (loading && statuses.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading repos…
      </div>
    );
  }

  if (statuses.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-zinc-400">
        <Folders size={40} className="text-zinc-600" />
        <div className="text-lg font-semibold text-zinc-200">No repos yet</div>
        <p className="max-w-sm text-sm text-zinc-400">
          Click <span className="text-zinc-200">Add repo</span> in the sidebar to
          register a local git repository. It will appear here with status, ahead/behind counts and
          one-click fetch & pull.
        </p>
      </div>
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = statuses.findIndex((s) => s.id === active.id);
    const to = statuses.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(statuses, from, to).map((s) => s.id);
    void reorder(next);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {statuses.map((s) => (
            <RepoRow key={s.id} status={s} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

import { Panel } from "@/components/dashboard/panel";

export function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Panel className="max-w-lg p-8 text-center">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Casa Pepe
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Esta vista se conectará al mismo snapshot cuando el backend esté
          listo. Por ahora el diseño completo vive en Visión general.
        </p>
      </Panel>
    </div>
  );
}

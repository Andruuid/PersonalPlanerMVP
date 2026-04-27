import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PagePlaceholderProps {
  caption: string;
  title: string;
  description: string;
  phase: string;
}

export function PagePlaceholder({
  caption,
  title,
  description,
  phase,
}: PagePlaceholderProps) {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {caption}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
            {title}
          </h1>
          <Badge variant="outline" className="rounded-full">
            {phase}
          </Badge>
        </div>
        <p className="max-w-2xl text-sm text-neutral-600">{description}</p>
      </header>

      <Card className="border-dashed bg-white/60">
        <CardContent className="space-y-3 py-10 text-center">
          <p className="text-sm font-medium text-neutral-700">
            Diese Seite wird in einer späteren Phase ausgebaut.
          </p>
          <p className="text-xs text-neutral-500">
            Foundation-Phase: App-Shell, Auth und Datenmodell stehen.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

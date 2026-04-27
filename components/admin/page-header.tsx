interface PageHeaderProps {
  caption: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({
  caption,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {caption}
        </p>
        <h1 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-neutral-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

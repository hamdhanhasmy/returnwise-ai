export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-[34px]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

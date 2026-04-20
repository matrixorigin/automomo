export function Totals({
  items
}: {
  items: { label: string; value: string | number; caption: string }[];
}) {
  return (
    <section className="totals" aria-label="Workspace summary">
      {items.map((item) => (
        <div key={item.label}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
          <span>{item.caption}</span>
        </div>
      ))}
    </section>
  );
}

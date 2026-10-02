/** Small print: when it happened and what it belongs to. */
export function CommunicationMeta({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="comm__meta" aria-label="Details">
      {items.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

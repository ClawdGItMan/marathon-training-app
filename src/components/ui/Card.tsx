export function Card({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={className ? `card ${className}` : "card"}>{children}</div>
  );
}

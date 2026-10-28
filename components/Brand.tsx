export function Brand({ size = 12 }: { size?: number }) {
  return (
    <div className="brand" style={{ fontSize: size }} aria-label="KHATIB TECHNICAL SOLUTIONS">
      <b>KHATIB</b>
      <span>TECHNICAL SOLUTIONS</span>
    </div>
  );
}

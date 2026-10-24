// Illustration vectorielle (pas une photo) : sert de logo et de visuel de remplacement.
export function PizzaMark({ className = "", spin = false }: { className?: string; spin?: boolean }) {
  const pep = [[100, 60], [138, 82], [142, 124], [104, 142], [64, 128], [60, 84], [100, 100]];
  return (
    <svg viewBox="0 0 200 200" className={`${className} ${spin ? "spin-slow" : ""}`} role="img" aria-label="Illustration d'une pizza">
      <circle cx="100" cy="100" r="96" fill="#d9a04a" />
      <circle cx="100" cy="100" r="86" fill="#c42e1a" />
      <path d="M30 100c8-40 40-62 70-62s62 22 70 62c-8 38-40 62-70 62s-62-24-70-62z" fill="#f6d27b" opacity=".92" />
      {pep.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="11" fill="#a3200f" stroke="#7f1709" strokeWidth="1.5" />
      ))}
      {[[84, 78, 20], [122, 108, 140], [80, 120, 250], [112, 62, 80]].map(([x, y, r], i) => (
        <path key={i} d="M0 0c6-10 18-10 24 0-6 10-18 10-24 0z" fill="#2d6a3e" transform={`translate(${x} ${y}) rotate(${r})`} />
      ))}
      <g stroke="#fbf3e4" strokeWidth="2" opacity=".55">
        <path d="M100 14v172M14 100h172M39 39l122 122M161 39L39 161" />
      </g>
    </svg>
  );
}

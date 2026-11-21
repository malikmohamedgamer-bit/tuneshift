import { useMemo } from 'react';

/** Decorative falling petals for the Cherry Blossom theme (pointer-events none, reduced-motion aware via CSS). */
export function Petals({ count = 14 }: { count?: number }) {
  const petals = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 73) % 100,
        delay: (i * 1.7) % 12,
        duration: 11 + ((i * 3.1) % 9),
        size: 8 + ((i * 5) % 9),
      })),
    [count],
  );
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {petals.map((p, i) => (
        <span
          key={i}
          className="absolute -top-6 block rounded-[60%_0_60%_0] bg-pink-100/70"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.8,
            animation: `ts-petal-fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

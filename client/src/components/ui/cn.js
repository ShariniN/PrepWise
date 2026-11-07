// Tiny className joiner: cn('a', cond && 'b', undefined) -> 'a b'
export const cn = (...parts) => parts.flat().filter(Boolean).join(' ');

import { formatNaira, formatPercent } from '../../lib/format';
import { useAnimatedNumber } from '../../lib/useAnimatedNumber';

interface Props {
  value: number;
  from?: number;
  format?: 'naira' | 'percent' | 'plain';
  delay?: number;
  className?: string;
}

const formatters = {
  naira: formatNaira,
  percent: formatPercent,
  plain: (n: number) => Math.round(n).toLocaleString('en-NG'),
};

/** Counts toward `value`. Screen readers get the final value only. */
export function AnimatedNumber({ value, from, format = 'naira', delay, className = '' }: Props) {
  const display = useAnimatedNumber(value, { from, delay });
  const fmt = formatters[format];
  return (
    <span className={`num ${className}`}>
      <span aria-hidden>{fmt(display)}</span>
      <span className="visually-hidden">{fmt(value)}</span>
    </span>
  );
}

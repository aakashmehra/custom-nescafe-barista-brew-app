import Svg, { Circle, Path } from 'react-native-svg';

type P = { color: string; size?: number; filled?: boolean };
const line = (color: string) => ({
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export const BlackIcon = ({ color, size = 24, filled }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 8 H17 V14 A5 5 0 0 1 12 19 H9 A5 5 0 0 1 4 14 Z" {...line(color)} fill={filled ? color : 'none'} />
    <Path d="M17 10 H18.5 A2.5 2.5 0 0 1 18.5 15 H16.5" {...line(color)} />
  </Svg>
);

export const LatteIcon = ({ color, size = 24, filled }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 5 H18 L16.5 20 H7.5 Z" {...line(color)} fill={filled ? color : 'none'} />
    <Path d="M6.6 10 H17.4" {...line(color)} />
  </Svg>
);

export const TeaIcon = ({ color, size = 24, filled }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 19 C5 10 10 5 19 5 C19 14 14 19 5 19 Z" {...line(color)} fill={filled ? color : 'none'} />
    {!filled && <Path d="M5 19 L13 11" {...line(color)} />}
  </Svg>
);

/** Takeaway cup. */
export const ToGoIcon = ({ color, size = 24, filled }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M7 8 L8.3 21 H15.7 L17 8 Z" {...line(color)} fill={filled ? color : 'none'} />
    <Path d="M5.5 8 H18.5 M7 8 L7.6 5 H16.4 L17 8" {...line(color)} />
  </Svg>
);

export const StarIcon = ({ color, size = 24, filled }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 3.5 L14.6 8.9 L20.5 9.6 L16.1 13.6 L17.3 19.5 L12 16.6 L6.7 19.5 L7.9 13.6 L3.5 9.6 L9.4 8.9 Z"
      {...line(color)}
      fill={filled ? color : 'none'}
    />
  </Svg>
);

export const GearIcon = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 2.8 L14 4.6 L16.6 4 L17.5 6.5 L20 7.4 L19.4 10 L21.2 12 L19.4 14 L20 16.6 L17.5 17.5 L16.6 20 L14 19.4 L12 21.2 L10 19.4 L7.4 20 L6.5 17.5 L4 16.6 L4.6 14 L2.8 12 L4.6 10 L4 7.4 L6.5 6.5 L7.4 4 L10 4.6 Z"
      {...line(color)}
    />
    <Circle cx={12} cy={12} r={3.2} {...line(color)} />
  </Svg>
);

export const InfoIcon = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...line(color)} />
    <Path d="M12 11 V16.5" {...line(color)} />
    <Circle cx={12} cy={7.8} r={1.1} fill={color} />
  </Svg>
);

export const BackIcon = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M15 5 L8 12 L15 19" {...line(color)} />
  </Svg>
);

/** Coffee powder jar; fill height shows the level. */
export const JarIcon = ({ color, size = 16, level }: P & { level: 'ok' | 'low' | 'empty' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {level !== 'empty' && <Path d={level === 'ok' ? 'M7 10 H17 V19 H7 Z' : 'M7 16 H17 V19 H7 Z'} fill={color} />}
    <Path d="M6 7 H18 V19 Q18 21 16 21 H8 Q6 21 6 19 Z M8 3 H16 V7 H8 Z" {...line(color)} />
  </Svg>
);

export const MenuIcon = ({ color, size = 24, filled }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 9 H16 V14 A5 5 0 0 1 11 19 H10 A5 5 0 0 1 5 14 Z" {...line(color)} fill={filled ? color : 'none'} />
    <Path d="M16 10.5 H17.5 A2.2 2.2 0 0 1 17.5 15 H15.6 M8 3.5 C7 5 9 5.5 8 7 M12 3.5 C11 5 13 5.5 12 7" {...line(color)} />
  </Svg>
);

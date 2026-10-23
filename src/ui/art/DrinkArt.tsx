import Svg, { Circle, Ellipse, Path, Rect, Text } from 'react-native-svg';
import { drinkShapes, type El } from './drinks';

const PARTS = { path: Path, rect: Rect, circle: Circle, ellipse: Ellipse } as const;

function Part({ el }: { el: El }) {
  if (el.t === 'text') return <Text {...el.a}>{el.text}</Text>;
  const Comp = PARTS[el.t] as unknown as React.ComponentType<Record<string, string | number>>;
  return <Comp {...el.a} />;
}

/** Renders plain shape data (see drinks.ts / machineShapes.ts) inside an existing <Svg>. */
export function Shapes({ els }: { els: El[] }) {
  return (
    <>
      {els.map((el, i) => (
        <Part key={i} el={el} />
      ))}
    </>
  );
}

/** Flat illustration of a drink in its vessel. Unknown ids get a generic cup. */
export function DrinkArt({ capsuleId, size }: { capsuleId: number; size: number }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Shapes els={drinkShapes(capsuleId)} />
    </Svg>
  );
}

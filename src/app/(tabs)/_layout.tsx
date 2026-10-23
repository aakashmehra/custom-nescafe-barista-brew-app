import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useMachine } from '../../state/MachineProvider';
import { useTheme } from '../../ui/theme';

const TABS = {
  black: { label: 'Black', icon: 'cup.and.saucer.fill' },
  latte: { label: 'Latte', icon: 'mug.fill' },
  tea: { label: 'Tea', icon: 'leaf.fill' },
  starbucks: { label: 'Starbucks', icon: 'takeoutbag.and.cup.and.straw.fill' },
  menu: { label: 'Menu', icon: 'list.bullet' },
  favorites: { label: 'Favorites', icon: 'star.fill' },
} as const;

type TabName = keyof typeof TABS;
const DOLCE_TABS: TabName[] = ['black', 'latte', 'tea', 'starbucks', 'favorites'];
const BARISTA_TABS: TabName[] = ['menu', 'favorites'];

/**
 * Uses the platform tab bar instead of a hand-built imitation. On iOS 26 this
 * is rendered by the system with Liquid Glass; other platforms keep their
 * native tab treatment.
 */
export default function TabsLayout() {
  const m = useMachine();
  const t = useTheme();
  if (!m.machine) return <Redirect href="/" />;
  const visible = m.machine.family === 'barista' ? BARISTA_TABS : DOLCE_TABS;

  return (
    <NativeTabs
      iconColor={{ default: t.muted, selected: t.fg }}
      disableTransparentOnScrollEdge>
      {(Object.keys(TABS) as TabName[]).map((name) => {
        const tab = TABS[name];
        return (
          <NativeTabs.Trigger key={name} name={name} hidden={!visible.includes(name)} contentStyle={{ backgroundColor: t.bg }}>
            <NativeTabs.Trigger.Icon sf={tab.icon} />
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        );
      })}
    </NativeTabs>
  );
}

import type { ImageSourcePropType } from 'react-native';

export type AppIcon = {
  id: string;
  name: string;
  /** Native alternate-icon name from the `expo-alternate-app-icons` plugin in app.json; null = primary icon. */
  native: string | null;
  preview: ImageSourcePropType;
};

// Order = picker order. Keep `native` names in sync with the plugin entries in app.json.
export const APP_ICONS: readonly AppIcon[] = [
  { id: 'classic', name: 'Classic', native: null, preview: require('../../../assets/icons/classic.png') },
  { id: 'inverted', name: 'Inverted', native: 'Inverted', preview: require('../../../assets/icons/inverted.png') },
  { id: 'espresso', name: 'Espresso', native: 'Espresso', preview: require('../../../assets/icons/espresso.png') },
  { id: 'latte', name: 'Latte', native: 'Latte', preview: require('../../../assets/icons/latte.png') },
  { id: 'iced', name: 'Iced', native: 'Iced', preview: require('../../../assets/icons/iced.png') },
  { id: 'matcha', name: 'Matcha', native: 'Matcha', preview: require('../../../assets/icons/matcha.png') },
  { id: 'bean', name: 'Bean', native: 'Bean', preview: require('../../../assets/icons/bean.png') },
  { id: 'capsule', name: 'Capsule', native: 'Capsule', preview: require('../../../assets/icons/capsule.png') },
  { id: 'machine', name: 'Machine', native: 'Machine', preview: require('../../../assets/icons/machine.png') },
  { id: 'mocha', name: 'Mocha', native: 'Mocha', preview: require('../../../assets/icons/mocha.png') },
  { id: 'night', name: 'Night', native: 'Night', preview: require('../../../assets/icons/night.png') },
  { id: 'pourover', name: 'Pour Over', native: 'PourOver', preview: require('../../../assets/icons/pourover.png') },
];

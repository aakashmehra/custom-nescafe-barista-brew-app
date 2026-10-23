import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMachine } from '../state/MachineProvider';
import { BackIcon, InfoIcon, StarIcon } from './Icons';
import { Button, Glass, IconButton, Pill, Press, Text } from './kit';
import { font, useTheme } from './theme';

// Pieces shared by the Dolce Gusto and Barista drink pages.

export function DrinkTopBar({
  starred,
  accent,
  onStar,
  onInfo,
}: {
  starred: boolean;
  accent: string;
  onStar: () => void;
  onInfo: () => void;
}) {
  const m = useMachine();
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconButton label="Back" onPress={() => router.back()}>
        <BackIcon color={t.fg} />
      </IconButton>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>{m.kind === 'demo' && <Pill label="Demo" />}</View>
      <IconButton label={starred ? 'Remove from favorites' : 'Add to favorites'} onPress={onStar}>
        <StarIcon color={starred ? accent : t.fg} filled={starred} size={22} />
      </IconButton>
      <IconButton label="How to make" onPress={onInfo}>
        <InfoIcon color={t.fg} />
      </IconButton>
    </View>
  );
}

/** Label + value with − / + buttons, one compact row. */
export function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
  canMinus,
  canPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  canMinus: boolean;
  canPlus: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text variant="caption" muted style={{ flex: 1 }}>
        {label}
      </Text>
      <StepButton label="−" small disabled={!canMinus} onPress={onMinus} />
      <Text variant="headline" style={{ minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <StepButton label="+" small disabled={!canPlus} onPress={onPlus} />
    </View>
  );
}

export function StepButton({
  label,
  onPress,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  small?: boolean;
}) {
  const d = small ? 40 : 52;
  return (
    <Press haptic="selection" onPress={onPress} disabled={disabled} accessibilityLabel={label === '+' ? 'More' : 'Less'}>
      <Glass radius={d / 2} interactive style={{ width: d, height: d, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant={small ? 'headline' : 'title'} weight={500}>
          {label}
        </Text>
      </Glass>
    </Press>
  );
}

export function NameSheet({
  visible,
  initial,
  accent,
  ink,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string;
  accent: string;
  ink: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} onShow={() => setValue(initial)}>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, justifyContent: 'flex-end', padding: 12, paddingBottom: insets.bottom + 12 }}>
        <Glass radius={32} style={{ padding: 24, gap: 16 }}>
          <Text variant="title">Save as favorite</Text>
          <Text muted>Give your drink a name, like “Morning flat white”.</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={() => onSave(value.trim() || initial)}
            placeholder={initial}
            placeholderTextColor={t.muted}
            style={{
              fontFamily: font[500],
              fontSize: 17,
              color: t.fg,
              backgroundColor: t.surfaceHi,
              borderRadius: 14,
              paddingHorizontal: 16,
              height: 50,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Cancel" kind="secondary" onPress={onCancel} style={{ flex: 1 }} />
            <Button
              title="Save"
              onPress={() => onSave(value.trim() || initial)}
              color={accent}
              textColor={ink}
              style={{ flex: 1 }}
            />
          </View>
        </Glass>
      </KeyboardAvoidingView>
    </Modal>
  );
}

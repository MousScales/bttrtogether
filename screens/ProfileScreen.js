import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ACCENT = '#007AFF';
const BG = '#F5F5F5';
const CARD = '#fff';
const TEXT = '#333';
const MUTED = '#666';

export default function ProfileScreen() {
  const [profile, setProfile] = useState({
    name: 'Phill',
    handle: '@bttrtogether',
    bio: 'Showing up daily — better together.',
    accountabilityCode: 'BTTR-4821',
  });

  const [prefs, setPrefs] = useState({
    reminders: true,
    friendNudges: true,
    weeklyRecap: false,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(profile);

  const buddies = useMemo(
    () => [
      { id: 1, name: 'Sarah M.', status: 'On a 5-day streak', avatar: '👩' },
      { id: 2, name: 'Mike R.', status: 'Checked in today', avatar: '👨' },
      { id: 3, name: 'Emma L.', status: '2 goals completed', avatar: '👧' },
    ],
    []
  );

  const stats = useMemo(
    () => [
      { label: 'Streak', value: '5d' },
      { label: 'Today', value: '3/5' },
      { label: 'Bets', value: '2' },
    ],
    []
  );

  const openEdit = () => {
    setDraft(profile);
    setEditOpen(true);
  };

  const saveEdit = () => {
    const name = (draft.name || '').trim();
    const handle = (draft.handle || '').trim();

    if (!name) {
      Alert.alert('Name required', 'Add a name to save your profile.');
      return;
    }
    if (!handle.startsWith('@')) {
      Alert.alert('Handle format', 'Your handle should start with "@".');
      return;
    }

    setProfile({
      ...profile,
      name,
      handle,
      bio: (draft.bio || '').trim(),
    });
    setEditOpen(false);
  };

  const shareCode = () => {
    Alert.alert('Invite code', `Share this code with a friend:\n\n${profile.accountabilityCode}`);
  };

  const signOut = () => {
    Alert.alert('Sign out', 'This is a UI placeholder for now.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header card */}
        <View style={[styles.card, styles.headerCard]}>
          <View style={styles.headerRow}>
            <View style={styles.avatarWrap}>
              <Image
                source={require('../assets/fsf.png')}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.headerText}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.handle}>{profile.handle}</Text>
              <Text style={styles.bio} numberOfLines={2}>
                {profile.bio}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.button, styles.primary, styles.buttonSpacer]}
              onPress={openEdit}
              activeOpacity={0.8}
            >
              <Text style={[styles.buttonText, styles.primaryText]}>Edit profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.secondary]} onPress={shareCode} activeOpacity={0.8}>
              <Text style={[styles.buttonText, styles.secondaryText]}>Share code</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {stats.map((s, idx) => (
            <View
              key={s.label}
              style={[styles.card, styles.statCard, idx !== stats.length - 1 && styles.statSpacer]}
            >
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Buddies */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Accountability buddies</Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Coming soon', 'Add buddies will plug into your friend system.')}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionAction}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {buddies.map((b, idx) => (
            <View key={b.id} style={[styles.rowItem, idx !== 0 && styles.rowItemBorder]}>
              <View style={styles.rowLeft}>
                <View style={styles.emojiAvatar}>
                  <Text style={styles.emojiAvatarText}>{b.avatar}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{b.name}</Text>
                  <Text style={styles.rowSub}>{b.status}</Text>
                </View>
              </View>
              <Text style={styles.chev}>›</Text>
            </View>
          ))}
        </View>

        {/* Preferences */}
        <Text style={styles.sectionTitleStandalone}>Preferences</Text>
        <View style={styles.card}>
          <PrefRow
            title="Daily reminders"
            subtitle="Get a nudge to check in"
            value={prefs.reminders}
            onChange={(v) => setPrefs((p) => ({ ...p, reminders: v }))}
          />
          <PrefRow
            title="Friend nudges"
            subtitle="Let buddies encourage you"
            value={prefs.friendNudges}
            onChange={(v) => setPrefs((p) => ({ ...p, friendNudges: v }))}
          />
          <PrefRow
            title="Weekly recap"
            subtitle="A quick progress summary"
            value={prefs.weeklyRecap}
            onChange={(v) => setPrefs((p) => ({ ...p, weeklyRecap: v }))}
          />
        </View>

        {/* Help / account */}
        <Text style={styles.sectionTitleStandalone}>Account</Text>
        <View style={styles.card}>
          <ActionRow
            title="Support"
            subtitle="Get help or report a bug"
            onPress={() => Alert.alert('Support', 'Wire this up to email or a help center.')}
          />
          <ActionRow
            title="Privacy"
            subtitle="Manage what friends can see"
            onPress={() => Alert.alert('Privacy', 'Privacy controls coming soon.')}
          />
          <ActionRow title="Sign out" danger subtitle="Placeholder" onPress={signOut} />
        </View>

        <Text style={styles.footer}>bttrTogether</Text>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit profile</Text>
              <TouchableOpacity onPress={() => setEditOpen(false)} style={styles.closeButton} activeOpacity={0.7}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Field
              label="Name"
              value={draft.name}
              onChangeText={(t) => setDraft((d) => ({ ...d, name: t }))}
              placeholder="Your name"
            />
            <Field
              label="Handle"
              value={draft.handle}
              onChangeText={(t) => setDraft((d) => ({ ...d, handle: t }))}
              placeholder="@handle"
              autoCapitalize="none"
            />
            <Field
              label="Bio"
              value={draft.bio}
              onChangeText={(t) => setDraft((d) => ({ ...d, bio: t }))}
              placeholder="A short line about you"
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.secondary, styles.modalButton, styles.buttonSpacer]}
                onPress={() => setEditOpen(false)}
              >
                <Text style={[styles.buttonText, styles.secondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.primary, styles.modalButton]} onPress={saveEdit}>
                <Text style={[styles.buttonText, styles.primaryText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function PrefRow({ title, subtitle, value, onChange }) {
  return (
    <View style={styles.prefRow}>
      <View style={styles.prefText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#D1D1D6', true: '#B9DBFF' }}
        thumbColor={value ? ACCENT : '#f4f3f4'}
      />
    </View>
  );
}

function ActionRow({ title, subtitle, onPress, danger }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.actionRow}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && styles.danger]}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
      </View>
      <Text style={styles.chev}>›</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, autoCapitalize }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholderTextColor="#999"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerCard: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
    marginRight: 14,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT,
  },
  handle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
  },
  bio: {
    marginTop: 6,
    fontSize: 14,
    color: TEXT,
    lineHeight: 18,
  },
  headerActions: {
    flexDirection: 'row',
    marginTop: 14,
  },
  buttonSpacer: {
    marginRight: 10,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  primary: {
    backgroundColor: ACCENT,
  },
  primaryText: {
    color: '#fff',
  },
  secondary: {
    backgroundColor: '#EEF6FF',
  },
  secondaryText: {
    color: ACCENT,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 6,
  },
  statSpacer: {
    marginRight: 10,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: TEXT,
  },
  sectionAction: {
    fontSize: 15,
    fontWeight: '800',
    color: ACCENT,
  },
  sectionTitleStandalone: {
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 4,
    fontSize: 18,
    fontWeight: '800',
    color: TEXT,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E9E9EE',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  emojiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emojiAvatarText: {
    fontSize: 18,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT,
  },
  rowSub: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
  },
  chev: {
    fontSize: 22,
    color: '#B0B0B8',
    marginLeft: 10,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  prefText: {
    flex: 1,
    paddingRight: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  danger: {
    color: '#D11A2A',
  },
  footer: {
    marginTop: 16,
    textAlign: 'center',
    color: '#9A9AA3',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  modalCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: TEXT,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: MUTED,
    fontWeight: '800',
  },
  field: {
    marginTop: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: MUTED,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  input: {
    backgroundColor: '#F6F7F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: TEXT,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#E7E7ED',
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 14,
  },
  modalButton: {
    flex: 1,
  },
});


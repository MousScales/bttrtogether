import { StyleSheet, Text, View } from 'react-native';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function DayDetailScreen({ route }) {
  const { year, monthIndex, day } = route.params || {};
  const monthName = MONTH_NAMES[monthIndex] ?? '';
  const dateLabel = [monthName, day, year].filter(Boolean).join(' ') || 'Select a day';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.dateText}>{dateLabel}</Text>
      </View>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderLabel}>
          Content from friends this day
        </Text>
        <Text style={styles.placeholderHint}>
          (Placeholder — will show what each friend achieved on this date)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  dateText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderLabel: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  placeholderHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

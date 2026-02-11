import { StyleSheet, Text, View } from 'react-native';

export default function MoneyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Money</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});





import { StyleSheet, Text, View, ScrollView, Dimensions, Image } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function BetsScreen() {
  // Generate list of months with their day counts
  const months = [
    { name: 'January', days: 31, image: require('../assets/31month.png') },
    { name: 'February', days: 28, image: require('../assets/28month.png') },
    { name: 'March', days: 31, image: require('../assets/31month.png') },
    { name: 'April', days: 30, image: require('../assets/30month.png') },
    { name: 'May', days: 31, image: require('../assets/31month.png') },
    { name: 'June', days: 30, image: require('../assets/30month.png') },
    { name: 'July', days: 31, image: require('../assets/31month.png') },
    { name: 'August', days: 31, image: require('../assets/31month.png') },
    { name: 'September', days: 30, image: require('../assets/30month.png') },
    { name: 'October', days: 31, image: require('../assets/31month.png') },
    { name: 'November', days: 30, image: require('../assets/30month.png') },
    { name: 'December', days: 31, image: require('../assets/31month.png') },
  ];

  return (
    <View style={styles.container}>
      {/* Continuous Scroll Through Months */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {months.map((month, index) => (
          <View key={month.name} style={styles.monthContainer}>
            {/* Month Header */}
            <View style={styles.monthHeader}>
              <Text style={styles.monthText}>{month.name}</Text>
            </View>
            
            {/* Month Image */}
            <Image 
              source={month.image} 
              style={styles.monthImage}
              resizeMode="contain"
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  monthContainer: {
    width: SCREEN_WIDTH,
    minHeight: SCREEN_HEIGHT * 0.8,
    paddingVertical: 20,
    alignItems: 'center',
  },
  monthHeader: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 2,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  monthText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  monthImage: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_HEIGHT * 0.7,
    marginTop: 20,
  },
});

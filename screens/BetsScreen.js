import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, Dimensions, Image } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MONTHS = [
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

const PAGE_HEIGHT = SCREEN_HEIGHT;

export default function BetsScreen() {
  const [currentYear] = useState(() => new Date().getFullYear());

  const renderMonth = useCallback(({ item: month, index }) => (
    <View style={[styles.monthPage, { height: PAGE_HEIGHT }]}>
      <View style={styles.monthHeader}>
        <Text style={styles.monthText}>{month.name}</Text>
        <Text style={styles.yearText}>{currentYear}</Text>
      </View>
      <Image
        source={month.image}
        style={styles.monthImage}
        resizeMode="contain"
      />
    </View>
  ), [currentYear]);

  const getItemLayout = useCallback(
    (_, index) => ({
      length: PAGE_HEIGHT,
      offset: PAGE_HEIGHT * index,
      index,
    }),
    []
  );

  const keyExtractor = useCallback((item) => item.name, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={MONTHS}
        renderItem={renderMonth}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={PAGE_HEIGHT}
        snapToAlignment="start"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  monthPage: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
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
  yearText: {
    fontSize: 18,
    color: '#666',
    marginTop: 4,
  },
  monthImage: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_HEIGHT * 0.65,
    marginTop: 20,
  },
});

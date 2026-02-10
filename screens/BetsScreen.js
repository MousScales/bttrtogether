import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, FlatList, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, {
  Circle,
  Line,
  Text as SvgText,
  G,
  Defs,
  RadialGradient,
  Stop,
} from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CIRCLE_R = 13;
const PADDING = 12;
const TOP_OFFSET = 78;
const BOTTOM_MARGIN = 24;

function getDaysInMonth(year, monthIndex) {
  if (monthIndex === 1) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[monthIndex] ?? 31;
}

function getTrailBounds(contentHeight) {
  const top = TOP_OFFSET + PADDING;
  const innerH = contentHeight - TOP_OFFSET - BOTTOM_MARGIN - 2 * PADDING;
  return { top, innerH: Math.max(innerH, 100) };
}

function getSmoothFlowPathPositions(count, contentWidth, contentHeight) {
  const w = contentWidth - 2 * PADDING;
  const { top, innerH } = getTrailBounds(contentHeight);
  const centerX = PADDING + w / 2;
  const amplitude = Math.max(0, w / 2 - CIRCLE_R - 4);
  const waves = 4;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const y = top + t * innerH;
    const x = centerX + amplitude * Math.sin(t * Math.PI * waves);
    positions.push({ x, y });
  }
  return positions;
}

function getWindingPathPositions(count, contentWidth, contentHeight) {
  const w = contentWidth - 2 * PADDING;
  const { top, innerH } = getTrailBounds(contentHeight);
  const segments = Math.max(count - 1, 1);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const t = i / segments;
    const y = top + t * innerH;
    const x = PADDING + w * (0.08 + 0.84 * (1 - Math.cos(t * Math.PI)));
    positions.push({ x, y });
  }
  return positions;
}

function MonthTrail({ monthIndex, monthName, year, contentHeight }) {
  const navigation = useNavigation();
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const dayCount = useMemo(
    () => getDaysInMonth(year, monthIndex),
    [year, monthIndex]
  );

  const contentWidth = SCREEN_WIDTH;

  const positions = useMemo(() => {
    const useSmoothFlow = monthIndex % 2 === 0;
    return useSmoothFlow
      ? getSmoothFlowPathPositions(dayCount, contentWidth, contentHeight)
      : getWindingPathPositions(dayCount, contentWidth, contentHeight);
  }, [monthIndex, dayCount, contentWidth, contentHeight]);

  const handleDayPress = useCallback(
    (day) => {
      navigation.navigate('DayDetail', { year, monthIndex, day });
    },
    [navigation, year, monthIndex]
  );

  return (
    <Svg width={contentWidth} height={contentHeight} style={styles.trailSvg}>
      <Defs>
        <RadialGradient id="sphereGrad" cx="38%" cy="32%" r="50%">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="65%" stopColor="#e8e8e8" stopOpacity="1" />
          <Stop offset="100%" stopColor="#b0b0b0" stopOpacity="1" />
        </RadialGradient>
      </Defs>
      {/* Trail: subtle shadow then main line */}
      {positions.slice(0, -1).map((_, i) => (
        <G key={`seg-${i}`}>
          <Line
            x1={positions[i].x + 1}
            y1={positions[i].y + 1}
            x2={positions[i + 1].x + 1}
            y2={positions[i + 1].y + 1}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Line
            x1={positions[i].x}
            y1={positions[i].y}
            x2={positions[i + 1].x}
            y2={positions[i + 1].y}
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </G>
      ))}
      {positions.map((pos, i) => {
        const day = i + 1;
        const isToday =
          year === currentYear && monthIndex === currentMonth && day === currentDay;
        const shadowOffset = 1.5;
        return (
          <G
            key={day}
            onPress={() => handleDayPress(day)}
            accessible={true}
            accessibilityLabel={`Day ${day}`}
          >
            <Circle
              cx={pos.x + shadowOffset}
              cy={pos.y + shadowOffset}
              r={CIRCLE_R}
              fill="rgba(0,0,0,0.35)"
            />
            {isToday && (
              <Circle
                cx={pos.x}
                cy={pos.y}
                r={CIRCLE_R + 3}
                fill="none"
                stroke="#007AFF"
                strokeWidth={2.5}
              />
            )}
            <Circle
              cx={pos.x}
              cy={pos.y}
              r={CIRCLE_R}
              fill="url(#sphereGrad)"
              stroke={isToday ? '#007AFF' : 'rgba(255,255,255,0.6)'}
              strokeWidth={isToday ? 2 : 1}
            />
            <Circle
              cx={pos.x - 3}
              cy={pos.y - 3}
              r={2.5}
              fill="rgba(255,255,255,0.8)"
            />
            <SvgText
              x={pos.x}
              y={pos.y}
              dy="0.35em"
              fill="#222"
              fontSize={11}
              fontWeight="600"
              textAnchor="middle"
            >
              {day}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

const PAGE_HEIGHT = SCREEN_HEIGHT;

export default function BetsScreen() {
  const insets = useSafeAreaInsets();
  const [currentYear] = useState(() => new Date().getFullYear());

  const months = useMemo(
    () =>
      MONTH_NAMES.map((name, index) => ({
        name,
        index,
      })),
    []
  );

  const floatingDateTop = Platform.OS === 'ios' ? insets.top + 4 : 44;

  const renderMonth = useCallback(
    ({ item: month }) => (
      <View style={[styles.monthPage, { height: PAGE_HEIGHT }]}>
        <View style={[styles.floatingDate, { top: floatingDateTop }]}>
          <Text style={styles.floatingDateText} numberOfLines={1}>
            {month.name} {currentYear}
          </Text>
        </View>
        <View style={styles.trailContainer}>
          <MonthTrail
            monthIndex={month.index}
            monthName={month.name}
            year={currentYear}
            contentHeight={PAGE_HEIGHT}
          />
        </View>
      </View>
    ),
    [currentYear, floatingDateTop]
  );

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
        data={months}
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
    backgroundColor: '#000',
  },
  monthPage: {
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  floatingDate: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  floatingDateText: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: 'rgba(38,38,38,0.95)',
    color: '#f5f5f5',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  trailContainer: {
    flex: 1,
    backgroundColor: '#000',
    minHeight: PAGE_HEIGHT,
    justifyContent: 'center',
  },
  trailSvg: {
    alignSelf: 'center',
  },
});

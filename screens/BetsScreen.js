import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, FlatList, Dimensions } from 'react-native';
import Svg, {
  Circle,
  Line,
  Text as SvgText,
  G,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Candy Crush-style: bigger nodes, wide stretching, fits on screen
const CIRCLE_R = 18;
const PADDING = 12;
const TRAIL_HEIGHT_RATIO = 0.84;

function getDaysInMonth(year, monthIndex) {
  if (monthIndex === 1) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[monthIndex] ?? 31;
}

// Trail bounds
function getTrailBounds(contentHeight) {
  const totalH = contentHeight * TRAIL_HEIGHT_RATIO;
  const top = (contentHeight - totalH) / 2;
  const innerH = totalH - 2 * PADDING;
  return { top, innerH };
}

// Organic meandering – STRETCHED left-right, compact vertical fit
function getCandyCrushPathPositions(count, contentWidth, contentHeight, variant = 0) {
  const w = contentWidth - 2 * PADDING;
  const { top, innerH } = getTrailBounds(contentHeight);
  
  const positions = [];
  
  // Define waypoints: EXTREME left-right stretching (edge to edge)
  const waypointsX = [];
  
  // Different meandering patterns – stretched to edges (5% to 95%)
  switch (variant % 4) {
    case 0: // Wide sweeps: far left to far right, stretched
      waypointsX.push(0.05, 0.95, 0.08, 0.92, 0.1, 0.9, 0.12);
      break;
    case 1: // Tight zigzag with extreme endpoints
      waypointsX.push(0.92, 0.08, 0.85, 0.15, 0.9, 0.05, 0.8);
      break;
    case 2: // Gradual sweep left to right, stretched
      waypointsX.push(0.08, 0.3, 0.6, 0.95, 0.65, 0.2, 0.1);
      break;
    default: // Mix of tight and wide curves, stretched
      waypointsX.push(0.85, 0.1, 0.92, 0.12, 0.88, 0.18, 0.82);
  }
  
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const y = top + PADDING + t * innerH;
    
    // Smooth interpolation between waypoints
    const segmentFloat = t * (waypointsX.length - 1);
    const segmentIdx = Math.floor(segmentFloat);
    const segmentT = segmentFloat - segmentIdx;
    
    const nextIdx = Math.min(segmentIdx + 1, waypointsX.length - 1);
    
    // Enhanced smooth interpolation (cubic hermite for natural curves)
    const easedT = segmentT * segmentT * (3 - 2 * segmentT);
    const xFactor = waypointsX[segmentIdx] + (waypointsX[nextIdx] - waypointsX[segmentIdx]) * easedT;
    
    // Add organic micro-variation for hand-placed feel
    const organicOffset = Math.sin(t * Math.PI * 12 + variant * 1.5) * 0.025;
    
    const x = PADDING + w * (xFactor + organicOffset);
    positions.push({ x, y });
  }
  
  return positions;
}

function MonthTrail({ monthIndex, monthName, year, contentHeight }) {
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
    return getCandyCrushPathPositions(dayCount, contentWidth, contentHeight, monthIndex);
  }, [monthIndex, dayCount, contentWidth, contentHeight]);

  const handleDayPress = useCallback(
    (day) => {
      // TODO: Add DayDetail screen navigation
      console.log('Day pressed:', { year, monthIndex, day });
    },
    [year, monthIndex]
  );

  // Candy Crush color palette for nodes
  const getNodeColor = useCallback((day) => {
    const colors = [
      '#4A90E2', // Blue
      '#50C878', // Green
      '#FF6B35', // Orange
      '#9B59B6', // Purple
      '#E74C3C', // Red
      '#F39C12', // Yellow-orange
      '#1ABC9C', // Teal
      '#E91E63', // Pink
    ];
    return colors[(day - 1) % colors.length];
  }, []);

  return (
    <Svg width={contentWidth} height={contentHeight} style={styles.trailSvg}>
      <Defs>
        {/* Generate gradients for each color */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
          const colors = [
            { base: '#4A90E2', light: '#7FB3FF', dark: '#2E5F99' },
            { base: '#50C878', light: '#7FE5A0', dark: '#2D8F4D' },
            { base: '#FF6B35', light: '#FF9A6E', dark: '#CC3D1A' },
            { base: '#9B59B6', light: '#C98EE0', dark: '#6C3483' },
            { base: '#E74C3C', light: '#FF7B6B', dark: '#B02E1F' },
            { base: '#F39C12', light: '#FFC04D', dark: '#C87F0A' },
            { base: '#1ABC9C', light: '#5FE6C8', dark: '#118C74' },
            { base: '#E91E63', light: '#FF5C8D', dark: '#B01548' },
          ];
          const c = colors[idx];
          return (
            <RadialGradient key={`grad-${idx}`} id={`candyGrad${idx}`} cx="35%" cy="28%" r="65%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <Stop offset="15%" stopColor={c.light} stopOpacity="1" />
              <Stop offset="70%" stopColor={c.base} stopOpacity="1" />
              <Stop offset="100%" stopColor={c.dark} stopOpacity="1" />
            </RadialGradient>
          );
        })}
      </Defs>
      {/* EXTREME 3D rope/path with depth */}
      {positions.slice(0, -1).map((_, i) => (
        <G key={`seg-${i}`}>
          {/* Deep shadow line (extreme offset) */}
          <Line
            x1={positions[i].x + 4}
            y1={positions[i].y + 8}
            x2={positions[i + 1].x + 4}
            y2={positions[i + 1].y + 8}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={8}
            strokeLinecap="round"
          />
          {/* Bottom layer of rope */}
          <Line
            x1={positions[i].x + 2}
            y1={positions[i].y + 4}
            x2={positions[i + 1].x + 2}
            y2={positions[i + 1].y + 4}
            stroke="rgba(200,200,200,0.8)"
            strokeWidth={6}
            strokeLinecap="round"
          />
          {/* Main thick top line */}
          <Line
            x1={positions[i].x}
            y1={positions[i].y}
            x2={positions[i + 1].x}
            y2={positions[i + 1].y}
            stroke="rgba(255,255,255,0.98)"
            strokeWidth={6}
            strokeLinecap="round"
          />
        </G>
      ))}
      {positions.map((pos, i) => {
        const day = i + 1;
        const isToday =
          year === currentYear && monthIndex === currentMonth && day === currentDay;
        const shadowOffset = 6;
        // EXTREME angled depth offset (down-right for dramatic perspective)
        const depthOffsetX = 5;
        const depthOffsetY = 10;
        const colorIdx = (day - 1) % 8;
        const gradientId = `candyGrad${colorIdx}`;
        
        // Get darker shade for base layer
        const baseColors = [
          '#2E5F99', '#2D8F4D', '#CC3D1A', '#6C3483', 
          '#B02E1F', '#C87F0A', '#118C74', '#B01548'
        ];
        const baseColor = baseColors[colorIdx];
        
        return (
          <G
            key={day}
            onPress={() => handleDayPress(day)}
            accessible={true}
            accessibilityLabel={`Day ${day}`}
          >
            {/* Drop shadow beneath everything (extreme angle) */}
            <Circle
              cx={pos.x + depthOffsetX + shadowOffset}
              cy={pos.y + depthOffsetY + shadowOffset}
              r={CIRCLE_R + 3}
              fill="rgba(0,0,0,0.45)"
            />
            
            {/* BOTTOM LAYER - Base/Foundation (extreme angled offset) */}
            <Circle
              cx={pos.x + depthOffsetX}
              cy={pos.y + depthOffsetY}
              r={CIRCLE_R + 3}
              fill={baseColor}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={1.5}
            />
            
            {/* Multiple transition layers for THICK 3D effect */}
            <Circle
              cx={pos.x + depthOffsetX * 0.8}
              cy={pos.y + depthOffsetY * 0.8}
              r={CIRCLE_R + 2.5}
              fill={baseColor}
              opacity={0.75}
            />
            <Circle
              cx={pos.x + depthOffsetX * 0.6}
              cy={pos.y + depthOffsetY * 0.6}
              r={CIRCLE_R + 2}
              fill={baseColor}
              opacity={0.6}
            />
            <Circle
              cx={pos.x + depthOffsetX * 0.4}
              cy={pos.y + depthOffsetY * 0.4}
              r={CIRCLE_R + 1.5}
              fill={baseColor}
              opacity={0.45}
            />
            <Circle
              cx={pos.x + depthOffsetX * 0.2}
              cy={pos.y + depthOffsetY * 0.2}
              r={CIRCLE_R + 1}
              fill={baseColor}
              opacity={0.3}
            />
            
            {/* TOP LAYER - White ring/border */}
            <Circle
              cx={pos.x}
              cy={pos.y}
              r={CIRCLE_R + 2}
              fill="#ffffff"
              stroke="rgba(0,0,0,0.15)"
              strokeWidth={1.5}
            />
            
            {/* TOP LAYER - Colored candy sphere with glossy gradient */}
            <Circle
              cx={pos.x}
              cy={pos.y}
              r={CIRCLE_R - 1}
              fill={`url(#${gradientId})`}
            />
            
            {isToday && (
              <Circle
                cx={pos.x}
                cy={pos.y}
                r={CIRCLE_R + 6}
                fill="none"
                stroke="#FFD700"
                strokeWidth={3.5}
              />
            )}
            
            {/* Top glossy highlight */}
            <Circle
              cx={pos.x - 5}
              cy={pos.y - 5}
              r={4.5}
              fill="rgba(255,255,255,0.75)"
            />
            
            {/* White number with subtle dark stroke */}
            <SvgText
              x={pos.x}
              y={pos.y}
              dy="0.35em"
              fill="#ffffff"
              fontSize={15}
              fontWeight="900"
              textAnchor="middle"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={0.6}
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
  const [currentYear] = useState(() => new Date().getFullYear());
  const currentMonth = useMemo(() => new Date().getMonth(), []);

  const months = useMemo(
    () =>
      MONTH_NAMES.map((name, index) => ({
        name,
        index,
      })),
    []
  );

  const renderMonth = useCallback(
    ({ item: month }) => (
      <View style={[styles.monthPage, { height: PAGE_HEIGHT }]}>
        <View style={styles.floatingDate}>
          <Text style={styles.floatingDateText}>
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
    [currentYear]
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
        initialScrollIndex={currentMonth}
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
    transform: [{ perspective: 600 }, { rotateX: '28deg' }, { scale: 1.15 }],
  },
  floatingDate: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    transform: [{ perspective: 600 }, { rotateX: '28deg' }, { scale: 1.15 }],
  },
  floatingDateText: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(50,50,50,0.92)',
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    overflow: 'hidden',
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

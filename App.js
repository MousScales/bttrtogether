import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import GoalsScreen from './screens/GoalsScreen';
import ProfileScreen from './screens/ProfileScreen';
import BetsScreen from './screens/BetsScreen';
import DayDetailScreen from './screens/DayDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function BetsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BetsCalendar" component={BetsScreen} />
      <Stack.Screen
        name="DayDetail"
        component={DayDetailScreen}
        options={({ route }) => ({
          headerShown: true,
          headerTitle: route.params
            ? `${route.params.day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][route.params.monthIndex]} ${route.params.year}`
            : 'Day',
        })}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: 'gray',
        }}
      >
        <Tab.Screen 
          name="Goals" 
          component={GoalsScreen}
          options={{
            headerTitle: 'List of Goals',
          }}
        />
        <Tab.Screen 
          name="Bets" 
          component={BetsStack}
          options={{ headerShown: false }}
        />
        <Tab.Screen 
          name="Profile" 
          component={ProfileScreen}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

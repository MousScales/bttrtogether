import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

import GoalsScreen from './screens/GoalsScreen';
import ProfileScreen from './screens/ProfileScreen';
import BetsScreen from './screens/BetsScreen';

const Tab = createBottomTabNavigator();

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
          component={BetsScreen}
        />
        <Tab.Screen 
          name="Profile" 
          component={ProfileScreen}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

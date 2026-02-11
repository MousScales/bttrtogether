import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { supabase } from './lib/supabase';
import { STRIPE_PUBLISHABLE_KEY } from './lib/stripe';

import GoalsScreen from './screens/GoalsScreen';
import ProfileScreen from './screens/ProfileScreen';
import ProgressScreen from './screens/ProgressScreen';
import GoalPostScreen from './screens/GoalPostScreen';
import UserGoalsScreen from './screens/UserGoalsScreen';
import CreateGoalListScreen from './screens/CreateGoalListScreen';
import LoginScreen from './screens/LoginScreen';
import SettingsScreen from './screens/SettingsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import AddFriendsToGoalScreen from './screens/AddFriendsToGoalScreen';
import AddFriendsStepScreen from './screens/AddFriendsStepScreen';
import GroupGoalPaymentScreen from './screens/GroupGoalPaymentScreen';
import PayoutScreen from './screens/PayoutScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

function GoalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GoalsHome" component={GoalsScreen} />
      <Stack.Screen 
        name="GoalPost" 
        component={GoalPostScreen}
        options={{
          presentation: 'modal',
        }}
      />
      <Stack.Screen name="UserGoals" component={UserGoalsScreen} />
      <Stack.Screen 
        name="CreateGoalList" 
        component={CreateGoalListScreen}
        options={{
          presentation: 'fullScreenModal',
        }}
      />
      <Stack.Screen 
        name="AddFriendsToGoal" 
        component={AddFriendsToGoalScreen}
        options={{
          presentation: 'modal',
        }}
      />
      <Stack.Screen 
        name="AddFriendsStep" 
        component={AddFriendsStepScreen}
        options={{
          presentation: 'modal',
        }}
      />
      <Stack.Screen 
        name="GroupGoalPayment" 
        component={GroupGoalPaymentScreen}
        options={{
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen 
        name="Payout" 
        component={PayoutScreen}
        options={{
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            if (route.name === 'Goals') {
              iconName = focused ? 'flag' : 'flag-outline';
          } else if (route.name === 'Progress') {
            iconName = focused ? 'trail-sign' : 'trail-sign-outline';
            } else if (route.name === 'Profile') {
              iconName = focused ? 'person' : 'person-outline';
            }

          return <Ionicons name={iconName} size={28} color={color} />;
          },
          tabBarActiveTintColor: '#ffffff',
          tabBarInactiveTintColor: '#666666',
        tabBarShowLabel: false,
          tabBarStyle: {
          position: 'absolute',
          bottom: 30,
          alignSelf: 'center',
          width: 280,
          marginLeft: 75,
          backgroundColor: '#1a1a1a',
          borderRadius: 35,
          height: 65,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: '#333333',
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowOpacity: 0.4,
          shadowRadius: 10,
          elevation: 10,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 10,
        },
        tabBarItemStyle: {
          height: 65,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 0,
          paddingBottom: 0,
          },
          headerStyle: {
            backgroundColor: '#000000',
          },
          headerTintColor: '#ffffff',
          headerTitleStyle: {
            fontWeight: '500',
          },
        })}
      >
        <Tab.Screen 
          name="Goals" 
          component={GoalsStack}
          options={{
            headerShown: false,
          }}
        />
        <Tab.Screen 
        name="Progress" 
        component={ProgressScreen}
          options={{
            headerShown: false,
          }}
        />
        <Tab.Screen 
          name="Profile" 
        component={ProfileStack}
          options={{
            headerShown: false,
          }}
        />
      </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasGoals, setHasGoals] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      await checkProfileAndGoals(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      await checkProfileAndGoals(session);
    });

    return () => subscription.unsubscribe();
  }, [refetchTrigger]);

  // Poll for profile and goal updates every 2 seconds when onboarding
  useEffect(() => {
    if (session && (!hasProfile || !hasGoals)) {
      const interval = setInterval(async () => {
        await checkProfileAndGoals(session);
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [session, hasProfile, hasGoals]);

  const checkProfileAndGoals = async (session) => {
    if (session) {
      // Check if user has completed onboarding
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      
      setHasProfile(!!profile);

      // Check if user has created goals OR is a participant in any goal lists
      if (profile) {
        // Check for owned goal lists
        const { data: ownedGoals } = await supabase
          .from('goal_lists')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1);
        
        // Check for participant goal lists
        const { data: participantGoals } = await supabase
          .from('group_goal_participants')
          .select('goal_list_id')
          .eq('user_id', session.user.id)
          .limit(1);
        
        setHasGoals((ownedGoals && ownedGoals.length > 0) || (participantGoals && participantGoals.length > 0));
      } else {
        setHasGoals(false);
      }
    } else {
      setHasProfile(false);
      setHasGoals(false);
    }
  };

  if (loading) {
    return null; // Or a loading screen
  }

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier="merchant.com.mousscales.bttrtogether"
    >
      <NavigationContainer>
        <StatusBar style="light" />
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {!session ? (
            <RootStack.Screen name="Login" component={LoginScreen} />
          ) : !hasProfile ? (
            <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
          ) : !hasGoals ? (
            <RootStack.Screen name="CreateGoalList" component={CreateGoalListScreen} />
          ) : (
            <RootStack.Screen name="MainApp" component={MainTabs} />
          )}
        </RootStack.Navigator>
    </NavigationContainer>
    </StripeProvider>
  );
}

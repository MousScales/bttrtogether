import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator, SafeAreaView, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function OnboardingScreen({ navigation }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: name, 2: username, 3: pfp
  const proceedAnim = useRef(new Animated.Value(0)).current;

  // Animate proceed button based on input
  useEffect(() => {
    let shouldShow = false;
    
    if (step === 1 && name.trim() !== '') {
      shouldShow = true;
    } else if (step === 2 && username.trim() !== '') {
      shouldShow = true;
    } else if (step === 3) {
      shouldShow = true; // Always show on photo step
    }

    if (shouldShow) {
      Animated.spring(proceedAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      Animated.timing(proceedAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [name, username, step]);

  const getStepLabel = () => {
    switch(step) {
      case 1: return 'Name';
      case 2: return 'Username';
      case 3: return 'Photo';
      default: return '';
    }
  };

  const handleContinue = async () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert('Error', 'Please enter your name');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!username.trim()) {
        Alert.alert('Error', 'Please enter a username');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      // Save profile to Supabase
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            name: name.trim(),
            username: username.trim().toLowerCase(),
            updated_at: new Date().toISOString(),
          });

        setLoading(false);

        if (error) {
          Alert.alert('Error', error.message);
        }
        // App.js will automatically navigate to CreateGoalList after profile is saved
      }
    }
  };

  const handleSkipPhoto = async () => {
    // Save profile without photo
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          name: name.trim(),
          username: username.trim().toLowerCase(),
          updated_at: new Date().toISOString(),
        });

      setLoading(false);

      if (error) {
        Alert.alert('Error', error.message);
      }
      // App.js will automatically navigate to CreateGoalList after profile is saved
    }
  };

  const handleAddPhoto = () => {
    Alert.alert('Photo Picker', 'Photo picker is temporarily disabled for design phase');
    // Will implement photo picker later
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        {step > 1 ? (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#ffffff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>CREATE A PROFILE</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {/* Progress Indicator - Square boxes like goal creation */}
      <View style={styles.progressContainer}>
        {[1, 2, 3].map((num) => (
          <View
            key={num}
            style={[
              styles.progressSquare,
              num < step && styles.progressSquareCompleted,
              num === step && styles.progressSquareCurrent,
              num > step && styles.progressSquareFuture,
            ]}
          />
        ))}
      </View>

      {/* Content based on step */}
      <View style={styles.content}>
        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>What's your name?</Text>
            <View>
              <TextInput
                style={styles.input}
                placeholderTextColor="#666666"
                value={name}
                onChangeText={setName}
                textAlign="center"
                autoFocus
              />
              <Animated.View
                style={[
                  styles.proceedButton,
                  {
                    opacity: proceedAnim,
                    transform: [
                      {
                        translateY: proceedAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      },
                    ],
                  },
                ]}
                pointerEvents={name.trim() !== '' ? 'auto' : 'none'}
              >
                <TouchableOpacity 
                  style={styles.proceedButtonInner}
                  onPress={handleContinue}
                >
                  <Text style={styles.proceedButtonText}>Proceed</Text>
                  <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                </TouchableOpacity>
              </Animated.View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>Pick a username</Text>
            <View>
              <TextInput
                style={styles.input}
                placeholderTextColor="#666666"
                value={username}
                onChangeText={setUsername}
                textAlign="center"
                autoCapitalize="none"
                autoFocus
              />
              <Animated.View
                style={[
                  styles.proceedButton,
                  {
                    opacity: proceedAnim,
                    transform: [
                      {
                        translateY: proceedAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      },
                    ],
                  },
                ]}
                pointerEvents={username.trim() !== '' ? 'auto' : 'none'}
              >
                <TouchableOpacity 
                  style={styles.proceedButtonInner}
                  onPress={handleContinue}
                >
                  <Text style={styles.proceedButtonText}>Proceed</Text>
                  <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                </TouchableOpacity>
              </Animated.View>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.stepTitle}>Add a profile photo</Text>
            
            <TouchableOpacity 
              style={styles.photoCircle}
              onPress={handleAddPhoto}
            >
              <Ionicons name="camera" size={48} color="#666666" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleAddPhoto} style={styles.addPhotoButton}>
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>

            <View style={styles.bottomButtonsPhoto}>
              <TouchableOpacity 
                style={styles.skipButton}
                onPress={handleSkipPhoto}
                disabled={loading}
              >
                <Text style={styles.skipButtonText}>Skip for now</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.finishButton, loading && styles.buttonDisabled]}
                onPress={handleContinue}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.proceedButtonText}>Finish</Text>
                    <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  progressSquare: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  progressSquareCompleted: {
    backgroundColor: '#4CAF50',
  },
  progressSquareCurrent: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  progressSquareFuture: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444444',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#333333',
    textAlign: 'center',
  },
  proceedButton: {
    position: 'absolute',
    bottom: -50,
    right: 0,
  },
  proceedButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  proceedButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  photoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    marginTop: 40,
  },
  addPhotoButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    marginBottom: 40,
  },
  addPhotoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  bottomButtonsPhoto: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 40,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});


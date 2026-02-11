import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Image, Alert } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
// import * as ImagePicker from 'expo-image-picker';

export default function GoalPostScreen({ route, navigation }) {
  const { goal } = route.params;
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState([]);

  const pickMedia = async () => {
    // Commented out for design phase
    Alert.alert('Image Picker', 'Image picker is temporarily disabled for design phase');
    
    // const result = await ImagePicker.launchImageLibraryAsync({
    //   mediaTypes: ImagePicker.MediaTypeOptions.All,
    //   allowsMultipleSelection: true,
    //   quality: 1,
    // });

    // if (!result.canceled) {
    //   setMedia([...media, ...result.assets]);
    // }
  };

  const removeMedia = (index) => {
    setMedia(media.filter((_, i) => i !== index));
  };

  const handlePost = () => {
    // TODO: Upload media and save post to Supabase
    console.log('Posting:', { goal: goal.title, caption, media });
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="close" size={28} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
        <TouchableOpacity 
          onPress={handlePost} 
          style={[styles.headerButton, styles.postButton]}
          disabled={!caption && media.length === 0}
        >
          <Text style={[
            styles.postButtonText,
            (!caption && media.length === 0) && styles.postButtonDisabled
          ]}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Goal Achievement Header */}
        <View style={styles.achievementBanner}>
          <Text style={styles.achievementGoal}>{goal.title}</Text>
        </View>

        {/* Caption Input - Now at top */}
        <View style={styles.captionSection}>
          <Text style={styles.sectionLabel}>Tell your story</Text>
          <TextInput
            style={styles.captionInput}
            placeholder="Share how you achieved this goal..."
            placeholderTextColor="#555555"
            multiline
            value={caption}
            onChangeText={setCaption}
            textAlignVertical="top"
          />
        </View>

        {/* Media Section */}
        <View style={styles.mediaSection}>
          <Text style={styles.sectionLabel}>Add proof</Text>
          
          {media.length > 0 ? (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaScrollContent}
            >
              {media.map((item, index) => (
                <View key={index} style={styles.mediaCard}>
                  <Image source={{ uri: item.uri }} style={styles.mediaImage} />
                  <TouchableOpacity 
                    style={styles.removeMediaButton}
                    onPress={() => removeMedia(index)}
                  >
                    <Ionicons name="close-circle" size={28} color="#FF4444" />
                  </TouchableOpacity>
                  {item.type === 'video' && (
                    <View style={styles.videoIndicator}>
                      <Ionicons name="play-circle" size={40} color="#ffffff" />
                    </View>
                  )}
                </View>
              ))}
              <TouchableOpacity style={styles.addMoreButton} onPress={pickMedia}>
                <Ionicons name="add-circle-outline" size={48} color="#666666" />
                <Text style={styles.addMoreText}>Add more</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <TouchableOpacity style={styles.mediaUploadCard} onPress={pickMedia}>
              <View style={styles.uploadIconContainer}>
                <Ionicons name="camera-outline" size={48} color="#ffffff" />
              </View>
              <Text style={styles.uploadTitle}>Add photos or videos</Text>
              <Text style={styles.uploadSubtitle}>Show proof of your achievement</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  headerButton: {
    width: 80,
  },
  headerSpacer: {
    flex: 1,
  },
  postButton: {
    alignItems: 'flex-end',
  },
  postButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
  postButtonDisabled: {
    color: '#333333',
  },
  content: {
    flex: 1,
  },
  achievementBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    padding: 16,
  },
  achievementGoal: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  captionSection: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  captionInput: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 16,
    padding: 20,
    fontSize: 16,
    color: '#ffffff',
    minHeight: 140,
    lineHeight: 24,
  },
  mediaSection: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  mediaUploadCard: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#2a2a2a',
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  uploadSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666666',
  },
  mediaScrollContent: {
    paddingRight: 16,
    gap: 12,
  },
  mediaCard: {
    width: 280,
    height: 360,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  removeMediaButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 14,
  },
  videoIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
  },
  addMoreButton: {
    width: 140,
    height: 360,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#2a2a2a',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    marginTop: 8,
  },
});


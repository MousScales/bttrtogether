import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useState } from 'react';

export default function GoalsScreen() {
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Morning workout', completed: false },
    { id: 2, title: 'Read for 30 minutes', completed: false },
    { id: 3, title: 'Drink 8 glasses of water', completed: false },
    { id: 4, title: 'Complete work project', completed: false },
    { id: 5, title: 'Call a friend', completed: false },
  ]);

  const [selectedFriend, setSelectedFriend] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const friends = [
    { 
      id: 1, 
      name: 'Sarah M.', 
      tasks: [
        { id: 1, title: 'Morning run', completed: false },
        { id: 2, title: 'Gym session', completed: false },
        { id: 3, title: 'Meal prep', completed: true },
        { id: 4, title: 'Yoga practice', completed: false },
        { id: 5, title: 'Track calories', completed: false },
      ],
      avatar: '👩' 
    },
    { 
      id: 2, 
      name: 'Mike R.', 
      tasks: [
        { id: 1, title: 'Study React', completed: true },
        { id: 2, title: 'Build project', completed: false },
        { id: 3, title: 'Code review', completed: false },
        { id: 4, title: 'Update portfolio', completed: false },
        { id: 5, title: 'Practice algorithms', completed: true },
      ],
      avatar: '👨' 
    },
    { 
      id: 3, 
      name: 'Emma L.', 
      tasks: [
        { id: 1, title: 'Spanish lesson', completed: true },
        { id: 2, title: 'Practice vocab', completed: false },
        { id: 3, title: 'Watch movie', completed: false },
        { id: 4, title: 'Study grammar', completed: false },
        { id: 5, title: 'Conversation practice', completed: true },
      ],
      avatar: '👧' 
    },
    { 
      id: 4, 
      name: 'James K.', 
      tasks: [
        { id: 1, title: 'Read chapter', completed: false },
        { id: 2, title: 'Take notes', completed: false },
        { id: 3, title: 'Book review', completed: true },
        { id: 4, title: 'Join book club', completed: false },
        { id: 5, title: 'Update reading list', completed: false },
      ],
      avatar: '🧑' 
    },
  ];

  const toggleTask = (id) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const openFriendModal = (friend) => {
    setSelectedFriend(friend);
    setModalVisible(true);
  };

  const closeFriendModal = () => {
    setModalVisible(false);
    setSelectedFriend(null);
  };

  const toggleFriendTask = (taskId, status) => {
    if (selectedFriend) {
      const updatedTasks = selectedFriend.tasks.map(task =>
        task.id === taskId ? { ...task, completed: status } : task
      );
      setSelectedFriend({ ...selectedFriend, tasks: updatedTasks });
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Daily Tasks Section */}
      <View style={styles.section}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Daily Tasks</Text>
        </View>
        
        <View style={styles.taskListContainer}>
          {tasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[styles.taskButton, task.completed && styles.taskButtonCompleted]}
              onPress={() => toggleTask(task.id)}
              activeOpacity={0.7}
            >
              <View style={styles.taskContent}>
                <View style={[styles.checkbox, task.completed && styles.checkboxCompleted]}>
                  {task.completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={[styles.taskText, task.completed && styles.taskTextCompleted]}>
                  {task.title}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Friends Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Friends' Tasks</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
        >
          {friends.map((friend) => (
            <View key={friend.id} style={styles.friendContainer}>
              <TouchableOpacity
                style={styles.friendSquare}
                activeOpacity={0.7}
                onPress={() => openFriendModal(friend)}
              >
                <View style={styles.miniTaskList}>
                  {friend.tasks.slice(0, 3).map((task, index) => (
                    <View key={index} style={styles.miniTask}>
                      <View style={styles.miniCheckbox} />
                      <Text style={styles.miniTaskText} numberOfLines={1}>
                        {task.title}
                      </Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
              <Text style={styles.friendName}>{friend.name}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Friend Task Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeFriendModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedFriend?.name}'s Tasks
              </Text>
              <TouchableOpacity onPress={closeFriendModal} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalTaskList}>
              {selectedFriend?.tasks.map((task) => (
                <View key={task.id} style={styles.modalTaskItem}>
                  <View style={styles.modalTaskLeft}>
                    <Text style={[styles.modalTaskText, task.completed && styles.modalTaskTextCompleted]}>
                      {task.title}
                    </Text>
                  </View>
                  <View style={styles.modalTaskRight}>
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.placeholderText}>📷</Text>
                    </View>
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.doneButton]}
                        onPress={() => toggleFriendTask(task.id, true)}
                      >
                        <Text style={styles.actionButtonText}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.notDoneButton]}
                        onPress={() => toggleFriendTask(task.id, false)}
                      >
                        <Text style={styles.actionButtonText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    marginBottom: 24,
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 8,
  },
  taskListContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  taskButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  taskButtonCompleted: {
    backgroundColor: '#f0f9ff',
    opacity: 0.8,
  },
  taskContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCompleted: {
    backgroundColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  taskText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  taskTextCompleted: {
    color: '#666',
    textDecorationLine: 'line-through',
  },
  carouselContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  friendContainer: {
    marginRight: 16,
    alignItems: 'center',
  },
  friendSquare: {
    width: 160,
    height: 160,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    justifyContent: 'center',
  },
  miniTaskList: {
    flex: 1,
    justifyContent: 'center',
  },
  miniTask: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  miniCheckbox: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#007AFF',
    marginRight: 8,
  },
  miniTaskText: {
    fontSize: 12,
    color: '#333',
    flex: 1,
  },
  friendName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
  },
  modalTaskList: {
    paddingHorizontal: 20,
  },
  modalTaskItem: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  modalTaskLeft: {
    flex: 1,
    marginRight: 12,
  },
  modalTaskText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  modalTaskTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  modalTaskRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imagePlaceholder: {
    width: 50,
    height: 50,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  placeholderText: {
    fontSize: 24,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  doneButton: {
    backgroundColor: '#4CAF50',
  },
  notDoneButton: {
    backgroundColor: '#FF5252',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});


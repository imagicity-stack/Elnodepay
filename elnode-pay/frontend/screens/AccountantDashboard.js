import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const AccountantDashboard = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState([]);

  useEffect(() => {
    const usersQuery = query(collection(db, 'users'), where('role', '==', 'parent'));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStudents(data);
    });
    return () => unsubscribe();
  }, []);

  const filteredStudents = students.filter((student) =>
    student.student_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddDue = async (studentId) => {
    const docRef = doc(db, 'users', studentId);
    const studentDoc = await getDoc(docRef);
    if (studentDoc.exists()) {
      const currentDue = studentDoc.data().total_due || 0;
      await updateDoc(docRef, { total_due: currentDue + 1000 });
    }
  };

  const renderStudent = ({ item }) => (
    <View style={styles.studentCard}>
      <View>
        <Text style={styles.studentName}>{item.student_name}</Text>
        <Text style={styles.studentMeta}>Class: {item.class}</Text>
        <Text style={styles.studentMeta}>Parent: {item.name}</Text>
        <Text style={styles.studentMeta}>Pending: ₹{item.total_due ?? 0}</Text>
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => handleAddDue(item.id)}>
          <Text style={styles.secondaryButtonText}>Add Due</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Send Reminder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Accountant Tools</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by student name"
        placeholderTextColor="#999999"
        value={searchTerm}
        onChangeText={setSearchTerm}
      />
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.id}
        renderItem={renderStudent}
        ListEmptyComponent={<Text style={styles.emptyText}>No matching students found.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 24
  },
  heading: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: '#A31F36',
    marginBottom: 16
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#A31F36',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 16,
    color: '#333333'
  },
  studentCard: {
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1
  },
  studentName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
    color: '#A31F36'
  },
  studentMeta: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: '#555555',
    marginTop: 4
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'flex-end'
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#A31F36',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginRight: 8
  },
  secondaryButtonText: {
    fontFamily: 'Poppins_500Medium',
    color: '#A31F36'
  },
  primaryButton: {
    backgroundColor: '#A31F36',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10
  },
  primaryButtonText: {
    fontFamily: 'Poppins_500Medium',
    color: '#FFFFFF'
  },
  emptyText: {
    textAlign: 'center',
    color: '#888888',
    fontFamily: 'Poppins_400Regular',
    marginTop: 24
  }
});

export default AccountantDashboard;

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const ParentDashboard = () => {
  const [parentProfile, setParentProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    // Replace with authenticated user's ID
    const userId = 'demo-parent-id';
    const userDocRef = doc(db, 'users', userId);

    const unsubscribeUser = onSnapshot(userDocRef, (snapshot) => {
      setParentProfile(snapshot.exists() ? snapshot.data() : null);
    });

    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('user_id', '==', userId)
    );

    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const txns = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setTransactions(txns);
    });

    return () => {
      unsubscribeUser();
      unsubscribeTransactions();
    };
  }, []);

  const renderTransaction = ({ item }) => (
    <View style={styles.transactionCard}>
      <Text style={styles.transactionAmount}>₹{item.amount}</Text>
      <Text style={styles.transactionMeta}>{item.date}</Text>
      <Text style={[styles.transactionStatus, item.status === 'paid' ? styles.paid : styles.pending]}>
        {item.status.toUpperCase()}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Hello, {parentProfile?.name || 'Parent'} 👋</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pending Fees</Text>
        <Text style={styles.cardAmount}>₹{parentProfile?.total_due ?? '0.00'}</Text>
        <Text style={styles.cardMeta}>Next Due Date: {parentProfile?.next_due_date || 'N/A'}</Text>
        <TouchableOpacity style={styles.payButton}>
          <Text style={styles.payButtonText}>Pay Now</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionTitle}>Payment History</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        ListEmptyComponent={<Text style={styles.emptyText}>No transactions yet.</Text>}
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
  card: {
    backgroundColor: '#A31F36',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Poppins_500Medium'
  },
  cardAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontFamily: 'Poppins_700Bold',
    marginVertical: 8
  },
  cardMeta: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_400Regular',
    marginBottom: 16
  },
  payButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  payButtonText: {
    color: '#A31F36',
    fontFamily: 'Poppins_700Bold',
    fontSize: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_500Medium',
    color: '#A31F36',
    marginBottom: 12
  },
  transactionCard: {
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  transactionAmount: {
    fontSize: 18,
    fontFamily: 'Poppins_500Medium',
    color: '#111111'
  },
  transactionMeta: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: '#666666',
    marginTop: 4
  },
  transactionStatus: {
    marginTop: 8,
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    letterSpacing: 1.1
  },
  paid: {
    color: '#2ecc71'
  },
  pending: {
    color: '#e67e22'
  },
  emptyText: {
    textAlign: 'center',
    color: '#888888',
    fontFamily: 'Poppins_400Regular',
    marginTop: 32
  }
});

export default ParentDashboard;

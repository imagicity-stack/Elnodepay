import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { signInWithEmailAndPassword, signInWithPhoneNumber } from 'firebase/auth';
import app, { auth } from '../firebaseConfig';

const LoginScreen = ({ navigation, route }) => {
  const role = route.params?.role || 'parent';
  const firebaseConfig = app?.options;
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const recaptchaVerifier = useRef(null);

  const handleParentLogin = async () => {
    try {
      if (!confirmationResult) {
        if (!phoneNumber) {
          Alert.alert('Missing phone number', 'Please enter a valid phone number to receive OTP.');
          return;
        }
        const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier.current);
        setConfirmationResult(result);
        Alert.alert('OTP sent', 'Enter the OTP you received to continue.');
      } else {
        if (!otp) {
          Alert.alert('Missing OTP', 'Please enter the OTP to sign in.');
          return;
        }
        await confirmationResult.confirm(otp);
        navigation.replace('ParentDashboard');
      }
    } catch (error) {
      Alert.alert('Login error', error.message);
    }
  };

  const handleAccountantLogin = async () => {
    try {
      if (!email || !password) {
        Alert.alert('Missing fields', 'Enter your email and password.');
        return;
      }
      await signInWithEmailAndPassword(auth, email, password);
      navigation.replace('AccountantDashboard');
    } catch (error) {
      Alert.alert('Login error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{role === 'parent' ? 'Parent Login' : 'Accountant Login'}</Text>
      {role === 'parent' ? (
        <View style={styles.form}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. +91 99999 99999"
            placeholderTextColor="#999999"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
          />
          {confirmationResult && (
            <>
              <Text style={styles.label}>OTP</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter OTP"
                placeholderTextColor="#999999"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
              />
            </>
          )}
          <TouchableOpacity style={styles.button} onPress={handleParentLogin}>
            <Text style={styles.buttonText}>{confirmationResult ? 'Verify OTP' : 'Send OTP'}</Text>
          </TouchableOpacity>
          <FirebaseRecaptchaVerifierModal
            ref={recaptchaVerifier}
            firebaseConfig={firebaseConfig}
            attemptInvisibleVerification
          />
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="accountant@eldenheights.edu"
            placeholderTextColor="#999999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor="#999999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={handleAccountantLogin}>
            <Text style={styles.buttonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 24
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: '#A31F36',
    marginBottom: 24
  },
  form: {
    marginTop: 16
  },
  label: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: '#A31F36',
    marginBottom: 4
  },
  input: {
    borderWidth: 1,
    borderColor: '#A31F36',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 16,
    color: '#333333'
  },
  button: {
    backgroundColor: '#A31F36',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_500Medium',
    fontSize: 16
  }
});

export default LoginScreen;
